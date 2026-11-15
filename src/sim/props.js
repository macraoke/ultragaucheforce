// Accessoires du niveau (cage, piquet de grève, sortie, panneau) et cortège de manifestants.

import { overlap } from './physics.js';

const SIGN_RANGE = 22;
const MAX_CORTEGE = 14;
const SPACING = 7; // points de trace entre deux manifestants
const KINDS = ['pancarte', 'drapeau', 'fanfare'];
const INSTRUMENTS = ['tambour', 'trompette', 'soubassophone'];

export function updateProps(game) {
  const { hero } = game;
  game.sign = null;
  for (const prop of game.props) {
    if (prop.kind === 'sortie') prop.on = !game.boss || game.boss.state === 'gone';
    if (hero.dead) continue;
    const touching = overlap(hero, prop);
    if (prop.kind === 'cage' && !prop.on && touching) {
      game.rescue(prop);
    } else if (prop.kind === 'piquet' && !prop.on && touching) {
      prop.on = true;
      game.checkpoint = { x: prop.x + prop.w / 2, y: prop.y + prop.h };
      game.emit('checkpoint', { x: prop.x, y: prop.y });
      game.sfx('piquet', prop.x);
      game.addPanic(4);
      growCortege(game, 1);
    } else if (prop.kind === 'sortie' && prop.on && touching) {
      game.status = 'won';
      game.emit('won', {});
      game.sfx('victoire', prop.x);
    } else if (prop.kind === 'panneau') {
      const near = Math.abs(prop.x + prop.w / 2 - (hero.x + hero.w / 2)) < SIGN_RANGE && Math.abs(prop.y - hero.y) < 40;
      if (near) game.sign = prop.text;
    }
  }
}

/** Ajoute des manifestants derrière le héros (seulement si le niveau a un cortège). */
export function growCortege(game, count) {
  if (!game.level.cortege) return;
  const { hero, bundle } = game;
  // Dans le cortège, seules les pancartes courtes restent lisibles ; les autres vivent dans la Bibliothèque.
  const all = bundle.pancartes || [];
  const short = all.filter((p) => p.texte.length <= 26);
  const signs = short.length ? short : all;
  const flags = Object.keys(bundle.drapeaux || {});
  for (let i = 0; i < count && game.cortege.length < MAX_CORTEGE; i++) {
    const n = game.cortege.length;
    const kind = KINDS[n % KINDS.length];
    const turn = Math.floor(n / KINDS.length);
    let label = INSTRUMENTS[turn % INSTRUMENTS.length];
    if (kind === 'pancarte') label = signs.length ? signs[(game.signOffset + turn) % signs.length].texte : '';
    if (kind === 'drapeau') label = flags.length ? flags[turn % flags.length] : '';
    game.cortege.push({
      x: hero.x + hero.w / 2, y: hero.y + hero.h, facing: hero.facing, kind, label, gassed: 0,
      animTime: n * 0.13, counted: false,
    });
  }
}

/**
 * Le cortège rejoue la trace du héros : chaque manifestant vise un point plus ancien.
 * Position d'un manifestant : `x` = centre, `y` = pieds.
 */
export function updateCortege(game, dt) {
  const { trail } = game;
  if (!trail.length) return;
  game.cortege.forEach((m, i) => {
    let k = Math.max(0, trail.length - 1 - (i + 1) * SPACING);
    while (k < trail.length - 1 && !trail[k].ground) k++; // jamais figé en l'air
    const target = trail[k];
    const dx = target.x - m.x;
    const dy = target.y - m.y;
    if (Math.abs(dx) > 96 || Math.abs(dy) > 96) {
      m.x = target.x;
      m.y = target.y;
    } else {
      m.x += Math.max(-4, Math.min(4, dx));
      m.y += Math.max(-5, Math.min(5, dy));
    }
    if (Math.abs(dx) > 0.5) {
      m.facing = Math.sign(dx);
      m.animTime += dt;
    }
    m.gassed = Math.max(0, m.gassed - dt);
    if (m.gassed <= 0 && game.clouds.some((c) => Math.hypot(c.x - m.x, c.y - (m.y - 8)) < c.r)) {
      m.gassed = 3;
      if (!m.counted) {
        m.counted = true;
        game.stats.gassed++; // chaque manifestant gazé compte une fois
      }
    }
  });
}
