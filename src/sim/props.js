// Accessoires du niveau : cage, piquet de grève, sortie, panneau.
// (Le cortège, les recrues et la nasse vivent dans manif.js.)

import { overlap } from './physics.js';

const SIGN_RANGE = 22;

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
      game.addCrowd(10); // le piquet de grève rejoint la manif
    } else if (prop.kind === 'sortie' && prop.on && touching) {
      game.status = 'won';
      game.emit('won', {});
      game.sfx('victoire', prop.x);
    } else if (prop.kind === 'panneau') {
      const near = Math.abs(prop.x + prop.w / 2 - (hero.x + hero.w / 2)) < SIGN_RANGE && Math.abs(prop.y - hero.y) < 40;
      if (!near) continue;
      game.sign = prop.text;
    }
  }
}
