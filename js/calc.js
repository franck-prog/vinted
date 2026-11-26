/*
 * Suivi Vinted — fonctions de calcul pures (aucun accès au DOM).
 * Utilisable dans le navigateur (window.VintedCalc) et dans Node (require) pour les tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VintedCalc = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STATUTS = [
    { id: 'stock', label: 'En stock' },
    { id: 'en_ligne', label: 'En ligne' },
    { id: 'reserve', label: 'Réservé' },
    { id: 'vendu', label: 'Vendu · à expédier' },
    { id: 'expedie', label: 'Expédié' },
    { id: 'finalise', label: 'Finalisé · payé' },
    { id: 'annule', label: 'Annulé / retourné' },
  ];
  const STATUT_IDS = new Set(STATUTS.map((s) => s.id));
  const VENDUS = new Set(['vendu', 'expedie', 'finalise']);
  const INVENDUS = new Set(['stock', 'en_ligne', 'reserve']);
  const EN_ATTENTE = new Set(['vendu', 'expedie']);

  // Seuils DAC7 : au-delà, la plateforme transmet les données de vente au fisc.
  const DAC7 = { ventes: 30, montant: 2000 };

  function num(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (v == null) return 0;
    const n = parseFloat(String(v).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }

  function sum(list, fn) {
    return round2(list.reduce((acc, x) => acc + fn(x), 0));
  }

  function isVendu(a) {
    return VENDUS.has(a.statut);
  }

  function isInvendu(a) {
    return INVENDUS.has(a.statut);
  }

  /** Bénéfice d'un article vendu : prix de vente − prix d'achat − frais annexes. */
  function benefice(a) {
    if (!isVendu(a)) return null;
    return round2(num(a.prixVente) - num(a.prixAchat) - num(a.frais));
  }

  /** Bénéfice potentiel d'un article invendu au prix affiché. */
  function beneficePotentiel(a) {
    if (!isInvendu(a) || !num(a.prixAffiche)) return null;
    return round2(num(a.prixAffiche) - num(a.prixAchat) - num(a.frais));
  }

  function parseDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }

  function joursEntre(debut, fin) {
    const a = parseDate(debut);
    const b = parseDate(fin);
    if (a == null || b == null) return null;
    return Math.round((b - a) / 86400000);
  }

  function dateDebut(a) {
    return a.dateMiseEnLigne || a.dateAchat || null;
  }

  /** Nombre de jours entre la mise en ligne (ou l'achat) et la vente. */
  function delaiVente(a) {
    if (!isVendu(a)) return null;
    const d = joursEntre(dateDebut(a), a.dateVente);
    return d != null && d >= 0 ? d : null;
  }

  /** Nombre de jours depuis la mise en ligne (ou l'achat) d'un article invendu. */
  function anciennete(a, aujourdhui) {
    if (!isInvendu(a)) return null;
    const d = joursEntre(dateDebut(a), aujourdhui);
    return d != null && d >= 0 ? d : null;
  }

  /** period : 'all' ou une année ('2026'). */
  function dansPeriode(date, period) {
    if (period == null || period === 'all') return true;
    return typeof date === 'string' && date.slice(0, 4) === String(period);
  }

  function computeStats(articles, depenses, period, aujourdhui) {
    const ventes = articles.filter((a) => isVendu(a) && dansPeriode(a.dateVente, period));
    const ca = sum(ventes, (a) => num(a.prixVente));
    const coutAchat = sum(ventes, (a) => num(a.prixAchat));
    const fraisArticles = sum(ventes, (a) => num(a.frais));
    const beneficeBrut = round2(ca - coutAchat - fraisArticles);
    const deps = depenses.filter((d) => dansPeriode(d.date, period));
    const totalDepenses = sum(deps, (d) => num(d.montant));
    const beneficeNet = round2(beneficeBrut - totalDepenses);

    const delais = ventes.map(delaiVente).filter((d) => d != null);
    const stock = articles.filter(isInvendu);
    const attente = articles.filter((a) => EN_ATTENTE.has(a.statut));
    const anciens = stock.map((a) => anciennete(a, aujourdhui)).filter((d) => d != null);

    return {
      nbVentes: ventes.length,
      ca,
      coutAchat,
      fraisArticles,
      beneficeBrut,
      totalDepenses,
      beneficeNet,
      margeNette: ca > 0 ? beneficeNet / ca : null,
      roi: coutAchat > 0 ? beneficeBrut / coutAchat : null,
      panierMoyen: ventes.length ? round2(ca / ventes.length) : null,
      delaiMoyen: delais.length ? Math.round(delais.reduce((x, y) => x + y, 0) / delais.length) : null,
      nbStock: stock.length,
      valeurStock: sum(stock, (a) => num(a.prixAchat)),
      valeurAffichee: sum(stock, (a) => num(a.prixAffiche)),
      stockAncien: anciens.filter((d) => d >= 60).length,
      nbAttente: attente.length,
      montantAttente: sum(attente, (a) => num(a.prixVente)),
    };
  }

  function moisKey(y, m) {
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  /** Liste des mois 'AAAA-MM' affichés : l'année choisie, ou les 12 derniers mois. */
  function moisPourPeriode(period, aujourdhui) {
    const out = [];
    if (period != null && period !== 'all') {
      for (let m = 1; m <= 12; m++) out.push(moisKey(Number(period), m));
      return out;
    }
    let y = Number(aujourdhui.slice(0, 4));
    let m = Number(aujourdhui.slice(5, 7));
    for (let i = 0; i < 12; i++) {
      out.unshift(moisKey(y, m));
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
    return out;
  }

  function serieMensuelle(articles, depenses, mois) {
    return mois.map((key) => {
      const ventes = articles.filter((a) => isVendu(a) && typeof a.dateVente === 'string' && a.dateVente.startsWith(key));
      const deps = depenses.filter((d) => typeof d.date === 'string' && d.date.startsWith(key));
      const ca = sum(ventes, (a) => num(a.prixVente));
      const brut = sum(ventes, (a) => benefice(a));
      const dep = sum(deps, (d) => num(d.montant));
      return { mois: key, nbVentes: ventes.length, ca, depenses: dep, benefice: round2(brut - dep) };
    });
  }

  function parCategorie(articles, period) {
    const map = new Map();
    for (const a of articles) {
      if (!isVendu(a) || !dansPeriode(a.dateVente, period)) continue;
      const cat = (a.categorie || '').trim() || 'Non classé';
      const row = map.get(cat) || { categorie: cat, nbVentes: 0, ca: 0, benefice: 0 };
      row.nbVentes += 1;
      row.ca = round2(row.ca + num(a.prixVente));
      row.benefice = round2(row.benefice + benefice(a));
      map.set(cat, row);
    }
    return [...map.values()].sort((x, y) => y.benefice - x.benefice || y.ca - x.ca);
  }

  function dac7(articles, annee) {
    const ventes = articles.filter((a) => isVendu(a) && dansPeriode(a.dateVente, String(annee)));
    return {
      annee: String(annee),
      nbVentes: ventes.length,
      montant: sum(ventes, (a) => num(a.prixVente)),
      seuilVentes: DAC7.ventes,
      seuilMontant: DAC7.montant,
    };
  }

  function anneesDisponibles(articles, depenses, aujourdhui) {
    const set = new Set([aujourdhui.slice(0, 4)]);
    for (const a of articles) {
      for (const d of [a.dateVente, a.dateAchat, a.dateMiseEnLigne]) {
        if (parseDate(d) != null) set.add(d.slice(0, 4));
      }
    }
    for (const d of depenses) if (parseDate(d.date) != null) set.add(d.date.slice(0, 4));
    return [...set].sort().reverse();
  }

  // ---------- Import / export ----------

  function texte(v, max = 500) {
    return v == null ? '' : String(v).slice(0, max);
  }

  function dateOuVide(v) {
    return parseDate(v) != null ? v : '';
  }

  function montantOuVide(v) {
    if (v === '' || v == null) return '';
    const n = num(v);
    return n >= 0 ? round2(n) : '';
  }

  function normaliserArticle(raw, genId) {
    if (!raw || typeof raw !== 'object') throw new Error('Article invalide');
    const titre = texte(raw.titre, 200).trim();
    if (!titre) throw new Error('Article sans titre');
    return {
      id: texte(raw.id, 80) || genId(),
      titre,
      marque: texte(raw.marque, 100),
      categorie: texte(raw.categorie, 100),
      taille: texte(raw.taille, 40),
      etat: texte(raw.etat, 60),
      statut: STATUT_IDS.has(raw.statut) ? raw.statut : 'stock',
      prixAchat: montantOuVide(raw.prixAchat),
      dateAchat: dateOuVide(raw.dateAchat),
      provenance: texte(raw.provenance, 100),
      prixAffiche: montantOuVide(raw.prixAffiche),
      dateMiseEnLigne: dateOuVide(raw.dateMiseEnLigne),
      prixVente: montantOuVide(raw.prixVente),
      dateVente: dateOuVide(raw.dateVente),
      frais: montantOuVide(raw.frais),
      lien: /^https?:\/\//i.test(texte(raw.lien)) ? texte(raw.lien, 500) : '',
      notes: texte(raw.notes, 2000),
      photos: normaliserPhotos(raw.photos),
      creeLe: texte(raw.creeLe, 40),
      modifieLe: texte(raw.modifieLe, 40),
    };
  }

  const CHEMIN_PHOTO = /^[A-Za-z0-9-]{1,64}\/[A-Za-z0-9_-]{1,80}\.jpg$/;

  function normaliserPhotos(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((p) => p && typeof p === 'object' && CHEMIN_PHOTO.test(p.path) && CHEMIN_PHOTO.test(p.thumb))
      .slice(0, 20)
      .map((p) => ({ id: texte(p.id, 80), path: p.path, thumb: p.thumb }));
  }

  function normaliserDepense(raw, genId) {
    if (!raw || typeof raw !== 'object') throw new Error('Dépense invalide');
    const libelle = texte(raw.libelle, 200).trim();
    if (!libelle) throw new Error('Dépense sans libellé');
    return {
      id: texte(raw.id, 80) || genId(),
      date: dateOuVide(raw.date),
      libelle,
      categorie: texte(raw.categorie, 100),
      montant: montantOuVide(raw.montant) || 0,
      notes: texte(raw.notes, 2000),
      modifieLe: texte(raw.modifieLe, 40),
    };
  }

  /** Valide une sauvegarde JSON et renvoie { articles, depenses } normalisés. */
  function lireSauvegarde(data, genId) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.articles)) {
      throw new Error("Ce fichier n'est pas une sauvegarde Suivi Vinted.");
    }
    return {
      articles: data.articles.map((a) => normaliserArticle(a, genId)),
      depenses: Array.isArray(data.depenses) ? data.depenses.map((d) => normaliserDepense(d, genId)) : [],
      supprimes: normaliserSupprimes(data.supprimes),
    };
  }

  // ---------- Synchronisation entre appareils ----------
  // Chaque article / dépense est un enregistrement daté (modifieLe). Une suppression laisse
  // une « pierre tombale » datée. Entre deux versions d'un même enregistrement, la plus
  // récente gagne (local ou serveur).

  const KINDS = new Set(['article', 'depense']);

  function normaliserSupprimes(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((t) => t && typeof t.id === 'string' && t.id && KINDS.has(t.kind))
      .map((t) => ({ id: t.id.slice(0, 80), kind: t.kind, modifieLe: texte(t.modifieLe, 40) }));
  }

  function temps(iso) {
    const t = Date.parse(iso || '');
    return Number.isFinite(t) ? t : 0;
  }

  function isoOuZero(iso) {
    const t = temps(iso);
    return new Date(t).toISOString();
  }

  /**
   * Fusionne l'état local avec les lignes du serveur.
   * local  : { articles, depenses, supprimes }
   * remote : [{ id, kind, data, updated_at, deleted }]
   * Renvoie le nouvel état local, les lignes à envoyer au serveur et le nombre de changements reçus.
   */
  function fusionnerSync(local, remote, genId) {
    const locaux = new Map();
    for (const a of local.articles) locaux.set(a.id, { kind: 'article', data: a, t: temps(a.modifieLe), deleted: false });
    for (const d of local.depenses) locaux.set(d.id, { kind: 'depense', data: d, t: temps(d.modifieLe), deleted: false });
    for (const s of local.supprimes || []) {
      const cur = locaux.get(s.id);
      if (!cur || temps(s.modifieLe) >= cur.t) locaux.set(s.id, { kind: s.kind, data: null, t: temps(s.modifieLe), deleted: true });
    }
    const distants = new Map();
    for (const r of remote || []) {
      if (!r || typeof r.id !== 'string' || !KINDS.has(r.kind)) continue;
      distants.set(r.id, { kind: r.kind, data: r.data, t: temps(r.updated_at), deleted: !!r.deleted });
    }

    const resultat = new Map();
    const aPousser = [];
    let recus = 0;
    const ids = new Set([...locaux.keys(), ...distants.keys()]);
    for (const id of ids) {
      const L = locaux.get(id);
      const R = distants.get(id);
      let gagnant = L;
      if (R && (!L || R.t > L.t)) {
        let data = null;
        if (!R.deleted) {
          try {
            data = R.kind === 'article' ? normaliserArticle({ ...R.data, id }, genId) : normaliserDepense({ ...R.data, id }, genId);
          } catch (e) {
            continue; // ligne distante illisible : on l'ignore
          }
          data.modifieLe = new Date(R.t).toISOString();
        }
        gagnant = { kind: R.kind, data, t: R.t, deleted: R.deleted };
        const etaitIdentique = L && L.deleted === R.deleted && L.deleted;
        if (!etaitIdentique) recus += 1;
      } else if (L && (!R || L.t > R.t)) {
        aPousser.push({
          id,
          kind: L.kind,
          data: L.deleted ? {} : L.data,
          updated_at: isoOuZero(L.deleted ? local.supprimes.find((s) => s.id === id).modifieLe : L.data.modifieLe),
          deleted: L.deleted,
        });
      }
      resultat.set(id, gagnant);
    }

    // On garde l'ordre local, puis on ajoute les nouveautés venues du serveur.
    const ordre = [...local.articles.map((a) => a.id), ...local.depenses.map((d) => d.id)];
    for (const id of resultat.keys()) if (!ordre.includes(id)) ordre.push(id);
    const articles = [];
    const depenses = [];
    const supprimes = [];
    const vus = new Set();
    for (const id of ordre) {
      if (vus.has(id)) continue;
      vus.add(id);
      const g = resultat.get(id);
      if (!g) continue;
      if (g.deleted) supprimes.push({ id, kind: g.kind, modifieLe: new Date(g.t).toISOString() });
      else if (g.kind === 'article') articles.push(g.data);
      else depenses.push(g.data);
    }
    return { articles, depenses, supprimes, aPousser, recus };
  }

  function labelStatut(id) {
    const s = STATUTS.find((x) => x.id === id);
    return s ? s.label : id;
  }

  function csvCell(v) {
    const s = v == null ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function csvMontant(v) {
    return v === '' || v == null ? '' : num(v).toFixed(2).replace('.', ',');
  }

  /** CSV au format Excel français (séparateur ;, décimales avec virgule). */
  function articlesCSV(articles) {
    const entetes = [
      'Titre', 'Marque', 'Catégorie', 'Taille', 'État', 'Statut',
      "Prix d'achat", "Date d'achat", 'Provenance', 'Prix affiché', 'Mise en ligne',
      'Prix de vente', 'Date de vente', 'Frais annexes', 'Bénéfice', 'Délai de vente (j)', 'Lien', 'Notes',
    ];
    const lignes = articles.map((a) => [
      a.titre, a.marque, a.categorie, a.taille, a.etat, labelStatut(a.statut),
      csvMontant(a.prixAchat), a.dateAchat, a.provenance, csvMontant(a.prixAffiche), a.dateMiseEnLigne,
      csvMontant(a.prixVente), a.dateVente, csvMontant(a.frais), csvMontant(benefice(a)),
      delaiVente(a) ?? '', a.lien, a.notes,
    ]);
    return [entetes, ...lignes].map((l) => l.map(csvCell).join(';')).join('\r\n');
  }

  return {
    STATUTS,
    DAC7,
    num,
    round2,
    isVendu,
    isInvendu,
    benefice,
    beneficePotentiel,
    joursEntre,
    delaiVente,
    anciennete,
    dansPeriode,
    computeStats,
    moisPourPeriode,
    serieMensuelle,
    parCategorie,
    dac7,
    anneesDisponibles,
    normaliserArticle,
    normaliserDepense,
    lireSauvegarde,
    normaliserSupprimes,
    fusionnerSync,
    labelStatut,
    articlesCSV,
  };
});
