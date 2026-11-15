// La pile de vies, façon Broforce : une tête par vie. Les camarades libérés pendant le
// niveau s'empilent devant le héros de départ.

import { h } from './dom.js';
import { spriteElement } from './sprites.js';

/**
 * Les têtes à montrer, de la plus récente à la plus ancienne.
 * @returns {{heads: string[], more: number}}  identifiants de héros, et combien de vies ne sont pas dessinées
 */
export function livesHeads(game, max = 6) {
  const freed = [...game.freed].reverse();
  const shown = Math.min(Math.max(0, game.lives), max);
  return { heads: Array.from({ length: shown }, (_, i) => freed[i] ?? game.starter), more: Math.max(0, game.lives - shown) };
}

/** La pile, prête à poser dans le HUD. */
export function livesStack(bundle, game) {
  const { heads, more } = livesHeads(game);
  return h('span', { className: 'pile', title: `${game.lives} vies` },
    heads.map((id) => {
      const hero = bundle.heros[id];
      return hero ? spriteElement(hero.sprites.portrait || hero.sprites.repos, bundle.palette, 1) : null;
    }),
    more ? h('b', {}, `+${more}`) : null);
}
