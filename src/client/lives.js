// La pile de personnages, façon Broforce : une tête par personnage. On joue celui du dessus ;
// chaque garde à vue libérée en pose un de plus. Dessous, la barre de vie de celui qu'on joue.

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
  const left = Math.max(0, playing.hp) / playing.def.pv;
  return h('span', { className: 'pile', title: `${game.lives} personnages` },
    h('span', { className: 'tetes' },
      heads.map((id, i) => {
        const hero = bundle.heros[id];
        if (!hero) return null;
        return h('span', { className: i === 0 ? 'tete en-jeu' : 'tete' }, spriteElement(hero.sprites.portrait || hero.sprites.repos, bundle.palette, 1));
      }),
      more ? h('b', {}, `+${more}`) : null),
    // Ce qu'il reste de coups à encaisser au personnage en jeu.
    h('span', { className: `vie${left <= 0.34 ? ' basse' : ''}`, role: 'meter', ariaLabel: 'Vie' }, h('i', { style: `width: ${left * 100}%` })));
}
