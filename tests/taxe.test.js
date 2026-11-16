// Les nombres de l'écran de taxe : ils découlent des fiches, s'arrondissent vers le bas, et changent d'une partie à l'autre.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../tools/content.mjs';
import { taxNumbers, perYear, round, draw } from '../src/client/tax.js';
import { taxScales, taxUses, taxShocks } from '../src/client/collection.js';

const { bundle } = loadContent();
/** « 64 000 » avec une espace ordinaire : le français des nombres met une espace fine insécable. */
const plain = (text) => text.replace(/\s/g, ' ');

test('taxe : la fortune à l’échelle d’un revenu, donné par an ou par mois', () => {
  const yearly = taxNumbers(120, { valeur: 180000 });
  assert.equal(yearly.fortune, 120e9);
  assert.equal(Math.round(yearly.years), 666667);
  assert.equal(plain(round(yearly.years)), '660 000', 'arrondi vers le bas, à deux chiffres');
  const monthly = taxNumbers(120, { valeur: 15000, par: 'mois' });
  assert.equal(monthly.years, yearly.years, '15 000 par mois, c’est 180 000 par an');
  assert.equal(yearly.tax, 2.4e9, '2 % par an');
});

test('taxe : ce que 2 % paieraient, jamais plus que le vrai', () => {
  const scale = { valeur: 180000 };
  assert.equal(plain(round(taxNumbers(121.2, scale, { valeur: 37500 }).count)), '64 000', '2,424 milliards / 37 500 = 64 640');
  assert.equal(taxNumbers(121.2, scale, { valeur: 3125, par: 'mois' }).count, taxNumbers(121.2, scale, { valeur: 37500 }).count,
    'un coût donné par mois compte douze fois sur l’année');
  assert.equal(taxNumbers(121.2, scale, null).count, 0, 'sans exemple : pas de nombre');
  for (const n of [1, 9, 10, 99, 247, 64640, 999999, 6.8e6]) {
    const shown = Number(round(n).replace(/\s/g, ''));
    assert.ok(shown <= n && shown > n * 0.89, `${n} → ${round(n)}`);
  }
});

test('taxe : ce que la fortune rapporte en un an est le produit de ses fiches', () => {
  const rent = [{ valeur: 13 }, { valeur: 248874567 }];
  assert.equal(taxNumbers(121.2, { valeur: 180000 }, null, rent).yearly, 13 * 248874567);
  assert.equal(taxNumbers(121.2, { valeur: 180000 }, null, [{ valeur: 13 }, undefined]).yearly, 0, 'une fiche manque : on ne dit rien');
  assert.equal(taxNumbers(121.2, { valeur: 180000 }).yearly, 0);
});

test('taxe : le tirage ne redonne pas le dernier, s’il y a le choix', () => {
  const two = [{ id: 'a' }, { id: 'b' }];
  let before = draw('essai', two).id;
  for (let i = 0; i < 20; i++) {
    const now = draw('essai', two).id;
    assert.notEqual(now, before);
    before = now;
  }
  assert.equal(draw('seul', [{ id: 'a' }]).id, 'a');
  assert.equal(draw('seul', [{ id: 'a' }]).id, 'a', 'un seul choix : il revient');
  assert.equal(draw('vide', []), undefined);
});

test('taxe : chaque fiche du dictionnaire donne un nombre affichable avec chaque boss', () => {
  assert.ok(taxScales(bundle).length >= 2 && taxUses(bundle).length >= 10 && taxShocks(bundle).length >= 10);
  for (const boss of Object.values(bundle.boss)) {
    if (!boss.fortune.montant) continue;
    for (const scale of taxScales(bundle)) {
      const { years, stackYears } = taxNumbers(boss.fortune.montant, scale);
      assert.ok(years >= 100, `${boss.id} / ${scale.id} : ${years} ans`);
      assert.ok(years / stackYears >= 1, `${boss.id} / ${scale.id} : au moins une liasse`);
    }
    for (const use of taxUses(bundle)) {
      const { count } = taxNumbers(boss.fortune.montant, taxScales(bundle)[0], use);
      assert.ok(count >= 10, `${boss.id} / ${use.id} : ${count} ${use.finance}`);
      assert.ok(perYear(use) > 0);
    }
  }
});
