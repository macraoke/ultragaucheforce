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

test('les guillemets ne laissent jamais « » seul en bout de ligne', () => {
  assert.equal(quoted('Allez'), '« Allez »');
});
