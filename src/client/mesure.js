// Mesure d'audience anonyme, au minimum : combien de joueurs, combien de parties, sur quel niveau et avec quel
// héros, comment elles finissent, quelles musiques plaisent ou se passent, et ce qui empêche de jouer.
// La liste complète des événements et de leurs propriétés : `docs/mesure-d-audience.md`.
//
// PostHog n'est chargé que dans la version en ligne : `npm run build` ajoute son chargeur à la page
// quand POSTHOG_PROJECT_TOKEN est donné (`tools/mesure-template.js`, qui fixe aussi ses réglages).
// Sans lui (en développement, dans les tests, script bloqué), `window.posthog` n'existe pas ou attend
// son script dans sa file : rien ne part, et le jeu ne s'en aperçoit pas.
//
// Ce qui part : un nom d'événement et des propriétés de la partie (identifiant de niveau, de héros, de piste,
// durée, issue, appareil de jeu). Jamais de texte saisi, jamais rien d'un niveau de l'Atelier (il compte
// sous le seul nom « atelier »).

import { TILE } from '../sim/world.js';

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

/**
 * Une partie commence (« C'est parti »). Renvoie ce qu'il faut en garder jusqu'à sa fin.
 * @param {{ level: string, mode: 'campagne' | 'hors_campagne' | 'atelier', hero: string, heroSource: string, input: string, again: boolean }} run
 */
export function runStarted({ level, mode, hero, heroSource, input, again }, send = measure) {
  send('game_started', { level, mode, hero, hero_source: heroSource, input, again });
  return { level, mode, hero, playing: hero };
}

/**
 * Une partie mesurée se termine : `outcome` gagnée (`won`), perdue (`lost`) ou abandonnée (`abandoned`) ;
 * `via`, pour un abandon : le menu, « Recommencer », un autre niveau, la page fermée.
 */
export function runEnded(run, game, outcome, via = null, options = undefined, send = measure) {
  if (!run) return;
  const properties = { level: run.level, mode: run.mode, hero: run.hero, outcome, seconds: Math.round(game?.time ?? 0) };
  if (game) {
    properties.crowd = game.crowd;
    properties.lives = game.lives;
    // Jusqu'où le héros est allé, en pour cent de la largeur du niveau.
    const width = (game.world?.w ?? 0) * TILE;
    if (width > 0) properties.progress = Math.max(0, Math.min(100, Math.round((100 * (game.hero?.x ?? 0)) / width)));
  }
  if (via) properties.via = via;
  send('game_ended', properties, options);
}

/** Un camarade libéré prend la main : de quel héros à quel héros. */
export function heroRescued(run, to, send = measure) {
  if (!run) return;
  send('hero_rescued', { level: run.level, mode: run.mode, hero_from: run.playing, hero_to: to });
  run.playing = to;
}
