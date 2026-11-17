// Outils communs aux tests de la simulation.
// Le contenu d'essai vit dans tests/fixtures/content/, au même format « fiche texte » que le vrai contenu.

import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readContentFiles } from '../../tools/content.mjs';
import { buildContent, formatError } from '../../src/content/rules.js';
import { Game } from '../../src/sim/game.js';

export const FIXTURES = fileURLToPath(new URL('../fixtures', import.meta.url));

let cached = null;
/** Le contenu d'essai, validé par les mêmes règles que le vrai. */
export function fixtureBundle() {
  if (!cached) {
    const { bundle, errors } = buildContent(readContentFiles(FIXTURES));
    assert.deepEqual(errors.map(formatError), [], 'les fiches d’essai doivent être valides');
    cached = bundle;
  }
  return cached;
}

/**
 * Fabrique un niveau à la main : `rows` = carte, le reste = en-tête.
 * Le héros est fixé (`alpha`) : sans lui, le jeu en tirerait un au hasard. `heros: ''` rend le tirage.
 */
export const level = (rows, extra = {}) => ({
  titre: 'essai', manchette: [], panneaux: {}, legende: {}, boss: '', cortege: false, heros: 'alpha', carte: rows, ...extra,
});

/** Sol d'acier sur toute la largeur, héros posé à gauche. `draw(put)` ajoute le reste. */
export function flat({ width = 60, height = 12, draw = () => {}, ...extra } = {}) {
  const grid = Array.from({ length: height }, () => Array(width).fill('.'));
  const put = (row, col, text) => [...text].forEach((c, i) => {
    grid[row][col + i] = c;
  });
  put(height - 1, 0, 'A'.repeat(width));
  put(height - 2, 2, 'D');
  put(height - 2, width - 4, 'S');
  draw(put, height - 2); // height - 2 = rangée posée sur le sol
  return level(grid.map((r) => r.join('')), extra);
}

/** Une partie sur un niveau d'essai. Trois personnages dans la pile de départ, pour éprouver les reprises. */
export const play = (lvl, opts = {}) => new Game(opts.bundle ?? fixtureBundle(), 'essai', { level: lvl, lives: 3, ...opts });

/** Avance de `steps` pas ; `actions` est un objet fixe ou une fonction (pas, partie) → actions. */
export function run(game, steps, actions = {}) {
  const seen = [];
  for (let i = 0; i < steps && game.status === 'playing'; i++) {
    game.step(typeof actions === 'function' ? actions(i, game) : actions);
    seen.push(...game.events.splice(0));
  }
  return seen;
}

/** Laisse le héros se poser au sol avant de mesurer quoi que ce soit. */
export function settle(game) {
  run(game, 30);
  assert.ok(game.hero.onGround, 'le héros doit être posé au sol');
  return game;
}
