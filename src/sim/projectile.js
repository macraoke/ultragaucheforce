// Projectiles : tracts, tampons, graines, grenades, mots d'éditorialistes…
// Un seul modèle, entièrement réglé par les fiches (voir WEAPONS dans behaviors.js).

import { TILE } from './world.js';
import { hitsSolid, overlap } from './physics.js';
import { joinRecruit } from './manif.js';

const DEFAULTS = {
  vx: 0, vy: 0, team: 'luttes', word: null, def: null, image: 'projectile',
  gravity: 0, range: 240, damage: 1, terrain: 1, bounces: 0, explosion: 0,
  pierce: false, armor: false, friendly: false, gas: 0, hug: false, owner: null, age: 0, dead: false,
};
const MAX_PROJECTILES = 240;

export function spawnProjectile(game, p) {
  const proj = { ...DEFAULTS, ...p, hits: new Set() };
  game.projectiles.push(proj);
  if (game.projectiles.length > MAX_PROJECTILES) game.projectiles.shift();
  return proj;
}

export function updateProjectiles(game, dt) {
  const { world } = game;
  for (const p of game.projectiles) {
    // Sous-pas : jamais plus de 6 pixels d'un coup, donc jamais à travers une tuile.
    const n = Math.max(1, Math.ceil((Math.max(Math.abs(p.vx), Math.abs(p.vy)) * dt) / 6));
    const h = dt / n;
    for (let i = 0; i < n && !p.dead; i++) {
      p.vy += p.gravity * h;
      const beforeX = p.x;
      p.x += p.vx * h;
      if (hitsSolid(world, p.x, p.y, p.w, p.h)) strike(game, p, 'x', beforeX);
      if (p.dead) break;
      const beforeY = p.y;
      p.y += p.vy * h;
      if (hitsSolid(world, p.x, p.y, p.w, p.h)) strike(game, p, 'y', beforeY);
      if (p.dead) break;
      p.range -= Math.hypot(p.vx, p.vy) * h;
      touchActors(game, p);
      if (!p.dead && p.range <= 0) {
        if (p.explosion > 0 || p.gas > 0) burst(game, p);
        else p.dead = true;
      }
    }
    p.age += dt;
    if (p.y > world.h * TILE + 64 || p.y < -480 || p.x < -64 || p.x > world.w * TILE + 64) p.dead = true;
  }
  game.projectiles = game.projectiles.filter((p) => !p.dead);
}

/** Le projectile vient de toucher le décor sur l'axe donné. */
function strike(game, p, axis, before) {
  const rests = p.hug && axis === 'y'; // une onde au sol glisse sur le plancher sans l'abîmer
  if (!rests) {
    const x1 = Math.floor((p.x + p.w - 0.001) / TILE);
    const y1 = Math.floor((p.y + p.h - 0.001) / TILE);
    for (let ty = Math.floor(p.y / TILE); ty <= y1; ty++) {
      for (let tx = Math.floor(p.x / TILE); tx <= x1; tx++) {
        if (game.world.solid(tx, ty)) game.world.damage(tx, ty, p.terrain, p.team);
      }
    }
  }
  if (axis === 'x') p.x = before;
  else p.y = before;
  if (rests) {
    p.vy = 0;
  } else if (p.bounces > 0) {
    p.bounces--;
    if (axis === 'x') p.vx = -p.vx;
    else p.vy = -p.vy * 0.7;
    game.sfx('impact', p.x);
  } else {
    burst(game, p);
  }
}

/** Fin du projectile : explosion et nuage éventuels. */
function burst(game, p) {
  p.dead = true;
  const cx = p.x + p.w / 2;
  const cy = p.y + p.h / 2;
  if (p.explosion > 0) {
    game.explode(cx, cy, p.explosion, {
      team: p.team, friendly: p.friendly, terrain: Math.max(1, p.terrain),
      damage: Math.max(1, p.damage) * (p.team === 'luttes' ? game.power() : 1),
    });
  } else {
    game.sfx('impact', cx);
  }
  if (p.gas > 0) {
    game.clouds.push({ x: cx, y: cy, r: 26, t: p.gas });
    game.sfx('gaz', cx);
  }
}

function touchActors(game, p) {
  if (p.team === 'luttes') {
    const damage = p.damage * game.power(); // le nombre fait la force
    for (const e of game.enemies) {
      if (e.state === 'done' || p.hits.has(e) || !overlap(p, e)) continue;
      p.hits.add(e);
      // Le bouclier pare ce qui arrive de face, sauf projectile « blindage ».
      // Un projectile perçant (« perce ») n'abîme pas l'automate protégé, mais continue sa route.
      const blocked = e.def.bouclier && Math.sign(p.vx) === -e.facing && !p.armor;
      if (blocked) e.flash = 0.05;
      else game.hurtEnemy(e, damage, 'luttes');
      if (!p.pierce) return burst(game, p);
    }
    const boss = game.boss;
    if (boss && boss.state !== 'ejecting' && boss.state !== 'gone' && !p.hits.has(boss) && overlap(p, boss)) {
      p.hits.add(boss);
      game.hurtBoss(damage);
      if (!p.pierce) return burst(game, p);
    }
    for (const cage of game.props) {
      if (cage.kind !== 'cage' || cage.on || p.hits.has(cage) || !overlap(p, cage)) continue;
      p.hits.add(cage);
      cage.hp -= Math.max(1, p.damage);
      if (cage.hp <= 0) game.rescue(cage);
      if (!p.pierce) return burst(game, p);
    }
    // Un tract tendu à une recrue : elle rejoint la manif.
    for (const r of game.recruits) {
      if (r.joined || !overlap(p, r)) continue;
      joinRecruit(game, r);
      if (!p.pierce) return burst(game, p);
    }
    return;
  }
  // Camp de l'ordre : vise le héros… et, pour les grenades « fratricides », touche aussi les collègues.
  if (!game.hero.dead && overlap(p, game.hero)) {
    game.hurtHero(p.damage);
    return burst(game, p);
  }
  if (!p.friendly) return;
  for (const e of game.enemies) {
    if (e.state === 'done' || (e === p.owner && p.age < 0.4) || !overlap(p, e)) continue;
    game.hurtEnemy(e, p.damage, 'ordre');
    return burst(game, p);
  }
}
