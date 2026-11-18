// La consigne du tuto (« Get ready with me », `TUTORIAL`) : à chaque partie du tuto, un panneau qui nomme
// une commande (`[sauter]`, `[tirer]`, `[bas]` + `[tirer]`…) reste affiché jusqu'à ce que le joueur ait fait le geste,
// puis montre un ✓ et s'efface. Rien de neuf dans les fiches : les gestes se lisent dans les marqueurs du panneau.
// Fonctions pures, testées dans Node : elles lisent les actions envoyées à la simulation, elles n'y touchent pas.

import { tokens } from './input.js';

/** Combien de temps le ✓ reste, en secondes de jeu, avant que le panneau s'efface comme les autres. */
export const CHECK_TIME = 0.8;

/** Chaque geste, et les actions d'un pas qui le font. */
export const GESTURES = {
  avancer: (a) => a.left || a.right,
  sauter: (a) => a.jump,
  tirer: (a) => a.fire,
  speciale: (a) => a.special,
  creuser: (a) => a.down && a.fire,
  'lancer-haut': (a) => a.up && a.fire,
};

/**
 * Au pouce, ce qui s'allume pour chaque geste : un bouton (`fire`, `jump`, `special`, son `data-action`),
 * ou le sens où glisser le pouce gauche (`cote`, `bas`, `haut`).
 */
export const HINTS = {
  avancer: ['cote'],
  sauter: ['jump'],
  tirer: ['fire'],
  speciale: ['special'],
  creuser: ['bas', 'fire'],
  'lancer-haut': ['haut', 'fire'],
};

/**
 * Les gestes qu'attend un panneau, dans l'ordre, sans doublon. `[bas]` ou `[haut]` suivi de `[tirer]` forment un seul
 * geste ; un mot inconnu (ou `[pause]`) n'attend rien.
 * @returns {string[]} des clés de GESTURES
 */
export function gesturesOf(text) {
  const words = tokens(text);
  const out = [];
  for (let i = 0; i < words.length; i++) {
    let g = words[i];
    if ((g === 'bas' || g === 'haut') && words[i + 1] === 'tirer') {
      g = g === 'bas' ? 'creuser' : 'lancer-haut';
      i++;
    }
    if (GESTURES[g] && !out.includes(g)) out.push(g);
  }
  return out;
}

const IDLE = Object.freeze({ text: '', wait: [], until: 0, cleared: [] });

/**
 * Un pas de la consigne. Un panneau lu qui nomme des gestes devient la consigne, à la place de la précédente ;
 * un panneau sans geste, ou déjà fait, l'efface. Chaque geste fait sort de l'attente ; le dernier ouvre le ✓,
 * qui tombe au bout de CHECK_TIME. Rien ne bloque : la consigne ne fait qu'attendre.
 * @param {{text: string, wait: string[], until: number, cleared: string[]} | null} state  null : rien encore
 * @param {{sign: string | null, actions: object, time: number}} step  le panneau lu à ce pas, les actions envoyées, le temps de jeu
 */
export function coach(state, { sign, actions, time }) {
  let s = state ?? IDLE;
  if (sign && sign !== s.text) {
    const wait = s.cleared.includes(sign) ? [] : gesturesOf(sign);
    s = { ...s, text: wait.length ? sign : '', wait, until: 0 };
  }
  if (s.wait.length && actions) {
    const wait = s.wait.filter((g) => !GESTURES[g](actions));
    if (wait.length !== s.wait.length) s = { ...s, wait, until: wait.length ? 0 : time + CHECK_TIME };
  }
  if (s.text && !s.wait.length && time >= s.until) s = { ...IDLE, cleared: [...s.cleared, s.text] };
  return s;
}

/**
 * Ce que le rendu et le HUD en montrent : le texte tenu à l'écran, s'il est fait (le ✓), et ce qui s'allume au pouce
 * pour le prochain geste attendu. null : pas de consigne.
 */
export function guideView(state) {
  if (!state?.text) return null;
  const done = !state.wait.length;
  return { text: state.text, done, hints: done ? [] : HINTS[state.wait[0]] };
}
