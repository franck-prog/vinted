/* Suivi Vinted — interface. Les calculs sont dans calc.js (window.VintedCalc). */
(function () {
  'use strict';

  const C = window.VintedCalc;
  const STORAGE_KEY = 'suivi-vinted:v1';
  const CATEGORIES = [
    'Vêtements femme', 'Vêtements homme', 'Vêtements enfant', 'Chaussures', 'Sacs',
    'Accessoires', 'Bijoux', 'Beauté', 'Maison', 'Livres', 'Jeux et jouets', 'Électronique', 'Sport', 'Autre',
  ];
  const PROVENANCES = ['Mon dressing', 'Friperie', 'Vide-grenier', 'Emmaüs / ressourcerie', 'Vinted', 'Magasin', 'Cadeau'];
  const DEP_CATEGORIES = ['Emballages', 'Mise en avant / boost', 'Dressing en vitrine', 'Étiquettes / impression', 'Transport', 'Autre'];

  // ---------- État ----------
  let state = { articles: [], depenses: [], supprimes: [], settings: { theme: 'auto' }, sync: { derniere: '' } };
  let storageOk = true;
  const ui = {
    view: 'dashboard',
    period: today().slice(0, 4),
    depPeriod: 'all',
    search: '',
    statut: 'all',
    categorie: 'all',
    tri: 'recent',
  };

  // ---------- Utilitaires ----------
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  const euro0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
  const fmt = (v) => euro.format(C.num(v));
  const fmtSigned = (v) => (v > 0 ? '+' : '') + euro.format(v);
  const fmtHero = (v) => (Math.abs(v) >= 1000 ? euro0.format(v) : euro.format(v));
  function fmtDate(s) {
    if (!s) return '';
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function fmtMois(key, style = 'short') {
    const [y, m] = key.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', style === 'short' ? { month: 'short' } : { month: 'long', year: 'numeric' });
  }
  function fmtAxis(v) {
    if (Math.abs(v) >= 10000) return `${Math.round(v / 1000)} k€`;
    return `${new Intl.NumberFormat('fr-FR').format(v)} €`;
  }
  function plural(n, one, many) {
    return `${n} ${n > 1 ? many : one}`;
  }

  /** Crée un élément HTML. props: attributs, `class`, `text`, `on*` pour les écouteurs. */
  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    applyProps(node, props);
    for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : String(c));
    return node;
  }
  const SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, props, ...children) {
    const node = document.createElementNS(SVGNS, tag);
    applyProps(node, props);
    for (const c of children.flat()) if (c != null && c !== false) node.append(c instanceof Node ? c : String(c));
    return node;
  }
  function applyProps(node, props) {
    if (!props) return;
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'text') node.textContent = v;
      else if (k === 'class') node.setAttribute('class', v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
  }

  // ---------- Stockage ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      const clean = C.lireSauvegarde(data, uid);
      state.articles = clean.articles;
      state.depenses = clean.depenses;
      state.supprimes = clean.supprimes;
      if (data.sync && typeof data.sync.derniere === 'string') state.sync.derniere = data.sync.derniere;
      if (data.settings && typeof data.settings === 'object') {
        state.settings.theme = ['auto', 'light', 'dark'].includes(data.settings.theme) ? data.settings.theme : 'auto';
      }
    } catch (e) {
      storageOk = false;
      console.warn('Lecture du stockage impossible', e);
    }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...state }));
      storageOk = true;
    } catch (e) {
      storageOk = false;
      toast("Impossible d'enregistrer dans ce navigateur (navigation privée ?). Exportez une sauvegarde.");
    }
  }
  function commit() {
    save();
    render();
    scheduleSync();
  }
  const maintenant = () => new Date().toISOString();
  /** Mémorise une suppression pour la propager aux autres appareils. */
  function marquerSupprime(kind, id) {
    state.supprimes = state.supprimes.filter((t) => t.id !== id);
    state.supprimes.push({ id, kind, modifieLe: maintenant() });
  }
  function annulerSuppression(id) {
    state.supprimes = state.supprimes.filter((t) => t.id !== id);
  }

  // ---------- Toast ----------
  let toastTimer = null;
  function toast(message, action) {
    const box = $('#toast');
    $('#toast-text').textContent = message;
    const btn = $('#toast-action');
    btn.hidden = !action;
    btn.onclick = null;
    if (action) {
      btn.textContent = action.label;
      btn.onclick = () => {
        action.run();
        box.hidden = true;
      };
    }
    box.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (box.hidden = true), action ? 7000 : 3500);
  }

  // ---------- Infobulle ----------
  const tip = $('#tooltip');
  function showTip(content, x, y) {
    tip.replaceChildren(content);
    tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let left = x + 14;
    let top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    tip.style.left = `${Math.max(8, left)}px`;
    tip.style.top = `${Math.max(8, top)}px`;
  }
  function hideTip() {
    tip.hidden = true;
  }
  function tipContent(title, rows) {
    return el('div', null,
      el('div', { class: 'tt-title', text: title }),
      rows.map((r) => el('div', { class: 'tt-row' },
        el('span', { class: r.key ? `tt-key ${r.key}` : '' }),
        el('span', null, el('span', { class: 'tt-val', text: r.value }), el('span', { class: 'tt-name', text: r.name })))));
  }
  function bindTip(node, build) {
    node.addEventListener('pointermove', (e) => showTip(build(), e.clientX, e.clientY));
    node.addEventListener('pointerleave', hideTip);
    node.addEventListener('focus', () => {
      const r = node.getBoundingClientRect();
      showTip(build(), r.left + r.width / 2, r.top + r.height / 2);
    });
    node.addEventListener('blur', hideTip);
  }

  // ---------- Thème ----------
  function applyTheme() {
    const t = state.settings.theme;
    if (t === 'auto') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = t;
    const labels = { auto: 'Thème automatique', light: 'Thème clair', dark: 'Thème sombre' };
    const icons = {
      auto: 'M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 3v18',
      light: 'M12 8a4 4 0 1 0 0 8a4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
      dark: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
    };
    $('#theme-icon').replaceChildren(svg('svg', { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
      svg('path', { d: icons[t] }), t === 'auto' ? svg('path', { d: 'M12 3a9 9 0 0 1 0 18z', fill: 'currentColor', stroke: 'none' }) : null));
    $('#theme-label').textContent = labels[t];
    $('#theme-toggle').title = `${labels[t]} (cliquer pour changer)`;
  }

  // ---------- Navigation ----------
  function setView(view) {
    ui.view = view;
    for (const t of $$('.tab')) {
      if (t.dataset.view === view) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    }
    for (const v of $$('.view')) v.hidden = v.id !== `view-${view}`;
    try {
      history.replaceState(null, '', `#${view}`);
    } catch (e) { /* file:// */ }
    render();
    window.scrollTo({ top: 0 });
  }

  // ---------- Rendu global ----------
  function render() {
    hideTip();
    fillDatalists();
    if (ui.view === 'dashboard') renderDashboard();
    if (ui.view === 'articles') renderArticles();
    if (ui.view === 'depenses') renderDepenses();
    if (ui.view === 'donnees') {
      renderDonnees();
      renderSyncCard();
      majInstallation();
    }
    renderSyncIndicator();
  }

  function fillSelect(select, options, value) {
    select.replaceChildren(...options.map((o) => el('option', { value: o.value, text: o.label })));
    select.value = options.some((o) => o.value === value) ? value : options[0].value;
    return select.value;
  }

  function periodOptions() {
    const years = C.anneesDisponibles(state.articles, state.depenses, today());
    return [...years.map((y) => ({ value: y, label: y })), { value: 'all', label: 'Depuis le début' }];
  }

  function fillDatalists() {
    const uniq = (list) => [...new Set(list.map((s) => (s || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fr'));
    const set = (id, values) => $(id).replaceChildren(...values.map((v) => el('option', { value: v })));
    set('#dl-categories', uniq([...CATEGORIES, ...state.articles.map((a) => a.categorie)]));
    set('#dl-marques', uniq(state.articles.map((a) => a.marque)));
    set('#dl-provenances', uniq([...PROVENANCES, ...state.articles.map((a) => a.provenance)]));
    set('#dl-dep-categories', uniq([...DEP_CATEGORIES, ...state.depenses.map((d) => d.categorie)]));
  }

  // ================= TABLEAU DE BORD =================
  function renderDashboard() {
    ui.period = fillSelect($('#period-select'), periodOptions(), ui.period);
    const empty = state.articles.length === 0 && state.depenses.length === 0;
    $('#dashboard-empty').hidden = !empty;
    $('#dashboard-content').hidden = empty;
    if (empty) return;

    const period = ui.period;
    const s = C.computeStats(state.articles, state.depenses, period, today());
    const libellePeriode = period === 'all' ? 'depuis le début' : `en ${period}`;

    const hero = $('#hero-value');
    hero.textContent = fmtHero(s.beneficeNet);
    hero.className = `hero-value ${s.beneficeNet < 0 ? 'neg' : ''}`;
    $('#hero-sub').textContent = s.nbVentes
      ? `${plural(s.nbVentes, 'vente', 'ventes')} ${libellePeriode} · marge nette ${pct.format(s.margeNette ?? 0)}`
      : `Aucune vente ${libellePeriode}`;

    const tiles = [
      { label: "Chiffre d'affaires", value: fmt(s.ca), sub: s.panierMoyen != null ? `Panier moyen ${fmt(s.panierMoyen)}` : '—' },
      { label: 'Ventes', value: String(s.nbVentes), sub: s.delaiMoyen != null ? `Vendu en ${s.delaiMoyen} j en moyenne` : 'Délai de vente —' },
      { label: 'Rentabilité', value: s.roi != null ? pct.format(s.roi) : '—', sub: "Bénéfice / prix d'achat" },
      { label: 'Dépenses', value: fmt(s.fraisArticles + s.totalDepenses), sub: `dont ${fmt(s.totalDepenses)} générales` },
      { label: 'Articles en stock', value: String(s.nbStock), sub: s.stockAncien ? `${s.stockAncien} en ligne depuis +60 j` : 'Invendus actuels' },
      { label: 'Valeur du stock', value: fmt(s.valeurStock), sub: `Prix affichés ${fmt(s.valeurAffichee)}` },
      { label: 'En attente de paiement', value: fmt(s.montantAttente), sub: s.nbAttente ? `${plural(s.nbAttente, 'vente', 'ventes')} à expédier ou en cours` : 'Rien en attente' },
      { label: 'Coût des articles vendus', value: fmt(s.coutAchat), sub: `Bénéfice brut ${fmt(s.beneficeBrut)}` },
    ];
    $('#tiles').replaceChildren(...tiles.map((t) => el('div', { class: 'tile' },
      el('div', { class: 'tile-label', text: t.label }),
      el('div', { class: 'tile-value', text: t.value, title: t.value }),
      el('div', { class: 'tile-sub', text: t.sub }))));

    const mois = C.moisPourPeriode(period, today());
    const serie = C.serieMensuelle(state.articles, state.depenses, mois);
    $('#chart-sub').textContent = period === 'all' ? '12 derniers mois' : `Année ${period}`;
    lastSerie = serie;
    renderMonthlyChart($('#monthly-chart'), serie);
    renderMonthlyTable(serie);
    renderCategories(C.parCategorie(state.articles, period));
    renderDac7(period === 'all' ? today().slice(0, 4) : period);
    renderRecentSales();
  }

  let lastSerie = null;

  function niceTicks(lo, hi, count) {
    const raw = (hi - lo) / count;
    const exp = Math.floor(Math.log10(raw));
    const f = raw / 10 ** exp;
    const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    const step = nf * 10 ** exp;
    const start = Math.floor(lo / step) * step;
    const end = Math.ceil(hi / step) * step;
    const ticks = [];
    for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 100) / 100);
    return ticks;
  }

  /** Barre arrondie (4 px) côté donnée, carrée côté ligne de base. */
  function barPath(x, w, y0, y1) {
    const h = Math.abs(y1 - y0);
    if (h < 0.5) return null;
    const r = Math.min(4, w / 2, h);
    if (y1 < y0) {
      return `M${x},${y0}V${y1 + r}A${r},${r} 0 0 1 ${x + r},${y1}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y1 + r}V${y0}Z`;
    }
    return `M${x},${y0}V${y1 - r}A${r},${r} 0 0 0 ${x + r},${y1}H${x + w - r}A${r},${r} 0 0 0 ${x + w},${y1 - r}V${y0}Z`;
  }

  function renderMonthlyChart(host, rows) {
    const W = Math.max(280, Math.round(host.clientWidth || 600));
    const H = 240;
    const m = { t: 10, r: 4, b: 26, l: 58 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const vals = rows.flatMap((r) => [r.ca, r.benefice]);
    let lo = Math.min(0, ...vals);
    let hi = Math.max(0, ...vals);
    if (hi - lo < 1) hi = lo + 100;
    const ticks = niceTicks(lo, hi, 4);
    lo = ticks[0];
    hi = ticks[ticks.length - 1];
    const y = (v) => m.t + ih - ((v - lo) / (hi - lo)) * ih;
    const band = iw / rows.length;
    const bw = Math.max(3, Math.min(20, (band - 10) / 2 - 1));
    const y0 = y(0);
    const everyOther = band < 34;

    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' });
    for (const t of ticks) {
      root.append(svg('line', { class: t === 0 ? 'base' : 'grid', x1: m.l, x2: W - m.r, y1: y(t), y2: y(t) }));
      root.append(svg('text', { class: 'tick', x: m.l - 8, y: y(t) + 4, 'text-anchor': 'end' }, fmtAxis(t)));
    }
    rows.forEach((r, i) => {
      const x0 = m.l + band * i;
      const cx = x0 + band / 2;
      const g = svg('g', { class: 'col' });
      g.append(svg('rect', { class: 'wash', x: x0 + 1, y: m.t, width: band - 2, height: ih, rx: 6 }));
      const p1 = barPath(cx - bw - 1, bw, y0, y(r.ca));
      const p2 = barPath(cx + 1, bw, y0, y(r.benefice));
      if (p1) g.append(svg('path', { class: 'bar-1', d: p1 }));
      if (p2) g.append(svg('path', { class: 'bar-2', d: p2 }));
      if (!everyOther || i % 2 === 0) {
        g.append(svg('text', { class: 'tick', x: cx, y: H - 8, 'text-anchor': 'middle' }, fmtMois(r.mois).replace('.', '')));
      }
      const hit = svg('rect', {
        class: 'hit', x: x0, y: m.t, width: band, height: ih + m.b, tabindex: '0',
        'aria-label': `${fmtMois(r.mois, 'long')} : chiffre d'affaires ${fmt(r.ca)}, bénéfice net ${fmt(r.benefice)}`,
      });
      g.append(hit);
      const build = () => tipContent(fmtMois(r.mois, 'long'), [
        { key: 'k1', value: fmt(r.ca), name: "chiffre d'affaires" },
        { key: 'k2', value: fmt(r.benefice), name: 'bénéfice net' },
        { value: String(r.nbVentes), name: r.nbVentes > 1 ? 'ventes' : 'vente' },
        r.depenses ? { value: fmt(r.depenses), name: 'dépenses générales' } : null,
      ].filter(Boolean));
      bindTip(hit, build);
      hit.addEventListener('pointerenter', () => g.classList.add('active'));
      hit.addEventListener('pointerleave', () => g.classList.remove('active'));
      hit.addEventListener('focus', () => g.classList.add('active'));
      hit.addEventListener('blur', () => g.classList.remove('active'));
      root.append(g);
    });
    host.replaceChildren(root);
  }

  function renderMonthlyTable(rows) {
    const thead = el('thead', null, el('tr', null,
      el('th', { text: 'Mois' }), el('th', { class: 'num', text: 'Ventes' }), el('th', { class: 'num', text: "Chiffre d'affaires" }),
      el('th', { class: 'num', text: 'Dépenses générales' }), el('th', { class: 'num', text: 'Bénéfice net' })));
    const tbody = el('tbody', null, rows.map((r) => el('tr', null,
      el('td', { text: fmtMois(r.mois, 'long') }), el('td', { class: 'num', text: String(r.nbVentes) }),
      el('td', { class: 'num', text: fmt(r.ca) }), el('td', { class: 'num', text: fmt(r.depenses) }),
      el('td', { class: 'num', text: fmt(r.benefice) }))));
    $('#monthly-table').replaceChildren(thead, tbody);
  }

  function renderCategories(rows) {
    const host = $('#category-chart');
    if (!rows.length) {
      host.replaceChildren(el('p', { class: 'empty-inline', text: 'Aucune vente sur la période.' }));
      return;
    }
    const top = rows.slice(0, 8);
    const max = Math.max(1, ...top.map((r) => Math.max(0, r.benefice)));
    host.replaceChildren(...top.map((r) => {
      const width = Math.max(0, r.benefice) / max;
      const row = el('div', { class: 'cat-row', tabindex: '0', 'aria-label': `${r.categorie} : bénéfice ${fmt(r.benefice)}, ${plural(r.nbVentes, 'vente', 'ventes')}` },
        el('span', { class: 'cat-name', text: r.categorie }),
        el('span', { class: 'cat-track' },
          el('span', { class: 'cat-bar', style: `width: calc((100% - 92px) * ${width.toFixed(4)})` }),
          el('span', { class: `cat-val ${r.benefice < 0 ? 'neg' : ''}`, text: fmt(r.benefice) })));
      bindTip(row, () => tipContent(r.categorie, [
        { key: 'k1', value: fmt(r.benefice), name: 'bénéfice' },
        { value: fmt(r.ca), name: "chiffre d'affaires" },
        { value: String(r.nbVentes), name: r.nbVentes > 1 ? 'ventes' : 'vente' },
        { value: r.ca ? pct.format(r.benefice / r.ca) : '—', name: 'marge' },
      ]));
      return row;
    }));
    if (rows.length > top.length) {
      host.append(el('p', { class: 'empty-inline', text: `+ ${rows.length - top.length} autres catégories` }));
    }
  }

  function renderDac7(annee) {
    const d = C.dac7(state.articles, annee);
    $('#dac7-sub').textContent = `Année civile ${annee}`;
    const meter = (label, value, max, display) => {
      const ratio = value / max;
      const level = ratio >= 1 ? 'critical' : ratio >= 0.8 ? 'warning' : '';
      const etat = ratio >= 1 ? 'Seuil atteint' : ratio >= 0.8 ? 'Proche du seuil' : 'Sous le seuil';
      return el('div', { class: 'meter' },
        el('div', { class: 'meter-head' }, el('span', { text: label }), el('strong', { text: display })),
        el('div', { class: 'meter-track', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(value), 'aria-label': label },
          el('div', { class: `meter-fill ${level}`, style: `width:${Math.min(100, ratio * 100).toFixed(1)}%` })),
        el('div', { class: 'meter-state' }, el('span', { class: `dot ${level}` }), el('span', { text: `${etat} · ${pct.format(Math.min(ratio, 9.99))}` })));
    };
    $('#dac7-meters').replaceChildren(
      meter('Nombre de ventes', d.nbVentes, d.seuilVentes, `${d.nbVentes} / ${d.seuilVentes}`),
      meter('Montant des ventes', d.montant, d.seuilMontant, `${euro0.format(d.montant)} / ${euro0.format(d.seuilMontant)}`));
  }

  function renderRecentSales() {
    const ventes = state.articles
      .filter((a) => C.isVendu(a))
      .sort((a, b) => (b.dateVente || '').localeCompare(a.dateVente || ''))
      .slice(0, 6);
    const host = $('#recent-sales');
    if (!ventes.length) {
      host.replaceChildren(el('p', { class: 'empty-inline', text: 'Aucune vente pour le moment.' }));
      return;
    }
    host.replaceChildren(el('div', { class: 'table-scroll' }, el('table', { class: 'data-table compact responsive' },
      el('thead', null, el('tr', null,
        el('th', { text: 'Article' }), el('th', { text: 'Statut' }), el('th', { text: 'Date' }),
        el('th', { class: 'num', text: 'Vente' }), el('th', { class: 'num', text: 'Bénéfice' }))),
      el('tbody', null, ventes.map((a) => {
        const b = C.benefice(a);
        return el('tr', null,
          el('td', { class: 'cell-main' }, el('div', { class: 'item-title', text: a.titre }), el('div', { class: 'item-meta', text: [a.marque, a.taille].filter(Boolean).join(' · ') })),
          el('td', null, el('span', { class: 'pill', dataset: { statut: a.statut }, text: C.labelStatut(a.statut) })),
          el('td', { class: 'muted', text: fmtDate(a.dateVente) }),
          el('td', { class: 'num', 'data-label': 'Vente', text: fmt(a.prixVente) }),
          el('td', { class: `num ${b < 0 ? 'neg' : 'pos'}`, 'data-label': 'Bénéfice', text: fmtSigned(b) }));
      })))));
  }

  // ================= ARTICLES =================
  const FILTRES_GROUPES = [
    { value: 'all', label: 'Tous' },
    { value: 'invendus', label: 'À vendre' },
    { value: 'vendus', label: 'Vendus' },
    { value: 'a_expedier', label: 'À expédier' },
  ];

  function matchStatut(a, filtre) {
    if (filtre === 'all') return true;
    if (filtre === 'invendus') return C.isInvendu(a);
    if (filtre === 'vendus') return C.isVendu(a);
    if (filtre === 'a_expedier') return a.statut === 'vendu';
    return a.statut === filtre;
  }

  function renderArticles() {
    const statutOptions = [...FILTRES_GROUPES, ...C.STATUTS.map((s) => ({ value: s.id, label: s.label }))];
    ui.statut = fillSelect($('#filter-status'), statutOptions, ui.statut);
    const cats = [...new Set(state.articles.map((a) => (a.categorie || '').trim() || 'Non classé'))].sort((a, b) => a.localeCompare(b, 'fr'));
    ui.categorie = fillSelect($('#filter-category'), [{ value: 'all', label: 'Toutes catégories' }, ...cats.map((c) => ({ value: c, label: c }))], ui.categorie);
    $('#sort').value = ui.tri;
    if ($('#search').value !== ui.search) $('#search').value = ui.search;

    $('#status-chips').replaceChildren(...FILTRES_GROUPES.map((f) => {
      const count = state.articles.filter((a) => matchStatut(a, f.value)).length;
      return el('button', {
        type: 'button', class: 'chip', 'aria-pressed': String(ui.statut === f.value),
        onclick: () => { ui.statut = f.value; renderArticles(); },
      }, f.label, el('span', { class: 'count', text: String(count) }));
    }));

    const q = ui.search.trim().toLocaleLowerCase('fr');
    const t = today();
    let list = state.articles.filter((a) => {
      if (!matchStatut(a, ui.statut)) return false;
      if (ui.categorie !== 'all' && ((a.categorie || '').trim() || 'Non classé') !== ui.categorie) return false;
      if (!q) return true;
      return [a.titre, a.marque, a.categorie, a.taille, a.notes, a.provenance].join(' ').toLocaleLowerCase('fr').includes(q);
    });
    const activity = (a) => a.dateVente || a.dateMiseEnLigne || a.dateAchat || a.creeLe || '';
    const sorters = {
      recent: (a, b) => activity(b).localeCompare(activity(a)),
      benefice: (a, b) => (C.benefice(b) ?? C.beneficePotentiel(b) ?? -1e9) - (C.benefice(a) ?? C.beneficePotentiel(a) ?? -1e9),
      anciennete: (a, b) => (C.anciennete(b, t) ?? -1) - (C.anciennete(a, t) ?? -1),
      titre: (a, b) => a.titre.localeCompare(b.titre, 'fr'),
    };
    list = list.slice().sort(sorters[ui.tri] || sorters.recent);

    const host = $('#articles-list');
    if (!state.articles.length) {
      host.replaceChildren(el('div', { class: 'list-empty' },
        el('p', { text: 'Aucun article pour le moment.' }),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => openArticle() }, 'Ajouter un article')));
      $('#articles-summary').textContent = '';
      return;
    }
    if (!list.length) {
      host.replaceChildren(el('div', { class: 'list-empty', text: 'Aucun article ne correspond à ces filtres.' }));
      $('#articles-summary').textContent = '';
      return;
    }

    const rows = list.map((a) => articleRow(a, t));
    host.replaceChildren(el('table', { class: 'data-table responsive' },
      el('thead', null, el('tr', null,
        el('th', { text: 'Article' }), el('th', { text: 'Statut' }), el('th', { class: 'num', text: 'Achat' }),
        el('th', { class: 'num', text: 'Vente' }), el('th', { class: 'num', text: 'Bénéfice' }), el('th', { text: 'Délai' }),
        el('th', null, el('span', { class: 'sr-only', text: 'Actions' })))),
      el('tbody', null, rows)));

    hydraterPhotos(host);
    const vendus = list.filter(C.isVendu);
    const totalBenef = vendus.reduce((acc, a) => acc + C.benefice(a), 0);
    $('#articles-summary').textContent = `${plural(list.length, 'article affiché', 'articles affichés')}`
      + (vendus.length ? ` · ${plural(vendus.length, 'vente', 'ventes')} pour ${fmt(totalBenef)} de bénéfice` : '');
  }

  function articleRow(a, t) {
    const b = C.benefice(a);
    const pot = C.beneficePotentiel(a);
    const delai = C.delaiVente(a);
    const anc = C.anciennete(a, t);
    const meta = [a.marque, a.categorie, a.taille, a.etat].filter(Boolean).join(' · ');

    const statut = el('select', { class: 'status-select', 'aria-label': `Statut de ${a.titre}`, dataset: { statut: a.statut } },
      C.STATUTS.map((s) => el('option', { value: s.id, text: s.label })));
    statut.value = a.statut;
    statut.addEventListener('change', () => changerStatut(a.id, statut.value));

    let venteCell;
    if (C.isVendu(a)) venteCell = el('td', { class: 'num', 'data-label': 'Vente', text: fmt(a.prixVente) });
    else if (C.num(a.prixAffiche)) venteCell = el('td', { class: 'num muted', 'data-label': 'Affiché', text: fmt(a.prixAffiche) });
    else venteCell = el('td', { class: 'num muted', 'data-label': 'Vente', text: '—' });

    let benefCell;
    if (b != null) benefCell = el('td', { class: `num ${b < 0 ? 'neg' : 'pos'}`, 'data-label': 'Bénéfice', text: fmtSigned(b) });
    else if (pot != null) benefCell = el('td', { class: 'num muted', 'data-label': 'Potentiel', title: 'Bénéfice potentiel au prix affiché', text: `≈ ${fmtSigned(pot)}` });
    else benefCell = el('td', { class: 'num muted', 'data-label': 'Bénéfice', text: '—' });

    let delaiText = '—';
    if (delai != null) delaiText = `vendu en ${delai} j`;
    else if (anc != null) delaiText = `depuis ${anc} j`;

    return el('tr', null,
      el('td', { class: 'cell-main' }, el('div', { class: 'item-cell' },
        a.photos && a.photos.length
          ? el('button', { type: 'button', class: 'thumb', title: 'Voir les photos', 'aria-label': `Photos de ${a.titre}`, onclick: () => openArticle(a.id) },
            el('img', { alt: '', 'data-path': a.photos[0].thumb, loading: 'lazy' }),
            a.photos.length > 1 ? el('span', { class: 'thumb-count', text: String(a.photos.length) }) : null)
          : null,
        el('div', null,
          el('div', { class: 'item-title' }, a.lien ? el('a', { href: a.lien, target: '_blank', rel: 'noopener noreferrer', text: a.titre }) : a.titre),
          meta ? el('div', { class: 'item-meta', text: meta }) : null))),
      el('td', null, statut),
      el('td', { class: 'num', 'data-label': 'Achat', text: a.prixAchat === '' ? '—' : fmt(a.prixAchat) }),
      venteCell,
      benefCell,
      el('td', { class: anc != null && anc >= 60 ? 'neg' : 'muted', text: delaiText }),
      el('td', { class: 'cell-actions' }, el('div', { class: 'row-actions' },
        el('button', { type: 'button', class: 'icon-btn', title: 'Modifier', 'aria-label': `Modifier ${a.titre}`, onclick: () => openArticle(a.id) }, '✎'),
        el('button', { type: 'button', class: 'icon-btn', title: 'Dupliquer', 'aria-label': `Dupliquer ${a.titre}`, onclick: () => dupliquer(a.id) }, '⧉'),
        el('button', { type: 'button', class: 'icon-btn', title: 'Supprimer', 'aria-label': `Supprimer ${a.titre}`, onclick: () => supprimerArticle(a.id) }, '🗑'))));
  }

  function changerStatut(id, statut) {
    const a = state.articles.find((x) => x.id === id);
    if (!a) return;
    const devientVendu = ['vendu', 'expedie', 'finalise'].includes(statut);
    if (devientVendu && !C.num(a.prixVente)) {
      // Il manque le montant de la vente : on ouvre le formulaire prérempli.
      openArticle(id, { statut, dateVente: a.dateVente || today(), prixVente: a.prixAffiche });
      renderArticles();
      return;
    }
    a.statut = statut;
    if (devientVendu && !a.dateVente) a.dateVente = today();
    if (statut === 'en_ligne' && !a.dateMiseEnLigne) a.dateMiseEnLigne = today();
    a.modifieLe = new Date().toISOString();
    commit();
    toast(`« ${a.titre} » : ${C.labelStatut(statut).toLowerCase()}`);
  }

  function dupliquer(id) {
    const a = state.articles.find((x) => x.id === id);
    if (!a) return;
    openArticle(null, {
      ...a, id: '', titre: `${a.titre} (copie)`, statut: 'stock', prixVente: '', dateVente: '', dateMiseEnLigne: '', lien: '', photos: [],
    });
  }

  function supprimerArticle(id) {
    const idx = state.articles.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const [removed] = state.articles.splice(idx, 1);
    marquerSupprime('article', removed.id);
    commit();
    toast(`« ${removed.titre} » supprimé`, {
      label: 'Annuler',
      run: () => {
        annulerSuppression(removed.id);
        removed.modifieLe = maintenant();
        state.articles.splice(Math.min(idx, state.articles.length), 0, removed);
        commit();
      },
    });
    // Les photos sont effacées du serveur une fois le délai d'annulation passé.
    setTimeout(() => {
      if (!state.articles.some((a) => a.id === removed.id)) supprimerFichiersPhotos(removed.photos);
    }, 9000);
  }

  // ---------- Formulaire article ----------
  const articleDialog = $('#article-dialog');
  const articleForm = $('#article-form');
  const MONTANTS = ['prixAchat', 'prixAffiche', 'prixVente', 'frais'];

  function openArticle(id, preset) {
    const a = id ? state.articles.find((x) => x.id === id) : null;
    const data = { statut: 'stock', dateAchat: today(), ...(a || {}), ...(preset || {}) };
    if (!a && !preset) data.prixAchat = '';
    $('#article-dialog-title').textContent = a ? "Modifier l'article" : 'Nouvel article';
    fillSelect($('#statut-select'), C.STATUTS.map((s) => ({ value: s.id, label: s.label })), data.statut);
    for (const field of articleForm.elements) {
      if (!field.name || field.name === 'statut') continue;
      let v = data[field.name] ?? '';
      if (MONTANTS.includes(field.name) && v !== '') v = String(v).replace('.', ',');
      field.value = v;
      field.classList.remove('invalid');
    }
    articleForm.elements.id.value = a ? a.id : '';
    $('#article-error').textContent = '';
    formPhotos = { list: [...(data.photos || [])], ajoutees: [], retirees: [], envois: 0, enregistre: false };
    renderGallery();
    updateArticleForm();
    articleDialog.showModal();
    if (!a) setTimeout(() => articleForm.elements.titre.focus(), 30);
  }

  function readArticleForm() {
    const f = articleForm.elements;
    const out = {};
    for (const name of ['titre', 'marque', 'categorie', 'taille', 'etat', 'statut', 'dateAchat', 'provenance', 'dateMiseEnLigne', 'dateVente', 'lien', 'notes']) {
      out[name] = f[name].value.trim();
    }
    for (const name of MONTANTS) {
      const raw = f[name].value.trim();
      out[name] = raw === '' ? '' : C.round2(C.num(raw));
    }
    return out;
  }

  function updateArticleForm() {
    const d = readArticleForm();
    const vendu = ['vendu', 'expedie', 'finalise'].includes(d.statut);
    $('#vente-fieldset').classList.toggle('inactive', !vendu);
    const preview = $('#article-preview');
    const achat = C.num(d.prixAchat) + C.num(d.frais);
    const prix = vendu ? C.num(d.prixVente) : C.num(d.prixAffiche);
    if (!prix) {
      preview.textContent = '';
      return;
    }
    const b = C.round2(prix - achat);
    const marge = prix ? b / prix : 0;
    preview.replaceChildren(
      vendu ? 'Bénéfice : ' : 'Bénéfice potentiel au prix affiché : ',
      el('strong', { class: b < 0 ? 'neg' : 'pos', text: fmtSigned(b) }),
      ` · marge ${pct.format(marge)}`,
      achat > 0 ? ` · ×${(prix / achat).toFixed(1).replace('.', ',')} la mise` : '');
  }

  function submitArticle(e) {
    e.preventDefault();
    const d = readArticleForm();
    const f = articleForm.elements;
    const errors = [];
    for (const el2 of articleForm.querySelectorAll('.invalid')) el2.classList.remove('invalid');
    const fail = (name, msg) => { f[name].classList.add('invalid'); errors.push(msg); };
    if (!d.titre) fail('titre', 'Le titre est obligatoire.');
    for (const name of MONTANTS) {
      const raw = f[name].value.trim();
      if (raw && (!/^\d+([.,]\d{0,2})?$/.test(raw.replace(/\s/g, '')))) fail(name, 'Les montants doivent être des nombres positifs (ex. 12,50).');
    }
    if (['vendu', 'expedie', 'finalise'].includes(d.statut)) {
      if (d.prixVente === '') fail('prixVente', 'Indiquez le montant reçu pour un article vendu.');
      if (!d.dateVente) fail('dateVente', 'Indiquez la date de vente.');
    }
    if (d.lien && !/^https?:\/\//i.test(d.lien)) fail('lien', "Le lien doit commencer par https://");
    if (d.dateVente && (d.dateMiseEnLigne || d.dateAchat) && d.dateVente < (d.dateMiseEnLigne || d.dateAchat)) {
      fail('dateVente', 'La date de vente est antérieure à la mise en ligne ou à l\'achat.');
    }
    if (formPhotos.envois > 0) errors.push('Patientez, des photos sont en cours d’envoi.');
    if (errors.length) {
      $('#article-error').textContent = [...new Set(errors)].join(' ');
      return;
    }

    const id = f.id.value;
    const now = maintenant();
    d.photos = formPhotos.list.slice();
    if (id) {
      const a = state.articles.find((x) => x.id === id);
      Object.assign(a, d, { modifieLe: now });
    } else {
      state.articles.push(C.normaliserArticle({ ...d, id: uid(), creeLe: now, modifieLe: now }, uid));
    }
    formPhotos.enregistre = true;
    supprimerFichiersPhotos(formPhotos.retirees);
    articleDialog.close();
    commit();
    toast(id ? 'Article mis à jour' : 'Article ajouté');
  }

  // ================= DÉPENSES =================
  function renderDepenses() {
    ui.depPeriod = fillSelect($('#dep-period-select'), periodOptions(), ui.depPeriod);
    const list = state.depenses
      .filter((d) => C.dansPeriode(d.date, ui.depPeriod))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const host = $('#depenses-list');
    if (!list.length) {
      host.replaceChildren(el('div', { class: 'list-empty' },
        el('p', { text: state.depenses.length ? 'Aucune dépense sur cette période.' : 'Aucune dépense enregistrée.' }),
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => openDepense() }, 'Ajouter une dépense')));
      $('#depenses-summary').textContent = '';
      return;
    }
    host.replaceChildren(el('table', { class: 'data-table responsive' },
      el('thead', null, el('tr', null,
        el('th', { text: 'Libellé' }), el('th', { text: 'Catégorie' }), el('th', { text: 'Date' }),
        el('th', { class: 'num', text: 'Montant' }), el('th', null, el('span', { class: 'sr-only', text: 'Actions' })))),
      el('tbody', null, list.map((d) => el('tr', null,
        el('td', { class: 'cell-main' }, el('div', { class: 'item-title', text: d.libelle }), d.notes ? el('div', { class: 'item-meta', text: d.notes }) : null),
        el('td', { 'data-label': 'Catégorie', text: d.categorie || '—' }),
        el('td', { text: d.date ? fmtDate(d.date) : '—' }),
        el('td', { class: 'num', 'data-label': 'Montant', text: fmt(d.montant) }),
        el('td', { class: 'cell-actions' }, el('div', { class: 'row-actions' },
          el('button', { type: 'button', class: 'icon-btn', title: 'Modifier', 'aria-label': `Modifier ${d.libelle}`, onclick: () => openDepense(d.id) }, '✎'),
          el('button', { type: 'button', class: 'icon-btn', title: 'Supprimer', 'aria-label': `Supprimer ${d.libelle}`, onclick: () => supprimerDepense(d.id) }, '🗑'))))))));
    const total = list.reduce((acc, d) => acc + C.num(d.montant), 0);
    $('#depenses-summary').textContent = `${plural(list.length, 'dépense', 'dépenses')} · total ${fmt(total)}`;
  }

  const depenseDialog = $('#depense-dialog');
  const depenseForm = $('#depense-form');

  function openDepense(id) {
    const d = id ? state.depenses.find((x) => x.id === id) : null;
    const data = d || { date: today() };
    $('#depense-dialog-title').textContent = d ? 'Modifier la dépense' : 'Nouvelle dépense';
    for (const field of depenseForm.elements) {
      if (!field.name) continue;
      let v = data[field.name] ?? '';
      if (field.name === 'montant' && v !== '') v = String(v).replace('.', ',');
      field.value = v;
      field.classList.remove('invalid');
    }
    $('#depense-error').textContent = '';
    depenseDialog.showModal();
    if (!d) setTimeout(() => depenseForm.elements.libelle.focus(), 30);
  }

  function submitDepense(e) {
    e.preventDefault();
    const f = depenseForm.elements;
    const libelle = f.libelle.value.trim();
    const montantRaw = f.montant.value.trim().replace(/\s/g, '');
    const errors = [];
    f.libelle.classList.toggle('invalid', !libelle);
    if (!libelle) errors.push('Le libellé est obligatoire.');
    const montantOk = /^\d+([.,]\d{0,2})?$/.test(montantRaw);
    f.montant.classList.toggle('invalid', !montantOk);
    if (!montantOk) errors.push('Indiquez un montant positif (ex. 4,90).');
    if (errors.length) {
      $('#depense-error').textContent = errors.join(' ');
      return;
    }
    const data = {
      libelle,
      montant: C.round2(C.num(montantRaw)),
      date: f.date.value,
      categorie: f.categorie.value.trim(),
      notes: f.notes.value.trim(),
    };
    const id = f.id.value;
    data.modifieLe = maintenant();
    if (id) Object.assign(state.depenses.find((x) => x.id === id), data);
    else state.depenses.push({ id: uid(), ...data });
    depenseDialog.close();
    commit();
    toast(id ? 'Dépense mise à jour' : 'Dépense ajoutée');
  }

  function supprimerDepense(id) {
    const idx = state.depenses.findIndex((x) => x.id === id);
    if (idx < 0) return;
    const [removed] = state.depenses.splice(idx, 1);
    marquerSupprime('depense', removed.id);
    commit();
    toast(`« ${removed.libelle} » supprimée`, {
      label: 'Annuler',
      run: () => {
        annulerSuppression(removed.id);
        removed.modifieLe = maintenant();
        state.depenses.splice(Math.min(idx, state.depenses.length), 0, removed);
        commit();
      },
    });
  }

  // ================= DONNÉES =================
  function renderDonnees() {
    let taille = '';
    try {
      const raw = localStorage.getItem(STORAGE_KEY) || '';
      taille = ` · ${(raw.length / 1024).toFixed(1).replace('.', ',')} Ko utilisés`;
    } catch (e) { /* ignoré */ }
    $('#storage-info').textContent = storageOk
      ? `${plural(state.articles.length, 'article', 'articles')} et ${plural(state.depenses.length, 'dépense', 'dépenses')} enregistrés dans ce navigateur${taille}.`
      : "⚠ Le stockage local n'est pas disponible : vos données seront perdues à la fermeture de la page. Exportez une sauvegarde.";
  }

  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJSON() {
    const data = { application: 'suivi-vinted', version: 1, exporteLe: new Date().toISOString(), articles: state.articles, depenses: state.depenses };
    download(`suivi-vinted-${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
    toast('Sauvegarde téléchargée');
  }

  function exportCSV() {
    download(`suivi-vinted-articles-${today()}.csv`, '﻿' + C.articlesCSV(state.articles), 'text/csv;charset=utf-8');
    toast('Export CSV téléchargé');
  }

  function importFile(file) {
    const mode = ($('input[name="import-mode"]:checked') || {}).value || 'fusion';
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = C.lireSauvegarde(JSON.parse(String(reader.result)), uid);
        const now = maintenant();
        for (const x of [...data.articles, ...data.depenses]) x.modifieLe = now;
        const ids = new Set([...data.articles, ...data.depenses].map((x) => x.id));
        if (mode === 'remplacer') {
          if (!confirm(`Remplacer toutes vos données par ${plural(data.articles.length, 'article', 'articles')} et ${plural(data.depenses.length, 'dépense', 'dépenses')} ?`
            + (syncActive() ? '\n\nLe remplacement sera aussi appliqué à vos autres appareils.' : ''))) return;
          for (const a of state.articles) if (!ids.has(a.id)) marquerSupprime('article', a.id);
          for (const d of state.depenses) if (!ids.has(d.id)) marquerSupprime('depense', d.id);
          state.articles = data.articles;
          state.depenses = data.depenses;
        } else {
          const merge = (current, incoming) => {
            const map = new Map(current.map((x) => [x.id, x]));
            for (const x of incoming) map.set(x.id, x);
            return [...map.values()];
          };
          state.articles = merge(state.articles, data.articles);
          state.depenses = merge(state.depenses, data.depenses);
        }
        state.supprimes = state.supprimes.filter((t) => !ids.has(t.id));
        commit();
        toast(`Import réussi : ${plural(data.articles.length, 'article', 'articles')}, ${plural(data.depenses.length, 'dépense', 'dépenses')}`);
      } catch (err) {
        toast(err instanceof SyntaxError ? "Ce fichier n'est pas un JSON valide." : err.message);
      }
    };
    reader.readAsText(file);
  }

  function resetAll() {
    if (!state.articles.length && !state.depenses.length) {
      toast('Il n’y a rien à effacer.');
      return;
    }
    const ailleurs = syncActive() ? '\n\nAttention : la synchronisation est active, les données seront aussi effacées sur vos autres appareils.' : '';
    if (!confirm(`Effacer définitivement tous les articles et toutes les dépenses ?${ailleurs}\n\nConseil : téléchargez une sauvegarde avant.`)) return;
    for (const a of state.articles) marquerSupprime('article', a.id);
    for (const d of state.depenses) marquerSupprime('depense', d.id);
    supprimerFichiersPhotos(state.articles.flatMap((a) => a.photos || []));
    state.articles = [];
    state.depenses = [];
    commit();
    toast('Toutes les données ont été effacées');
  }

  // ---------- Données d'exemple ----------
  function chargerExemples() {
    if (syncActive()) {
      toast('Déconnectez la synchronisation avant de charger des exemples, pour ne pas les envoyer sur vos autres appareils.');
      return;
    }
    if ((state.articles.length || state.depenses.length)
      && !confirm('Remplacer vos données actuelles par des exemples ?\n\nConseil : téléchargez une sauvegarde avant.')) return;
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const base = new Date();
    const dateIl = (jours) => {
      const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() - jours);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const modeles = [
      ['Jean 501 brut', "Levi's", 'Vêtements homme', 'W32'], ['Robe portefeuille fleurie', 'Sézane', 'Vêtements femme', '38'],
      ['Baskets Stan Smith', 'Adidas', 'Chaussures', '42'], ['Pull col roulé laine', 'COS', 'Vêtements femme', 'M'],
      ['Sac seau cuir camel', 'Mango', 'Sacs', 'TU'], ['Doudoune légère', 'Uniqlo', 'Vêtements homme', 'L'],
      ['Veste en jean oversize', 'Zara', 'Vêtements femme', 'S'], ['Lot de 3 bodies', 'Petit Bateau', 'Vêtements enfant', '12 mois'],
      ['Chemise oxford', 'Ralph Lauren', 'Vêtements homme', 'M'], ['Bottines Chelsea', 'Bocage', 'Chaussures', '39'],
      ['Trench beige', 'Maje', 'Vêtements femme', '36'], ['Sweat à capuche', 'Carhartt', 'Vêtements homme', 'XL'],
      ['Ceinture cuir tressé', 'Celio', 'Accessoires', '95'], ['Roman « L\'Étranger »', 'Folio', 'Livres', ''],
      ['Lego Classic 500 pièces', 'Lego', 'Jeux et jouets', ''], ['Polo piqué', 'Lacoste', 'Vêtements homme', '4'],
      ['Jupe plissée midi', '& Other Stories', 'Vêtements femme', '38'], ['Sneakers Air Max 90', 'Nike', 'Chaussures', '43'],
      ['Écharpe cachemire', 'Monoprix', 'Accessoires', 'TU'], ['Manteau laine bouillie', 'Comptoir des Cotonniers', 'Vêtements femme', '40'],
      ['Cardigan enfant', 'Bonton', 'Vêtements enfant', '6 ans'], ['Casque audio', 'JBL', 'Électronique', ''],
      ['Short de running', 'Decathlon', 'Sport', 'M'], ['Pochette à rabat', 'Sandro', 'Sacs', 'TU'],
      ['T-shirt imprimé vintage', 'Fruit of the Loom', 'Vêtements homme', 'L'], ['Bague argent', 'Agatha', 'Bijoux', '54'],
    ];
    const etats = ['Neuf avec étiquette', 'Très bon état', 'Très bon état', 'Bon état', 'Bon état', 'Satisfaisant'];
    const articles = modeles.map((m, i) => {
      const achatJ = Math.floor(30 + rnd() * 300);
      const ligneJ = Math.max(0, achatJ - Math.floor(1 + rnd() * 20));
      const achat = pick([0, 2, 3, 5, 5, 8, 10, 12, 15, 20]);
      const affiche = Math.round(achat * (1.8 + rnd() * 2.5) + 6 + rnd() * 20);
      const r = rnd();
      let statut;
      if (i < 4) statut = pick(['en_ligne', 'en_ligne', 'stock', 'reserve']);
      else if (r < 0.62) statut = 'finalise';
      else if (r < 0.72) statut = pick(['vendu', 'expedie']);
      else if (r < 0.95) statut = 'en_ligne';
      else statut = 'annule';
      const a = {
        id: `demo-${uid()}`, titre: m[0], marque: m[1], categorie: m[2], taille: m[3], etat: pick(etats), statut,
        prixAchat: achat, dateAchat: dateIl(achatJ), provenance: achat === 0 ? 'Mon dressing' : pick(['Friperie', 'Vide-grenier', 'Emmaüs / ressourcerie', 'Vinted']),
        prixAffiche: affiche, dateMiseEnLigne: statut === 'stock' ? '' : dateIl(ligneJ), prixVente: '', dateVente: '',
        frais: rnd() < 0.25 ? pick([0.95, 1.5, 2.45]) : '', lien: '', notes: '', creeLe: new Date().toISOString(), modifieLe: '',
      };
      if (C.isVendu(a)) {
        const venteJ = statut === 'finalise' ? Math.max(0, ligneJ - Math.floor(2 + rnd() * 45)) : Math.floor(rnd() * 4);
        a.dateVente = dateIl(Math.min(venteJ, ligneJ));
        a.prixVente = Math.max(1, Math.round(affiche * (0.75 + rnd() * 0.25)));
      }
      return a;
    });
    const depenses = [
      { id: `demo-${uid()}`, date: dateIl(200), libelle: "Lot de 50 enveloppes d'expédition", categorie: 'Emballages', montant: 12.9, notes: '' },
      { id: `demo-${uid()}`, date: dateIl(120), libelle: 'Dressing en vitrine (7 jours)', categorie: 'Dressing en vitrine', montant: 6.95, notes: '' },
      { id: `demo-${uid()}`, date: dateIl(45), libelle: 'Rouleau de papier kraft', categorie: 'Emballages', montant: 7.5, notes: '' },
      { id: `demo-${uid()}`, date: dateIl(10), libelle: 'Étiquettes adhésives', categorie: 'Étiquettes / impression', montant: 4.2, notes: '' },
    ];
    state.articles = articles;
    state.depenses = depenses;
    state.supprimes = [];
    commit();
    toast('Exemples chargés. Vous pourrez tout effacer depuis l’onglet Données.');
  }

  // ---------- Écouteurs ----------
  function bind() {
    for (const t of $$('.tab')) t.addEventListener('click', () => setView(t.dataset.view));
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action], [data-goto], [data-close]');
      if (!btn) return;
      if (btn.hasAttribute('data-close')) {
        btn.closest('dialog').close();
        return;
      }
      if (btn.dataset.goto) {
        if (btn.dataset.filter) ui.statut = btn.dataset.filter;
        setView(btn.dataset.goto);
        return;
      }
      const actions = {
        'new-article': () => openArticle(),
        'new-depense': () => openDepense(),
        'export-json': exportJSON,
        'export-csv': exportCSV,
        demo: chargerExemples,
        reset: resetAll,
        install: installer,
      };
      const fn = actions[btn.dataset.action];
      if (fn) fn();
    });

    $('#theme-toggle').addEventListener('click', () => {
      const order = ['auto', 'light', 'dark'];
      state.settings.theme = order[(order.indexOf(state.settings.theme) + 1) % order.length];
      applyTheme();
      save();
      if (ui.view === 'dashboard') render();
    });

    $('#period-select').addEventListener('change', (e) => { ui.period = e.target.value; renderDashboard(); });
    $('#dep-period-select').addEventListener('change', (e) => { ui.depPeriod = e.target.value; renderDepenses(); });
    let searchTimer;
    $('#search').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { ui.search = e.target.value; renderArticles(); }, 120);
    });
    $('#filter-status').addEventListener('change', (e) => { ui.statut = e.target.value; renderArticles(); });
    $('#filter-category').addEventListener('change', (e) => { ui.categorie = e.target.value; renderArticles(); });
    $('#sort').addEventListener('change', (e) => { ui.tri = e.target.value; renderArticles(); });

    articleForm.addEventListener('submit', submitArticle);
    articleForm.addEventListener('input', updateArticleForm);
    articleForm.elements.statut.addEventListener('change', () => {
      const f = articleForm.elements;
      if (['vendu', 'expedie', 'finalise'].includes(f.statut.value)) {
        if (!f.dateVente.value) f.dateVente.value = today();
        if (!f.prixVente.value && f.prixAffiche.value) f.prixVente.value = f.prixAffiche.value;
      }
      if (f.statut.value === 'en_ligne' && !f.dateMiseEnLigne.value) f.dateMiseEnLigne.value = today();
      updateArticleForm();
    });
    depenseForm.addEventListener('submit', submitDepense);
    $('#photo-input').addEventListener('change', (e) => {
      const files = e.target.files ? [...e.target.files] : [];
      e.target.value = '';
      if (files.length) ajouterPhotos(files);
    });
    articleDialog.addEventListener('close', () => {
      // Formulaire abandonné : on efface les photos envoyées entre-temps.
      if (!formPhotos.enregistre) supprimerFichiersPhotos(formPhotos.ajoutees);
      formPhotos.ajoutees = [];
    });

    // Clic sur le fond : fermer le dialogue
    for (const dlg of [articleDialog, depenseDialog]) {
      dlg.addEventListener('mousedown', (e) => {
        if (e.target === dlg) dlg.close();
      });
    }

    $('#import-file').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) importFile(file);
      e.target.value = '';
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (ui.view === 'dashboard' && lastSerie) renderMonthlyChart($('#monthly-chart'), lastSerie);
      }, 120);
    });
    window.addEventListener('scroll', hideTip, { passive: true });

    // Synchronisation entre onglets du navigateur
    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) {
        load();
        render();
      }
    });
  }

  // ================= SYNCHRONISATION =================
  const S = window.VintedSync || { enabled: false, user: () => null };
  const sync = { statut: 'off', message: '', enCours: false, relancer: false, timer: null };

  function syncActive() {
    return Boolean(S.enabled && S.user());
  }

  function setSyncStatus(statut, message = '') {
    sync.statut = statut;
    sync.message = message;
    renderSyncIndicator();
    if (ui.view === 'donnees') renderSyncCard();
  }

  function scheduleSync(delai = 1500) {
    if (!syncActive()) return;
    clearTimeout(sync.timer);
    sync.timer = setTimeout(syncNow, delai);
  }

  async function syncNow() {
    if (!syncActive()) return;
    if (!navigator.onLine) {
      setSyncStatus('offline');
      return;
    }
    if (sync.enCours) {
      sync.relancer = true;
      return;
    }
    sync.enCours = true;
    setSyncStatus('syncing');
    try {
      const remote = await S.pull();
      // La fusion est synchrone : aucune modification locale ne peut s'intercaler.
      const r = C.fusionnerSync(state, remote, uid);
      state.articles = r.articles;
      state.depenses = r.depenses;
      state.supprimes = r.supprimes;
      state.sync.derniere = maintenant();
      save();
      if (r.recus) render();
      if (r.aPousser.length) await S.push(r.aPousser);
      setSyncStatus('ok');
    } catch (e) {
      console.warn('Synchronisation', e);
      setSyncStatus(navigator.onLine ? 'error' : 'offline', e.message);
    } finally {
      sync.enCours = false;
      if (sync.relancer) {
        sync.relancer = false;
        scheduleSync(300);
      }
    }
  }

  async function demarrerSync() {
    if (!S.enabled) return;
    try {
      const user = await S.init((u) => {
        photoUrls.clear();
        if (u) syncNow();
        else setSyncStatus('off');
        render();
      });
      if (user) {
        render();
        syncNow();
      } else setSyncStatus('off');
    } catch (e) {
      setSyncStatus('error', e.message);
    }
    window.addEventListener('online', () => scheduleSync(0));
    window.addEventListener('offline', () => syncActive() && setSyncStatus('offline'));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') scheduleSync(0);
    });
    setInterval(() => {
      if (document.visibilityState === 'visible') scheduleSync(0);
    }, 120000);
  }

  async function connexion(email, password) {
    await S.signIn(email, password);
    // Les données d'exemple ne doivent pas partir sur le serveur.
    const avant = state.articles.length + state.depenses.length;
    state.articles = state.articles.filter((a) => !a.id.startsWith('demo-'));
    state.depenses = state.depenses.filter((d) => !d.id.startsWith('demo-'));
    const retires = avant - state.articles.length - state.depenses.length;
    save();
    toast(retires ? 'Connecté. Les exemples ont été retirés de cet appareil.' : 'Connecté');
    await syncNow();
    render();
  }

  async function deconnexion() {
    if (!confirm('Se déconnecter ? Vos données restent sur cet appareil mais ne seront plus synchronisées.')) return;
    await S.signOut();
    photoUrls.clear();
    setSyncStatus('off');
    render();
  }

  function heure(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    const memeJour = d.toDateString() === new Date().toDateString();
    return memeJour
      ? `à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
      : `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  }

  function libelleStatut() {
    if (!S.enabled) return { niveau: 'off', texte: 'Synchronisation non configurée' };
    if (!S.user()) return { niveau: 'off', texte: 'Synchronisation désactivée (non connecté)' };
    switch (sync.statut) {
      case 'syncing': return { niveau: 'busy', texte: 'Synchronisation en cours…' };
      case 'offline': return { niveau: 'warn', texte: 'Hors ligne : vos changements seront envoyés au retour de la connexion' };
      case 'error': return { niveau: 'error', texte: `Échec de la synchronisation : ${sync.message}` };
      default: return { niveau: 'ok', texte: state.sync.derniere ? `Synchronisé ${heure(state.sync.derniere)}` : 'Connecté' };
    }
  }

  function renderSyncIndicator() {
    const btn = $('#sync-indicator');
    if (!btn) return;
    btn.hidden = !S.enabled;
    if (!S.enabled) return;
    const st = libelleStatut();
    btn.dataset.niveau = st.niveau;
    btn.title = st.texte;
    $('#sync-label').textContent = st.texte;
  }

  function renderSyncCard() {
    const host = $('#sync-card');
    if (!host) return;
    const titre = el('h2', { text: 'Synchronisation entre appareils' });
    if (!S.enabled) {
      host.replaceChildren(titre,
        el('p', { class: 'card-sub', text: 'Pas encore configurée. Une fois activée, vos articles, dépenses et photos seront identiques sur votre téléphone et votre ordinateur.' }),
        el('p', { class: 'hint', text: 'La marche à suivre est dans docs/synchronisation.md (dépôt GitHub).' }));
      return;
    }
    const user = S.user();
    if (!user) {
      const email = el('input', { type: 'email', name: 'email', autocomplete: 'username', required: true, placeholder: 'vous@exemple.fr' });
      const mdp = el('input', { type: 'password', name: 'password', autocomplete: 'current-password', required: true });
      const err = el('p', { class: 'form-error', role: 'alert' });
      const bouton = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Se connecter' });
      const form = el('form', { class: 'sync-form', novalidate: true },
        el('label', null, 'E-mail', email),
        el('label', null, 'Mot de passe', mdp),
        bouton, err);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        if (!email.value.trim() || !mdp.value) {
          err.textContent = 'Indiquez votre e-mail et votre mot de passe.';
          return;
        }
        bouton.disabled = true;
        bouton.textContent = 'Connexion…';
        try {
          await connexion(email.value.trim(), mdp.value);
        } catch (ex) {
          err.textContent = ex.message;
          bouton.disabled = false;
          bouton.textContent = 'Se connecter';
        }
      });
      host.replaceChildren(titre,
        el('p', { class: 'card-sub', text: 'Connectez-vous avec le même compte sur chaque appareil : vos données seront fusionnées puis tenues à jour automatiquement.' }),
        form);
      return;
    }
    const st = libelleStatut();
    host.replaceChildren(titre,
      el('p', { class: 'card-sub' }, 'Connecté : ', el('strong', { text: user.email || '' })),
      el('p', { class: 'sync-state', dataset: { niveau: st.niveau } }, el('span', { class: 'dot' }), el('span', { text: st.texte })),
      el('div', { class: 'row-gap' },
        el('button', { type: 'button', class: 'btn btn-primary', onclick: () => syncNow(), disabled: sync.enCours }, 'Synchroniser maintenant'),
        el('button', { type: 'button', class: 'btn', onclick: deconnexion }, 'Se déconnecter')));
  }

  // ================= PHOTOS =================
  let formPhotos = { list: [], ajoutees: [], retirees: [], envois: 0, enregistre: false };
  const photoUrls = new Map(); // chemin -> { url, expire }

  async function urlsPhotos(paths) {
    const now = Date.now();
    const manquants = paths.filter((p) => !(photoUrls.has(p) && photoUrls.get(p).expire > now));
    if (manquants.length && syncActive() && navigator.onLine) {
      const res = await S.signedUrls([...new Set(manquants)]);
      for (const [p, url] of Object.entries(res)) photoUrls.set(p, { url, expire: now + 50 * 60 * 1000 });
    }
    const out = {};
    for (const p of paths) if (photoUrls.has(p)) out[p] = photoUrls.get(p).url;
    return out;
  }

  function hydraterPhotos(root) {
    const imgs = [...root.querySelectorAll('img[data-path]')].filter((i) => !i.getAttribute('src'));
    if (!imgs.length || !syncActive()) return;
    urlsPhotos(imgs.map((i) => i.dataset.path))
      .then((urls) => {
        for (const img of imgs) if (urls[img.dataset.path]) img.src = urls[img.dataset.path];
      })
      .catch((e) => console.warn('Photos', e));
  }

  function supprimerFichiersPhotos(photos) {
    if (!photos || !photos.length || !syncActive()) return;
    S.remove(photos.flatMap((p) => [p.path, p.thumb])).catch((e) => console.warn('Suppression des photos', e));
  }

  async function chargerImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { img, liberer: () => URL.revokeObjectURL(url) };
    } catch (e) {
      URL.revokeObjectURL(url);
      throw new Error(`Format d'image non pris en charge (${file.name || 'photo'}).`);
    }
  }

  function versJpeg(img, max, qualite) {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const k = Math.min(1, max / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * k));
    canvas.height = Math.max(1, Math.round(h * k));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Conversion impossible'))), 'image/jpeg', qualite));
  }

  async function ajouterPhotos(files) {
    if (!syncActive()) {
      toast('Connectez la synchronisation (onglet Données) pour ajouter des photos.');
      return;
    }
    if (!navigator.onLine) {
      toast('Connexion internet nécessaire pour envoyer des photos.');
      return;
    }
    const form = formPhotos;
    const place = 20 - form.list.length - form.envois;
    const liste = [...files].slice(0, Math.max(0, place));
    if (files.length > liste.length) toast('20 photos maximum par article.');
    const userId = S.user().id;
    for (const file of liste) {
      form.envois += 1;
      renderGallery();
      let photo = null;
      try {
        const { img, liberer } = await chargerImage(file);
        let grande;
        let vignette;
        try {
          grande = await versJpeg(img, 1600, 0.82);
          vignette = await versJpeg(img, 320, 0.75);
        } finally {
          liberer();
        }
        const id = uid();
        photo = { id, path: `${userId}/${id}.jpg`, thumb: `${userId}/${id}_t.jpg` };
        await S.upload(photo.thumb, vignette);
        await S.upload(photo.path, grande);
        if (formPhotos === form && articleDialog.open) {
          form.list.push(photo);
          form.ajoutees.push(photo);
        } else {
          supprimerFichiersPhotos([photo]); // formulaire fermé entre-temps
        }
      } catch (e) {
        if (photo) supprimerFichiersPhotos([photo]);
        toast(e.message || 'Envoi de la photo impossible');
      } finally {
        form.envois -= 1;
        if (formPhotos === form) renderGallery();
      }
    }
  }

  function retirerPhoto(id) {
    const i = formPhotos.list.findIndex((p) => p.id === id);
    if (i < 0) return;
    const [p] = formPhotos.list.splice(i, 1);
    const ajout = formPhotos.ajoutees.findIndex((x) => x.id === id);
    if (ajout >= 0) {
      formPhotos.ajoutees.splice(ajout, 1);
      supprimerFichiersPhotos([p]);
    } else formPhotos.retirees.push(p);
    renderGallery();
  }

  async function ouvrirPhoto(p) {
    const fenetre = window.open('', '_blank');
    try {
      const urls = await urlsPhotos([p.path]);
      if (urls[p.path] && fenetre) fenetre.location = urls[p.path];
      else if (fenetre) fenetre.close();
    } catch (e) {
      if (fenetre) fenetre.close();
      toast(e.message);
    }
  }

  function renderGallery() {
    const host = $('#photo-gallery');
    if (!host) return;
    const items = formPhotos.list.map((p) => el('div', { class: 'photo' },
      el('button', { type: 'button', class: 'photo-open', title: 'Agrandir', 'aria-label': 'Agrandir la photo', onclick: () => ouvrirPhoto(p) },
        el('img', { alt: '', 'data-path': p.thumb })),
      el('button', { type: 'button', class: 'photo-del', title: 'Retirer', 'aria-label': 'Retirer la photo', onclick: () => retirerPhoto(p.id) }, '✕')));
    for (let i = 0; i < formPhotos.envois; i++) items.push(el('div', { class: 'photo loading', text: 'Envoi…' }));
    host.replaceChildren(...items);
    hydraterPhotos(host);
    const actif = syncActive();
    $('#photo-add').classList.toggle('disabled', !actif);
    $('#photo-input').disabled = !actif;
    $('#photo-hint').textContent = actif
      ? 'Depuis la galerie, l’appareil photo ou Google Drive. Les photos sont réduites puis stockées avec votre compte.'
      : S.enabled
        ? 'Connectez la synchronisation (onglet Données) pour ajouter des photos.'
        : 'Les photos nécessitent la synchronisation (voir onglet Données).';
  }

  // ---------- Application installable (PWA) ----------
  let installPrompt = null;
  const estInstallee = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

  function majInstallation() {
    const btn = $('#install-btn');
    const hint = $('#install-hint');
    if (!btn) return;
    btn.hidden = !installPrompt;
    if (estInstallee()) {
      $('#install-text').textContent = 'Vous utilisez déjà Suivi Vinted en tant qu’application installée. 👍';
      hint.textContent = '';
    } else if (location.protocol === 'file:') {
      hint.textContent = 'L’installation n’est pas possible quand le fichier est ouvert directement depuis l’ordinateur. Ouvrez l’application depuis son adresse en ligne (GitHub Pages) ou via « npm start ».';
    } else if (installPrompt) {
      hint.textContent = '';
    } else {
      hint.textContent = 'Si le bouton n’apparaît pas : dans Chrome ou Edge, ouvrez le menu ⋮ puis « Installer Suivi Vinted » (ou « Applications → Installer ce site en tant qu’application »). Sur Mac avec Safari : Fichier → « Ajouter au Dock ». Sur iPhone : Partager → « Sur l’écran d’accueil ».';
    }
  }

  async function installer() {
    if (!installPrompt) return;
    installPrompt.prompt();
    const choix = await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    majInstallation();
    if (choix && choix.outcome === 'accepted') toast('Application installée');
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt = e;
    majInstallation();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = null;
    majInstallation();
  });
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker non enregistré', e));
    });
  }

  // ---------- Démarrage ----------
  load();
  applyTheme();
  bind();
  demarrerSync();
  const initial = (location.hash || '').slice(1);
  setView(['dashboard', 'articles', 'depenses', 'donnees'].includes(initial) ? initial : 'dashboard');
})();
