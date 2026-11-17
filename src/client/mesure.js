// Mesure d'audience, au minimum : combien de parties, sur quel niveau, avec quelle manif.
// Rien n'est écrit sur l'appareil : ni cookie, ni stockage. Le numéro de visite est tiré ici
// et ne vit que le temps de la page ; aucun profil n'est créé côté PostHog, et le lieu n'est pas déduit de l'adresse IP.
// À la création du projet : cocher « Discard client IP data » dans ses réglages.

import posthog from 'posthog-js';
import { ANALYTICS } from './config.js';

const visit = globalThis.crypto?.randomUUID?.() ?? `v${Math.random().toString(36).slice(2)}`;
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(globalThis.location?.hostname ?? 'localhost');

/** Ce qui part : un nom d'événement et quelques nombres de la partie. Jamais de texte saisi, jamais d'adresse. */
export function payload(event, properties = {}) {
  return { api_key: ANALYTICS.token, event, distinct_id: visit, properties: { ...properties, $process_person_profile: false, $geoip_disable: true, $lib: 'ugf' } };
}

/** Envoie une mesure sans jamais gêner le jeu. */
function send(event, properties = {}) {
  if (!ANALYTICS.token || !ANALYTICS.host || local || globalThis.navigator?.onLine === false) return;
  fetch(`${ANALYTICS.host}/i/v0/e/`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload(event, properties)), keepalive: true,
  }).catch(() => {});
}

/** Compte un événement. Sans projet branché, en local ou hors-ligne : rien ne part. */
export function measure(event, properties = {}) {
  send(event, properties);
}

/** Envoie une exception non interceptée au format Error Tracking de PostHog. */
export function captureException(error) {
  if (!(error instanceof Error) || !ANALYTICS.token || !ANALYTICS.host || local || globalThis.navigator?.onLine === false) return;
  posthog.captureException(error, { $geoip_disable: true });
}
