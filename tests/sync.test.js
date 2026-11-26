const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');

let n = 0;
const genId = () => `g-${++n}`;
const art = (id, t, extra = {}) => ({ id, titre: `Article ${id}`, statut: 'stock', modifieLe: t, ...extra });
const row = (id, t, data = {}, deleted = false, kind = 'article') => ({ id, kind, data: deleted ? {} : { titre: `Distant ${id}`, ...data }, updated_at: t, deleted });

test('premier envoi : tout le local part au serveur', () => {
  const r = C.fusionnerSync({ articles: [art('a', '2026-01-01T10:00:00.000Z'), art('b', '')], depenses: [{ id: 'd', libelle: 'x', montant: 2, modifieLe: '2026-01-02T00:00:00.000Z' }], supprimes: [] }, [], genId);
  assert.equal(r.aPousser.length, 3);
  assert.equal(r.recus, 0);
  assert.equal(r.aPousser.find((p) => p.id === 'b').updated_at, '1970-01-01T00:00:00.000Z');
  assert.equal(r.aPousser.find((p) => p.id === 'd').kind, 'depense');
});

test('nouvel appareil : il récupère tout depuis le serveur', () => {
  const r = C.fusionnerSync({ articles: [], depenses: [], supprimes: [] }, [row('a', '2026-01-01T10:00:00+00:00', { prixAchat: 5 }), row('z', '2026-01-03T10:00:00+00:00', {}, true)], genId);
  assert.equal(r.articles.length, 1);
  assert.equal(r.articles[0].titre, 'Distant a');
  assert.equal(r.articles[0].prixAchat, 5);
  assert.equal(r.articles[0].modifieLe, '2026-01-01T10:00:00.000Z');
  assert.equal(r.supprimes.length, 1);
  assert.equal(r.aPousser.length, 0);
});

test('la version la plus récente gagne, dans les deux sens', () => {
  const local = { articles: [art('a', '2026-01-05T00:00:00.000Z'), art('b', '2026-01-01T00:00:00.000Z')], depenses: [], supprimes: [] };
  const r = C.fusionnerSync(local, [row('a', '2026-01-02T00:00:00Z'), row('b', '2026-01-09T00:00:00Z')], genId);
  assert.deepEqual(r.aPousser.map((p) => p.id), ['a']);
  assert.equal(r.articles.find((x) => x.id === 'a').titre, 'Article a');
  assert.equal(r.articles.find((x) => x.id === 'b').titre, 'Distant b');
  assert.equal(r.recus, 1);
});

test('versions identiques : rien à faire', () => {
  const t = '2026-01-05T00:00:00.000Z';
  const r = C.fusionnerSync({ articles: [art('a', t)], depenses: [], supprimes: [] }, [row('a', '2026-01-05T00:00:00+00:00')], genId);
  assert.equal(r.aPousser.length, 0);
  assert.equal(r.recus, 0);
  assert.equal(r.articles[0].titre, 'Article a');
});

test('suppression locale envoyée, suppression distante appliquée', () => {
  const local = {
    articles: [art('b', '2026-01-01T00:00:00.000Z')],
    depenses: [],
    supprimes: [{ id: 'a', kind: 'article', modifieLe: '2026-02-01T00:00:00.000Z' }],
  };
  const r = C.fusionnerSync(local, [row('a', '2026-01-10T00:00:00Z'), row('b', '2026-01-20T00:00:00Z', {}, true)], genId);
  assert.deepEqual(r.aPousser, [{ id: 'a', kind: 'article', data: {}, updated_at: '2026-02-01T00:00:00.000Z', deleted: true }]);
  assert.equal(r.articles.length, 0, 'b a été supprimé ailleurs, a ici');
  assert.deepEqual(r.supprimes.map((s) => s.id).sort(), ['a', 'b']);
  assert.equal(r.recus, 1);
});

test('un article restauré après suppression ailleurs revient s’il est plus récent', () => {
  const r = C.fusionnerSync({ articles: [art('a', '2026-03-01T00:00:00.000Z')], depenses: [], supprimes: [] }, [row('a', '2026-02-01T00:00:00Z', {}, true)], genId);
  assert.equal(r.articles.length, 1);
  assert.equal(r.aPousser[0].deleted, false);
});

test('les lignes distantes invalides sont ignorées', () => {
  const r = C.fusionnerSync({ articles: [], depenses: [], supprimes: [] }, [{ id: 'x', kind: 'article', data: { titre: '' }, updated_at: '2026-01-01T00:00:00Z', deleted: false }, { id: 'y', kind: 'pirate', data: {}, updated_at: '' }], genId);
  assert.equal(r.articles.length, 0);
});

test('photos : chemins valides conservés, autres rejetés', () => {
  const a = C.normaliserArticle({ titre: 'x', photos: [
    { id: 'p1', path: '0b7e-uid/p1.jpg', thumb: '0b7e-uid/p1_t.jpg' },
    { id: 'p2', path: '../secret.jpg', thumb: 'a/b.jpg' },
    'nope',
  ] }, genId);
  assert.deepEqual(a.photos, [{ id: 'p1', path: '0b7e-uid/p1.jpg', thumb: '0b7e-uid/p1_t.jpg' }]);
});
