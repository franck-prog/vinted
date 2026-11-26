const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');

let n = 0;
const genId = () => `id-${++n}`;

const articles = [
  { id: 'a', titre: 'Jean Levis', categorie: 'Vêtements homme', statut: 'finalise', prixAchat: 5, frais: 1, prixVente: 25, dateMiseEnLigne: '2026-01-10', dateVente: '2026-01-20' },
  { id: 'b', titre: 'Robe', categorie: 'Vêtements femme', statut: 'expedie', prixAchat: 10, prixVente: 18, dateMiseEnLigne: '2026-02-01', dateVente: '2026-02-05' },
  { id: 'c', titre: 'Baskets', categorie: 'Chaussures', statut: 'en_ligne', prixAchat: 20, prixAffiche: 45, dateMiseEnLigne: '2026-03-01' },
  { id: 'd', titre: 'Sac', categorie: 'Sacs', statut: 'vendu', prixAchat: '12,50', prixVente: '30', dateAchat: '2025-12-01', dateVente: '2025-12-15' },
  { id: 'e', titre: 'Pull', statut: 'annule', prixAchat: 3, prixVente: 9, dateVente: '2026-01-02' },
];
const depenses = [
  { id: 'x', date: '2026-01-05', libelle: 'Enveloppes', montant: 4 },
  { id: 'y', date: '2025-11-05', libelle: 'Boost', montant: 2 },
];

test('num accepte les virgules et les espaces', () => {
  assert.equal(C.num('12,50'), 12.5);
  assert.equal(C.num('1 200,5'), 1200.5);
  assert.equal(C.num(''), 0);
  assert.equal(C.num('abc'), 0);
});

test('bénéfice par article', () => {
  assert.equal(C.benefice(articles[0]), 19);
  assert.equal(C.benefice(articles[3]), 17.5);
  assert.equal(C.benefice(articles[2]), null, 'un article invendu n’a pas de bénéfice réalisé');
  assert.equal(C.benefice(articles[4]), null, 'une vente annulée ne compte pas');
  assert.equal(C.beneficePotentiel(articles[2]), 25);
});

test('statistiques sur une année', () => {
  const s = C.computeStats(articles, depenses, '2026', '2026-03-31');
  assert.equal(s.nbVentes, 2);
  assert.equal(s.ca, 43);
  assert.equal(s.beneficeBrut, 27);
  assert.equal(s.totalDepenses, 4);
  assert.equal(s.beneficeNet, 23);
  assert.equal(s.delaiMoyen, 7); // (10 + 4) / 2
  assert.equal(s.panierMoyen, 21.5);
  assert.equal(s.nbStock, 1);
  assert.equal(s.valeurStock, 20);
  assert.equal(s.valeurAffichee, 45);
  assert.equal(s.nbAttente, 2); // expédié + vendu (toutes périodes)
  assert.equal(s.montantAttente, 48);
});

test('statistiques toutes périodes', () => {
  const s = C.computeStats(articles, depenses, 'all', '2026-03-31');
  assert.equal(s.nbVentes, 3);
  assert.equal(s.ca, 73);
  assert.equal(s.beneficeNet, 44.5 - 6);
});

test('mois affichés', () => {
  assert.deepEqual(C.moisPourPeriode('2025', '2026-03-10').slice(0, 2), ['2025-01', '2025-02']);
  const glissant = C.moisPourPeriode('all', '2026-03-10');
  assert.equal(glissant.length, 12);
  assert.equal(glissant[0], '2025-04');
  assert.equal(glissant[11], '2026-03');
});

test('série mensuelle', () => {
  const serie = C.serieMensuelle(articles, depenses, ['2026-01', '2026-02']);
  assert.deepEqual(serie[0], { mois: '2026-01', nbVentes: 1, ca: 25, depenses: 4, benefice: 15 });
  assert.equal(serie[1].benefice, 8);
});

test('bénéfice par catégorie trié', () => {
  const cats = C.parCategorie(articles, 'all');
  assert.equal(cats[0].categorie, 'Vêtements homme');
  assert.equal(cats.length, 3);
});

test('DAC7', () => {
  const d = C.dac7(articles, 2026);
  assert.equal(d.nbVentes, 2);
  assert.equal(d.montant, 43);
  assert.equal(d.seuilVentes, 30);
  assert.equal(d.seuilMontant, 2000);
});

test('années disponibles', () => {
  assert.deepEqual(C.anneesDisponibles(articles, depenses, '2026-03-10'), ['2026', '2025']);
});

test('import : normalisation et rejet', () => {
  const data = C.lireSauvegarde({
    articles: [{ titre: '  T-shirt ', statut: 'inconnu', prixAchat: '-3', lien: 'javascript:alert(1)', dateVente: '2026-13-45' }],
  }, genId);
  const a = data.articles[0];
  assert.equal(a.titre, 'T-shirt');
  assert.equal(a.statut, 'stock');
  assert.equal(a.prixAchat, '');
  assert.equal(a.lien, '');
  assert.ok(a.id.startsWith('id-'));
  assert.deepEqual(data.depenses, []);
  assert.throws(() => C.lireSauvegarde({ foo: 1 }, genId));
  assert.throws(() => C.lireSauvegarde({ articles: [{}] }, genId));
});

test('export CSV', () => {
  const csv = C.articlesCSV([{ titre: 'Veste "cuir"; noire', statut: 'finalise', prixAchat: 10, prixVente: 32.5, frais: '' }]);
  const [entete, ligne] = csv.split('\r\n');
  assert.ok(entete.startsWith('Titre;Marque'));
  assert.ok(ligne.startsWith('"Veste ""cuir""; noire"'));
  assert.ok(ligne.includes('32,50'));
  assert.ok(ligne.includes('22,50'));
});
