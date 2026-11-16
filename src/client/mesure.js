// Mesure d'audience, au minimum : combien de parties, sur quel niveau, avec quelle manif.
// Rien n'est écrit sur l'appareil : ni cookie, ni stockage. Le numéro de visite est tiré ici
// et ne vit que le temps de la page ; aucun profil n'est créé côté PostHog.

import { ANALYTICS } from './config.js';

const visit = globalThis.crypto?.randomUUID?.() ?? `v${Math.random().toString(36).slice(2)}`;
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(globalThis.location?.hostname ?? 'localhost');

/** Ce qui part : un nom d'événement et quelques nombres de la partie. Jamais de texte saisi, jamais d'adresse. */
export function payload(event, properties = {}) {
  return { api_key: ANALYTICS.token, event, distinct_id: visit, properties: { ...properties, $process_person_profile: false, $lib: 'ugf' } };
}

/** Compte un événement. Sans projet branché, en local ou hors-ligne : rien ne part. */
export function measure(event, properties = {}) {
  if (!ANALYTICS.token || local || globalThis.navigator?.onLine === false) return;
  fetch(`${ANALYTICS.host}/i/v0/e/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(event, properties)), keepalive: true,
  }).catch(() => {}); // la mesure ne gêne jamais le jeu
}
