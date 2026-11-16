// La mesure d'audience : rien ne part sans projet branché, et ce qui part ne contient que des nombres de la partie.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { payload, measure } from '../src/client/mesure.js';

test('mesure : un événement, un numéro de visite, pas de profil', () => {
  const sent = payload('niveau terminé', { niveau: 'bismillah', manif: 382 });
  assert.equal(sent.event, 'niveau terminé');
  assert.equal(sent.properties.$process_person_profile, false, 'aucun profil de personne côté PostHog');
  assert.deepEqual(Object.keys(sent.properties).sort(), ['$geoip_disable', '$lib', '$process_person_profile', 'manif', 'niveau']);
  assert.equal(payload('a').distinct_id, payload('b').distinct_id, 'le même numéro le temps de la page');
  assert.match(sent.distinct_id, /^[\w-]{8,}$/);
});

test('mesure : rien n’est écrit sur l’appareil, et rien ne part en local', () => {
  const code = readFileSync(new URL('../src/client/mesure.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  for (const banned of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB']) assert.ok(!code.includes(banned), banned);
  let calls = 0;
  const real = globalThis.fetch;
  globalThis.fetch = () => { calls++; return Promise.resolve(); };
  try {
    measure('niveau lancé', { niveau: 'essai' });
  } finally {
    globalThis.fetch = real;
  }
  assert.equal(calls, 0, 'dans les tests comme en local, aucun envoi');
});
