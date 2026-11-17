// Les écrans hors partie : ce qu'ils écrivent se lit d'une seule façon.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { licenceName } from '../src/client/ui.js';
import { quoted } from '../src/client/dom.js';
import { loadContent } from '../tools/content.mjs';

test('à propos : les licences s’écrivent toutes de la même façon', () => {
  assert.equal(licenceName('CC-BY-4.0'), 'CC BY 4.0');
  assert.equal(licenceName('CC-BY-SA-3.0'), 'CC BY-SA 3.0');
  assert.equal(licenceName('CC0-1.0'), 'CC0 1.0');
  assert.equal(licenceName('CC-BY'), 'CC BY');
  assert.equal(licenceName('MIT'), 'MIT');
  const { bundle } = loadContent();
  for (const s of Object.values(bundle.sons).filter((x) => x.licence)) assert.doesNotMatch(licenceName(s.licence), /^CC-|\d-\d/, s.id);
});

test('les guillemets ne laissent jamais « », « ! » ou « ? » seul en bout de ligne', () => {
  assert.equal(quoted('Allez'), '« Allez »');
  assert.equal(quoted('Désobéissons ! Taxez ?'), '« Désobéissons ! Taxez ? »');
});

test('le carton d’ouverture tient dans l’écran : la rangée des héros défile dans sa case, pas le carton', async () => {
  const { readFile } = await import('node:fs/promises');
  const css = await readFile(new URL('../style.css', import.meta.url), 'utf8');
  const rule = (selector) => css.match(new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`, 'm'))?.[1] ?? '';
  assert.match(rule('.panneau.intro'), /flex-direction: column/);
  assert.match(rule('.intro .choix-heros'), /overflow: hidden auto/); // en hauteur
  assert.match(rule('.intro .choix-heros'), /min-height: \d+px/); // au moins une rangée reste visible
  assert.match(rule('html.bas .intro .choix-heros'), /flex-wrap: nowrap/); // écran bas : une ligne…
  assert.match(rule('html.bas .intro .choix-heros'), /overflow: auto hidden/); // … qui défile en largeur
});
