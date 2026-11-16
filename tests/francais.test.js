// Le français des textes calculés : « de » qui s'élide, le pluriel qui commence à 2.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../tools/content.mjs';
import { de, plural, money, billions } from '../src/client/dom.js';

const { bundle } = loadContent();
const plain = (text) => text.replace(/\s/g, ' ');

test('français : « de » s’élide devant une voyelle et un h muet', () => {
  const cases = {
    'Emmanuel Besnier': 'd’Emmanuel Besnier',
    'Bernard Arnault': 'de Bernard Arnault',
    'Françoise Bettencourt Meyers': 'de Françoise Bettencourt Meyers',
    'Éric Zemmour': 'd’Éric Zemmour',
    'Hélène Dupont': 'd’Hélène Dupont',
    'Hollande': 'de Hollande',
    'Yves Saint Laurent': 'd’Yves Saint Laurent',
    'Yannick Jadot': 'de Yannick Jadot',
    'Lea Salamé': 'de Lea Salamé',
    'un chirurgien': 'd’un chirurgien',
    'une personne au Smic': 'd’une personne au Smic',
    'Le Milliardaire invisible': 'du Milliardaire invisible',
    'La Dernière Famille royale': 'de la Dernière Famille royale',
    "L'Héritière discrète": 'de l’Héritière discrète',
    'Les Riches': 'des Riches',
    'la famille d’Emmanuel Besnier': 'de la famille d’Emmanuel Besnier',
  };
  for (const [name, expected] of Object.entries(cases)) assert.equal(de(name), expected, name);
});

test('français : chaque boss et chaque échelle de la scène de taxe s’écrivent sans faute', () => {
  for (const boss of Object.values(bundle.boss)) {
    const said = de(`la famille ${de(boss.inspiration || boss.nom)}`);
    assert.doesNotMatch(said, /\bde [AEIOUÉÈÊÀÂÎÔÛaeiouéèêàâîôû]/, `${boss.id} : « ${said} »`);
    assert.doesNotMatch(de(boss.nom), /\bde (Le|La|Les|L') /, `${boss.id} : « ${de(boss.nom)} »`);
  }
  for (const fact of Object.values(bundle.fiches).filter((f) => f.compare)) {
    assert.doesNotMatch(de(fact.compare), /\bde [aeiouéèêàâîôû]/i, `${fact.id} : « ${de(fact.compare)} »`);
  }
  assert.equal(de(`la famille ${de(bundle.boss.besnier.inspiration)}`), 'de la famille d’Emmanuel Besnier');
});

test('français : le pluriel commence à 2, partout où le jeu écrit des milliards', () => {
  assert.equal(plural(1.5, 'milliard', 'milliards'), 'milliard');
  assert.equal(plural(0.2, 'milliard', 'milliards'), 'milliard');
  assert.equal(plural(2, 'milliard', 'milliards'), 'milliards');
  assert.equal(plain(billions(0.2)), '0,2 milliard');
  assert.equal(plain(billions(1.9)), '1,9 milliard');
  assert.equal(plain(billions(121.2)), '121,2 milliards');
  assert.equal(plain(billions(14)), '14 milliards');
  assert.equal(plain(money(1.394e9)), '1,3 milliard');
  assert.equal(plain(money(2.424e9)), '2,4 milliards');
  assert.equal(plain(money(0.2e9)), '200 millions', 'sous le milliard, en millions');
  assert.equal(plain(money(1.5e6)), '1 million');
  assert.equal(plain(money(3.4e6)), '3 millions');
  for (const boss of Object.values(bundle.boss)) {
    const { montant } = boss.fortune;
    if (montant) assert.match(plain(billions(montant)), montant >= 2 ? / milliards$/ : / milliard$/, boss.id);
  }
});
