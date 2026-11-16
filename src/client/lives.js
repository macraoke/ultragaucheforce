// La pile de personnages, façon Broforce : une tête par personnage. On joue celui du dessus ;
// chaque garde à vue libérée en pose un de plus. La tête de celui qu'on joue se vide à chaque coup reçu.

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
  const { hero: playing } = game;
  return h('span', { className: 'pile', title: `${game.lives} personnages` },
    heads.map((id, i) => {
      const hero = bundle.heros[id];
      if (!hero) return null;
      const head = spriteElement(hero.sprites.portrait || hero.sprites.repos, bundle.palette, 1);
      // Celui qu'on joue : ce qui lui reste de coups à encaisser, en part de sa tête encore colorée.
      const left = i === 0 ? Math.max(0, playing.hp) / playing.def.pv : 1;
      return h('span', { className: i === 0 ? 'tete en-jeu' : 'tete', style: `--vie: ${left}` }, head);
    }),
    more ? h('b', {}, `+${more}`) : null);
}
