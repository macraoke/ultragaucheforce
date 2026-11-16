// Collisions : des boîtes { x, y, w, h, vx, vy } contre la grille, un axe après l'autre.

import { TILE } from './world.js';

const EPS = 0.001;

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const approach = (v, target, step) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
export const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/** Une ligne qui tient (voir enemy.js) : pleine pour le héros et ses tracts, pour les unités au sol et les tirs d'en face. */
export const holds = (e) => e.blocking && e.state !== 'done';

/** Vrai si le rectangle touche au moins une tuile pleine. */
export function hitsSolid(world, x, y, w, h) {
  const x0 = Math.floor(x / TILE);
  const x1 = Math.floor((x + w - EPS) / TILE);
  const y0 = Math.floor(y / TILE);
  const y1 = Math.floor((y + h - EPS) / TILE);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) if (world.solid(tx, ty)) return true;
  }
  return false;
}

/**
 * Déplace la boîte d'un pas. Renseigne `hitX` et `hitY` (-1, 0 ou 1 : côté touché).
 * Un déplacement ne dépasse jamais une tuile par pas : impossible de traverser un mur.
 */
export function moveBox(world, b, dt) {
  b.hitX = 0;
  b.hitY = 0;
  const dx = clamp(b.vx * dt, -(TILE - 1), TILE - 1);
  if (dx) {
    b.x += dx;
    if (hitsSolid(world, b.x, b.y, b.w, b.h)) {
      b.x = dx > 0 ? Math.floor((b.x + b.w - EPS) / TILE) * TILE - b.w : (Math.floor(b.x / TILE) + 1) * TILE;
      b.hitX = Math.sign(dx);
    }
  }
  const dy = clamp(b.vy * dt, -(TILE - 1), TILE - 1);
  if (dy) {
    b.y += dy;
    if (hitsSolid(world, b.x, b.y, b.w, b.h)) {
      b.y = dy > 0 ? Math.floor((b.y + b.h - EPS) / TILE) * TILE - b.h : (Math.floor(b.y / TILE) + 1) * TILE;
      b.hitY = Math.sign(dy);
    }
  }
}

/** Y a-t-il du sol juste sous la boîte ? (re-sondé à chaque pas : un sol détruit fait tomber) */
export const grounded = (world, b) => hitsSolid(world, b.x, b.y + b.h, b.w, 1);

/** Y a-t-il un mur collé à la boîte du côté `dir` (-1 ou 1) ? */
export const wallAt = (world, b, dir) => hitsSolid(world, dir > 0 ? b.x + b.w : b.x - 1, b.y, 1, b.h);
