// La Collection : toutes les fiches du contenu deviennent des cartes, rangées et numérotées.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../tools/content.mjs';
import { SHELVES, allCards, cardId, cardName, citationOfWord, hintLine, levelOrder, whereToFind } from '../src/client/collection.js';

const { bundle } = loadContent();
const cards = allCards(bundle);

test('collection : une carte par fiche, numérotée, avec un nom et une clé unique', () => {
  assert.deepEqual(cards.map((c) => c.number), cards.map((_, i) => i + 1));
  const keys = cards.map((c) => `${c.kind}:${cardId(c.item)}`);
  assert.equal(new Set(keys).size, keys.length, 'aucune carte en double');
  for (const c of cards) assert.ok(cardName(c.item), `${c.kind}:${cardId(c.item)} a un nom`);
  for (const kind of ['heros', 'recrues', 'ennemis', 'boss', 'niveaux', 'citations', 'fiches', 'drapeaux']) {
    assert.equal(cards.filter((c) => c.kind === kind).length, Object.keys(bundle[kind]).length, kind);
  }
});

test('collection : chaque rayon a ses cartes ; faits et propositions se partagent les fiches', () => {
  for (const shelf of SHELVES) assert.ok(cards.some((c) => c.shelf === shelf.id), `rayon « ${shelf.titre} »`);
  const of = (id) => cards.filter((c) => c.shelf === id);
  assert.ok(of('propositions').every((c) => c.item.theme === 'programme'));
  assert.ok(of('faits').every((c) => c.item.theme !== 'programme'));
  assert.equal(of('faits').length + of('propositions').length, Object.keys(bundle.fiches).length);
});

test('collection : toute pancarte, tout bandeau devient une carte, avec ou sans source', () => {
  const lines = { ...bundle, pancartes: [...bundle.pancartes, { texte: 'SANS SOURCE', credit: '', rarete: 0 }] };
  const signs = allCards(lines).filter((c) => c.kind === 'pancartes');
  assert.equal(signs.length, bundle.pancartes.length + 1);
  assert.equal(allCards(bundle).filter((c) => c.kind === 'manchettes').length, bundle.manchettes.length);
});

test('collection : chaque carte se débloque quelque part en jouant', () => {
  const lost = cards.filter((c) => whereToFind(bundle, c.kind, c.item).length === 0).map((c) => `${c.kind}:${cardId(c.item)}`);
  assert.deepEqual(lost, [], 'cartes sans aucun chemin : attache-les à un personnage, un niveau, une scène');
  const hint = (kind, id) => whereToFind(bundle, kind, kind === 'pancartes' ? bundle.pancartes.find((p) => p.texte === id) : bundle[kind][id]);
  assert.deepEqual(hint('pancartes', 'MACRON, RENDS-NOUS LE POGNON !'), ['dans la manif'], 'même le slogan d’une recrue se tire au hasard');
  assert.deepEqual(hint('heros', 'zucman'), ['dans une garde à vue']);
  assert.deepEqual(hint('pancartes', 'TAXEZ LES RICHES'), ['dans la manif']);
  assert.deepEqual(hint('citations', 'melenchon-bruit-et-fureur'), ["L'Ingénieur du chaos"], 'les mots du héros viennent de sa citation');
  assert.deepEqual(hint('fiches', 'procuration'), ['à la fin de la campagne']);
  assert.deepEqual(hint('fiches', 'patrimoine-moitie'), ['en taxant une fortune']);
  assert.ok(hint('ennemis', 'gendarme-mobile').length >= 1, 'les renforts de l’hélicoptère comptent');
});

test('collection : les indices suivent l’ordre de la campagne ; un boss tiré au hasard se croise au bout de n’importe quel niveau', () => {
  const order = levelOrder(bundle);
  const crs = whereToFind(bundle, 'ennemis', bundle.ennemis.crs);
  assert.deepEqual(crs, order.filter((id) => crs.includes(bundle.niveaux[id].titre)).map((id) => bundle.niveaux[id].titre), 'dans l’ordre des étapes');
  for (const boss of Object.values(bundle.boss)) assert.deepEqual(whereToFind(bundle, 'boss', boss), ['au bout de n’importe quel niveau'], boss.id);
  // Un niveau qui impose son boss : les autres boss ne s'y croisent plus ; on nomme alors les niveaux, dans l'ordre.
  const [first, ...rest] = order.filter((id) => bundle.niveaux[id].carte.some((row) => row.includes('Y')));
  const [one, other] = Object.keys(bundle.boss);
  const imposed = { ...bundle, niveaux: { ...bundle.niveaux, [first]: { ...bundle.niveaux[first], boss: one } } };
  assert.deepEqual(whereToFind(imposed, 'boss', bundle.boss[other]), rest.map((id) => bundle.niveaux[id].titre));
  assert.deepEqual(whereToFind(imposed, 'boss', bundle.boss[one]), ['au bout de n’importe quel niveau']);
});

test('collection : la ligne d’indice se lit d’un trait, sans « dans » en double', () => {
  assert.equal(hintLine(['dans une garde à vue'], false), 'À découvrir dans une garde à vue');
  assert.equal(hintLine(['dans une garde à vue'], true), 'Vu dans une garde à vue');
  assert.equal(hintLine(['au bout de n’importe quel niveau'], true), 'Vu au bout de n’importe quel niveau');
  assert.equal(hintLine(['Le rond-point', 'La raffinerie bloquée'], false), 'À découvrir : Le rond-point');
  assert.equal(hintLine(['Le rond-point', 'La raffinerie bloquée'], true), 'Vu dans : Le rond-point, La raffinerie bloquée');
  assert.equal(hintLine([], false), 'À découvrir');
  for (const c of cards) {
    for (const found of [false, true]) assert.doesNotMatch(hintLine(whereToFind(bundle, c.kind, c.item), found), /dans : dans|: (dans|au|en|à|sur) /, `${c.kind}:${cardId(c.item)}`);
  }
});

test('collection : un mot crié en jeu retrouve sa citation, par son mot-clé ou par ses propres mots', () => {
  assert.equal(citationOfWord(bundle, 'ÉCOTERRORISME !').id, 'darmanin-ecoterrorisme');
  assert.equal(citationOfWord(bundle, 'LA FUREUR !').id, 'melenchon-bruit-et-fureur');
  assert.equal(citationOfWord(bundle, 'MOT INCONNU !'), undefined);
  for (const speaker of [...Object.values(bundle.heros), ...Object.values(bundle.ennemis)]) {
    for (const word of speaker.arme?.mots || []) assert.ok(citationOfWord(bundle, word), `${speaker.id} : « ${word} » ne vient d'aucune citation`);
  }
});
