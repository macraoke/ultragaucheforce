// Mesure d'audience anonyme, au minimum : combien de joueurs, combien de parties, sur quel niveau,
// comment elles finissent, et ce qui empêche de jouer.
//
// PostHog n'est chargé que dans la version en ligne : `npm run build` ajoute son chargeur à la page
// quand POSTHOG_PROJECT_TOKEN est donné (`tools/mesure-template.js`, qui fixe aussi ses réglages).
// Sans lui (en développement, dans les tests, script bloqué), `window.posthog` n'existe pas ou attend
// son script dans sa file : rien ne part, et le jeu ne s'en aperçoit pas.
//
// Ce qui part : un nom d'événement et des propriétés de la partie (identifiant de niveau, durée, issue,
// appareil de jeu). Jamais de texte saisi, jamais de niveau de l'Atelier.

/** La mesure est-elle branchée sur cette page ? */
export function measuring() {
  return typeof globalThis.posthog?.capture === 'function';
}

/** Compte un événement. `options` passe tel quel à PostHog (`{ transport: 'sendBeacon' }` à la fermeture de la page). */
export function measure(event, properties = {}, options = undefined) {
  if (!measuring()) return;
  try {
    globalThis.posthog.capture(event, properties, options);
  } catch {
    // la mesure ne gêne jamais le jeu
  }
}
