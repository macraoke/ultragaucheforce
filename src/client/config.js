// Réglages du client qui ne sont pas du contenu.

import posthog from 'posthog-js';

export const REPO = 'https://github.com/macraoke/ultragaucheforce';

/**
 * La mesure d'audience (`mesure.js`) : le projet PostHog où partent les compteurs de parties.
 * Le serveur de développement et le build injectent ces valeurs publiques depuis l'environnement.
 */
const posthogConfig = globalThis.__POSTHOG_CONFIG__;
const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(globalThis.location?.hostname ?? '');
if (local && !posthogConfig?.token) {
  throw new Error('POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_PROJECT_TOKEN is configured');
}
if (local && !posthogConfig?.host) {
  throw new Error('POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_HOST is configured');
}
export const ANALYTICS = { host: posthogConfig?.host, token: posthogConfig?.token };

if (ANALYTICS.token && ANALYTICS.host && !local) {
  posthog.init(ANALYTICS.token, {
    api_host: ANALYTICS.host,
    persistence: 'memory',
    person_profiles: 'never',
    logs: { serviceName: 'ultragauche-force-web', environment: local ? 'development' : 'production' },
  });
}

/** Les seules lignes de logs exportées : des étapes de jeu sans texte ni donnée personnelle. */
export const GAME_LOGGER = {
  info(message, attributes) {
    if (!ANALYTICS.token || !ANALYTICS.host || local || globalThis.navigator?.onLine === false) return;
    posthog.logger.info(message, attributes);
  },
};

/** Références assumées du projet, affichées dans « À propos ». */
export const REFERENCES = [
  { titre: 'Fiscal Kombat (2017)', url: 'https://fr.wikipedia.org/wiki/Fiscal_Kombat', note: 'l’ancêtre : un jeu militant fait par des bénévoles.' },
  { titre: 'We Become What We Behold — Nicky Case', url: 'https://ncase.itch.io/wbwwb', note: 'un jeu du domaine public sur la caméra qui fabrique la panique ; notre drone lui doit tout.' },
  { titre: 'Orchestre du Nouveau Monde', url: 'https://www.helloasso.com/associations/orchestre-du-nouveau-monde', note: 'la musique comme manière de penser le monde de demain ; notre fanfare lui fait un clin d’œil.' },
  { titre: 'La Dernière — Radio Nova', url: 'https://www.nova.fr/emissions/la-derniere/', note: 'pour le ton.' },
];
