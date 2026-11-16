// Les nombres de l'écran de taxe : ils découlent des fiches, s'arrondissent vers le bas, et changent d'une partie à l'autre.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../tools/content.mjs';
import { taxNumbers, perYear, round, money, draw, heap, stackYearsFor, usesFor, MIN_COUNT, SLOGANS } from '../src/client/tax.js';
import { TAX_RATES, taxFiches, taxScales, taxUses, taxShocks } from '../src/client/collection.js';

const { bundle } = loadContent();
/** « 64 000 » avec une espace ordinaire : le français des nombres met une espace fine insécable. */
const plain = (text) => text.replace(/\s/g, ' ');
const bosses = Object.values(bundle.boss).filter((b) => b.fortune.montant);

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

test('taxe : les sommes s’écrivent arrondies vers le bas, en milliards ou en millions', () => {
  assert.equal(plain(money(121.2e9 * 0.02)), '2,4 milliards');
  assert.equal(plain(money(69.7e9 * 0.02)), '1,3 milliard', '1,394 milliard : pas « 1,4 », qui dirait plus que le vrai');
  assert.equal(plain(money(3e9)), '3 milliards');
  assert.equal(plain(money(10.8e9 * 0.02)), '210 millions', '216 millions, à deux chiffres');
  assert.equal(plain(money(3.235e9)), '3,2 milliards');
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
  const said = draw('mots', ['un', 'deux']);
  assert.notEqual(draw('mots', ['un', 'deux']), said, 'des mots aussi');
});

test('taxe : le tas remplit toujours son cadre, de la plus petite à la plus grande fortune', () => {
  for (const boss of bosses) {
    for (const scale of taxScales(bundle)) {
      const { years, stackYears } = taxNumbers(boss.fortune.montant, scale);
      const count = years / stackYears;
      assert.ok(count > 285 && count <= 380, `${boss.id} / ${scale.id} : ${Math.round(count)} liasses de ${stackYears} ans`);
      assert.ok(years >= 100, `${boss.id} / ${scale.id} : ${years} ans`);
    }
  }
  assert.equal(stackYearsFor(6.5e6), 20000, 'Arnault, chauffeur de taxi : 325 liasses de 20 000 ans');
  assert.equal(stackYearsFor(1661), 5, 'Bolloré, patron du CAC 40 : des liasses de 5 ans');
  for (const count of [1, 8, 300, 380, 400]) {
    const { stacks, rows, width } = heap(count);
    assert.equal(stacks.length, count);
    for (let r = 1; r < rows; r++) {
      const below = stacks.filter((s) => s.row === r - 1).length;
      const here = stacks.filter((s) => s.row === r).length;
      assert.ok(here < below, `rangée ${r} : ${here} liasses sur ${below}`);
    }
    assert.ok(stacks.every((s) => s.x >= 0 && s.x < width));
  }
  const { rows, width } = heap(380);
  assert.ok(rows >= 18 && width < 260, 'un tas haut, pas une galette');
});

test('taxe : un exemple n’est tiré que si 2 % en paient au moins dix (un choix à valider)', () => {
  assert.ok(taxScales(bundle).length >= 2 && taxUses(bundle).length >= 10 && taxShocks(bundle).length >= 10);
  const canadair = bundle.fiches['canadair-cout'];
  assert.ok(canadair, 'le Canadair est au dictionnaire');
  assert.ok(!usesFor(bundle, 10.8).includes(canadair), '2 % de 10,8 milliards : 2 Canadair, pas tiré');
  assert.ok(usesFor(bundle, 121.2).includes(canadair), '2 % de 121,2 milliards : 26 Canadair');
  for (const boss of bosses) {
    for (const use of usesFor(bundle, boss.fortune.montant)) {
      const { count } = taxNumbers(boss.fortune.montant, taxScales(bundle)[0], use);
      assert.ok(count >= MIN_COUNT, `${boss.id} / ${use.id} : ${count} ${use.finance}`);
    }
  }
});

test('taxe : 27 % ne se montre jamais sans 52 %', () => {
  const rates = TAX_RATES.map((id) => bundle.fiches[id]);
  assert.deepEqual(rates.map((f) => f?.valeur), [52, 27]);
  for (const fact of rates) {
    assert.ok(!fact.choc, `${fact.id} n’est pas tiré seul comme fait choc`);
    assert.match(plain(fact.texte), /52 %/, `${fact.id} : le texte dit 52 %`);
    assert.match(plain(fact.texte), /27 %/, `${fact.id} : le texte dit 27 %`);
  }
  for (const boss of bosses) assert.ok(TAX_RATES.every((id) => taxFiches(bundle, boss, []).includes(id)), 'débloqués ensemble');
});

test('taxe : les slogans du bouton ont été scandés en manif', () => {
  assert.ok(SLOGANS.includes('On lâche rien !'));
  for (const slogan of SLOGANS.filter((s) => s !== 'On lâche rien !')) {
    const line = bundle.pancartes.find((p) => p.texte === slogan);
    assert.ok(line, `« ${slogan} » est dans content/pancartes/`);
    assert.match(line.credit, /^scandé /, `« ${slogan} » : ${line.credit}`);
    assert.ok(slogan.length <= 40, `« ${slogan} » tient sur un bouton`);
  }
});
