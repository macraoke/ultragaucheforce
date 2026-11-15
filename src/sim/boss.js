// Le boss : une machine pilotée par sa fiche (phases, rythme, attaques du registre).
// À zéro point de vie la machine se disloque (« ejecting ») : la caricature s'éjecte indemne,
// puis le boss disparaît (« gone ») et la sortie s'ouvre.
//
// Le boss obéit à la gravité : posé sur un tas de tuiles destructibles, il descend à mesure qu'on creuse.
// « assis: oui » : tant que sa vie n'est pas passée sous « leve », il ne bouge pas de son tas (`seated`)
// et n'emploie que ses attaques à distance.

import { TILE } from './world.js';
import { moveBox, overlap } from './physics.js';
import { BOSS_ATTACKS } from './behaviors.js';

const GRAVITY = 900;
const WAKE_X = 230;
const WAKE_Y = 200;
const EJECT_TIME = 3;

export function createBoss(def, cx, feetY) {
  return {
    x: cx - def.largeur / 2, y: feetY - def.hauteur, w: def.largeur, h: def.hauteur, vx: 0, vy: 0,
    hp: def.pv, hpMax: def.pv, def, active: false, phase: 0, facing: -1, flash: 0, bubble: null, state: 'idle',
    timer: 1.2, turn: 0, boom: 0, line: 0, charge: null, hitX: 0, hitY: 0, seated: Boolean(def.assis),
  };
}

/** Fait dire au boss sa réplique suivante. */
export function bossSays(boss) {
  const lines = boss.def.replique;
  if (lines.length) boss.bubble = { text: lines[boss.line++ % lines.length], t: 3 };
}

export function wakeBoss(game, boss) {
  if (boss.active) return;
  boss.active = true;
  bossSays(boss);
  game.emit('boss', { state: 'enter' });
  game.discover('boss', boss.def.id);
  game.sfx('boss', boss.x);
}

export function updateBoss(game, boss, dt) {
  const { world, hero } = game;
  const { def } = boss;
  boss.flash = Math.max(0, boss.flash - dt);
  if (boss.bubble && (boss.bubble.t -= dt) <= 0) boss.bubble = null;
  if (boss.state === 'gone') return;

  if (boss.state === 'ejecting') {
    boss.timer -= dt;
    boss.boom -= dt;
    if (boss.boom <= 0) {
      // La machine part en morceaux : effets visuels seulement.
      boss.boom = 0.3;
      game.emit('explosion', { x: boss.x + game.rng.range(0, boss.w), y: boss.y + game.rng.range(0, boss.h), r: 14 });
      game.emit('shake', { force: 4 });
      game.sfx('explosion', boss.x);
    }
    if (boss.timer <= 0) boss.state = 'gone';
    return;
  }

  const dx = hero.x + hero.w / 2 - (boss.x + boss.w / 2);
  if (!boss.active && !hero.dead && Math.abs(dx) < WAKE_X && Math.abs(hero.y - boss.y) < WAKE_Y) wakeBoss(game, boss);

  if (boss.active) {
    // Phase courante : la première dont le seuil de vie n'est pas encore franchi.
    const ratio = boss.hp / boss.hpMax;
    let phase = def.phases.findIndex((p) => ratio > p.jusqua);
    if (phase < 0) phase = def.phases.length - 1;
    if (phase !== boss.phase) {
      boss.phase = phase;
      bossSays(boss);
      game.emit('boss', { state: 'phase' });
      game.emit('shake', { force: 6 });
      game.sfx('boss', boss.x);
    }

    if (boss.state === 'charge') {
      const c = boss.charge;
      c.t -= dt;
      boss.vx = c.dir * c.speed;
      if (c.t <= 0) boss.state = 'idle';
    } else {
      boss.facing = dx >= 0 ? 1 : -1;
      boss.vx = !boss.seated && Math.abs(dx) > 90 ? boss.facing * def.vitesse : 0;
      boss.timer -= dt;
      if (boss.timer <= 0 && !hero.dead) {
        const { attaques, rythme } = def.phases[boss.phase];
        // Assis sur sa fortune, il ne se lève pas pour si peu : ses attaques à distance seulement.
        const usable = boss.seated ? attaques.filter((a) => BOSS_ATTACKS[a].distance) : attaques;
        const name = usable[boss.turn++ % usable.length];
        boss.timer = rythme;
        if (name) BOSS_ATTACKS[name].run(game, boss, def.attaques[name]);
      }
    }
  }

  boss.vy = Math.min(boss.vy + GRAVITY * dt, 500);
  moveBox(world, boss, dt);
  if (boss.hitY) boss.vy = 0;
  if (boss.hitX && boss.state === 'charge') {
    // La charge s'écrase dans le décor et l'abîme.
    const tx = Math.floor((boss.hitX > 0 ? boss.x + boss.w + 1 : boss.x - 1) / TILE);
    for (let ty = Math.floor(boss.y / TILE); ty <= Math.floor((boss.y + boss.h - 1) / TILE); ty++) world.damage(tx, ty, 2, 'ordre');
    game.emit('shake', { force: 6 });
    boss.state = 'idle';
  }
  if (boss.active && !hero.dead && overlap(boss, hero)) game.hurtHero(boss.state === 'charge' ? boss.charge.damage : 1);
}

/** Le héros touche la machine. */
export function hurtBoss(game, boss, amount) {
  if (amount <= 0 || boss.state === 'ejecting' || boss.state === 'gone') return;
  wakeBoss(game, boss);
  boss.hp = Math.max(0, boss.hp - amount);
  boss.flash = 0.1;
  game.sfx('impact', boss.x);
  if (boss.hp > 0) {
    if (boss.seated && boss.hp / boss.hpMax < boss.def.leve) {
      boss.seated = false; // cette fois, il se lève
      bossSays(boss);
      game.emit('boss', { state: 'stand' });
    }
    return;
  }
  boss.state = 'ejecting';
  boss.timer = EJECT_TIME;
  boss.boom = 0;
  boss.vx = 0;
  boss.bubble = null;
  game.emit('boss', { state: 'defeated' });
  game.emit('shake', { force: 10 });
  game.addPanic(10);
}
