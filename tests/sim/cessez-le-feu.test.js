// Le boss vaincu, l'ordre cesse le feu : plus de tir, de charge, de grenade, d'interpellation, de renfort ni de nasse,
// et ce qui volait encore ne blesse plus ni le héros ni le cortège.

import test from 'node:test';
import assert from 'node:assert/strict';
import { flat, play, run, settle } from './helpers.js';
import { spawnProjectile } from '../../src/sim/projectile.js';

const enemy = (id) => ({ type: 'ennemi', id });
const of = (events, type) => events.filter((e) => e.type === type);

/** Une rue tenue par l'ordre, le boss au bout. Le héros avance, le cortège passe sur l'agent qui interpelle. */
const street = () => flat({
  width: 70, cortege: true, manif: 100, boss: 'gros',
  legende: { c: enemy('chargeur'), g: enemy('garde'), t: enemy('tireur'), a: enemy('agent'), v: enemy('viseur'), k: enemy('canon') },
  draw: (put, ground) => {
    put(ground, 4, 'a');
    put(ground, 9, 'c');
    put(ground, 11, 'g');
    put(ground, 14, 't');
    put(ground, 17, 'v');
    put(ground, 22, 'k');
    put(ground, 64, 'Y');
  },
});

/** Le scénario : on laisse l'ordre attaquer, puis (ou non) le boss tombe ; le héros, sans protection, traverse la rue. */
function scenario(defeat) {
  const game = settle(play(street(), { lives: 9 }));
  run(game, 90); // l'ordre a commencé : sommations, visées, grenades
  const before = new Set(game.projectiles);
  if (defeat) game.hurtBoss(game.boss.hp);
  game.hero.invuln = 0;
  const crowd = game.crowd;
  const bubbles = game.enemies.map((e) => e.bubble?.text ?? null);
  const spawned = [];
  const events = run(game, 360, (i, g) => {
    for (const p of g.projectiles) if (p.team === 'ordre' && !before.has(p)) spawned.push(p);
    return { right: i < 150 };
  });
  const said = game.enemies.filter((e, i) => e.bubble && e.bubble.text !== bubbles[i]).map((e) => e.bubble.text);
  return { game, events, crowd, spawned: new Set(spawned), said };
}

test('cessez-le-feu : sans boss vaincu, la même rue attaque le héros et le cortège', () => {
  const { events, game, crowd } = scenario(false);
  assert.ok(of(events, 'hurt').length >= 2, 'le héros est touché');
  assert.ok(of(events, 'dispersed').length >= 1 && game.crowd < crowd, 'la manif perd du monde');
});

test('cessez-le-feu : le boss vaincu, plus personne n’attaque', () => {
  const { events, game, crowd, spawned, said } = scenario(true);
  assert.equal(game.truce, true);
  assert.deepEqual(of(events, 'hurt'), [], 'le héros n’est plus touché : ni tir, ni grenade, ni gaz, ni charge');
  assert.deepEqual(of(events, 'dispersed'), [], 'la manif ne perd plus personne : ni interpellation, ni tir, ni gaz');
  assert.equal(game.crowd, crowd);
  assert.equal(spawned.size, 0, 'plus aucun tir ni grenade ne part');
  for (const e of game.enemies) {
    assert.equal(e.rush, null, `${e.def.id} : pas de charge`);
    assert.equal(e.aim, null, `${e.def.id} : pas de visée`);
    assert.equal(e.jet, null, `${e.def.id} : pas de jet`);
  }
  assert.deepEqual(said, [], 'aucune réplique de plus');
  const chargeur = game.enemies.find((e) => e.def.id === 'chargeur');
  const x = chargeur.x;
  run(game, 60);
  assert.equal(chargeur.x, x, 'il reste où il est');
});

// ---------------------------------------------------------------- ce qui volait encore

/** Un héros seul, immobile et sans protection ; le boss au bout de la rue. Un tonneau à deux cases de lui. */
const alone = () => settle(play(flat({ width: 40, boss: 'gros', draw: (put, ground) => {
  put(ground, 4, 'X');
  put(ground, 36, 'Y');
} })));

/** Chaque coup, lancé juste avant la victoire (ou sans victoire) : un tir droit, une grenade, un nuage, un tonneau. */
const BLOWS = {
  // (une portée courte : le tir s'éteint avant d'atteindre le tonneau, qui a son propre cas)
  tir: (g) => spawnProjectile(g, { team: 'ordre', w: 4, h: 4, damage: 1, range: 40, x: g.hero.x - 24, y: g.hero.y + 4, vx: 150 }),
  explosion: (g) => spawnProjectile(g, { team: 'ordre', w: 4, h: 4, damage: 1, range: 200, x: g.hero.x - 18, y: g.hero.y - 30, vy: 60, gravity: 400, explosion: 18 }),
  gaz: (g) => g.clouds.push({ x: g.hero.x + g.hero.w / 2, y: g.hero.y + g.hero.h / 2, r: 26, t: 4, team: 'ordre' }),
  tonneau: (g) => spawnProjectile(g, { team: 'ordre', w: 4, h: 4, damage: 1, range: 200, x: 4 * 16 + 30, y: g.hero.y + 6, vx: -150 }),
};
const KIND = { tir: 'tir', explosion: 'explosion', gaz: 'gaz', tonneau: 'explosion' };

function blow(name, defeat) {
  const game = alone();
  BLOWS[name](game);
  if (defeat) game.hurtBoss(game.boss.hp);
  game.hero.invuln = 0;
  return of(run(game, 120), 'hurt');
}

test('cessez-le-feu : un tir, une grenade, un nuage ou un tonneau de l’ordre, encore en l’air, ne blessent plus', () => {
  for (const name of Object.keys(BLOWS)) {
    assert.deepEqual(blow(name, false).map((e) => e.kind).slice(0, 1), [KIND[name]], `${name} : sans victoire, il blesse le héros`);
    assert.deepEqual(blow(name, true), [], `${name} : le boss vaincu, il ne blesse plus`);
  }
});

// ---------------------------------------------------------------- ni renfort, ni nasse

test('cessez-le-feu : la panique de la victoire n’amène plus de renfort', () => {
  const street = () => settle(play(flat({ width: 60, boss: 'gros', legende: { d: enemy('drone') }, draw: (put, ground) => {
    put(ground - 6, 40, 'd');
    put(ground, 56, 'Y');
  } })));
  const calm = street();
  calm.panic = 30; // un palier tout près
  calm.addPanic(10);
  assert.ok(calm.enemies.length > 1, 'sans victoire, le palier amène des renforts');

  const won = street();
  won.panic = 30;
  const events = [];
  won.hurtBoss(won.boss.hp); // la victoire fait monter la panique de dix : le palier est franchi
  events.push(...won.events.splice(0));
  assert.equal(won.panicLevel, 1, 'le palier est bien franchi');
  events.push(...run(won, 120));
  assert.equal(won.enemies.length, 1, 'mais personne ne vient');
  assert.equal(of(events, 'fire').length, 0, 'ni feu de poubelle, ni équipe pour le filmer');
});

test('cessez-le-feu : plus de nasse après la victoire', () => {
  const street = () => settle(play(flat({ width: 70, nasse: { ennemi: 'statue', nombre: 2, vitesse: 20 }, boss: 'gros', draw: (put, ground) => {
    put(ground, 10, 'N');
    put(ground, 66, 'Y');
  } }), { invincible: true }));
  const calm = street();
  assert.deepEqual(of(run(calm, 200, { right: true }), 'kettle').map((e) => e.state), ['start'], 'sans victoire, la nasse se forme');
  const won = street();
  won.hurtBoss(won.boss.hp);
  assert.equal(of(run(won, 200, { right: true }), 'kettle').length, 0, 'le boss vaincu, le repère ne fait plus rien');
});
