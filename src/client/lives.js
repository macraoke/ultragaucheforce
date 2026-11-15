// La pile de vies, façon Broforce : une tête par vie. On joue le personnage du dessus ;
// chaque garde à vue libérée en pose un de plus.

import { h } from './dom.js';
import { spriteElement } from './sprites.js';

/**
 * Les têtes à montrer, celle qu'on joue d'abord.
 * @returns {{heads: string[], more: number}}  identifiants de héros, et combien de vies ne sont pas dessinées
 */
export function livesHeads(game, max = 6) {
  const heads = [...game.stack].reverse();
  return { heads: heads.slice(0, max), more: Math.max(0, heads.length - max) };
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
