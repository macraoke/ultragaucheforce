// Garde-fous relevés en relecture : des identifiants piégés, des liens douteux, et la
// musique qui ne doit rien charger tant que le joueur ne l'a pas demandée.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readContentFiles } from '../tools/content.mjs';
import { buildContent } from '../src/content/rules.js';
import { loadSave } from '../src/client/save.js';

const files = readContentFiles();
const withFile = (path, text) => [...files.filter((f) => f.path !== path), { path, text }];

test('« constructor » ou « toString » ne passent pas pour un contenu existant', () => {
  const campaign = buildContent(withFile('content/campagne.txt', 'constructor\n'));
  assert.ok(campaign.errors.some((e) => e.file === 'content/campagne.txt' && e.message.includes("n'existe pas")));
  assert.deepEqual(campaign.bundle.campagne, []);

  const level = files.find((f) => f.path === 'content/niveaux/bismillah.txt');
  const boss = buildContent(withFile(level.path, level.text.replace('fond: ville', 'fond: ville\nboss: toString')));
  assert.ok(boss.errors.some((e) => e.file === level.path && e.message.includes('toString')));
});

test('la source d’un bruitage est une adresse https, rien d’autre', () => {
  const { errors } = buildContent(withFile('content/sons/saut.txt', 'nom: Saut\nzzfx: 1,.05,280\nsource: javascript:alert(1)\n'));
  assert.ok(errors.some((e) => e.file === 'content/sons/saut.txt' && e.message.includes('https://')));
});

test('première visite : la musique est coupée, donc aucun lecteur externe n’est chargé', () => {
  assert.equal(loadSave().options.musique, false);
});
