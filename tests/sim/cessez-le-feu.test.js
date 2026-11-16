// Le boss vaincu, l'ordre cesse le feu : plus de tir, de charge, de grenade ni d'interpellation,
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

/** Des coups déjà partis vers le héros et le cortège : un tir droit, un tir qui vise le cortège, une grenade. */
function inFlight(game) {
  const { hero } = game;
  const m = game.cortege.at(-1);
  const common = { team: 'ordre', w: 4, h: 4, damage: 1, range: 200 };
  spawnProjectile(game, { ...common, x: hero.x + hero.w + 20, y: hero.y + 4, vx: -150 });
  spawnProjectile(game, { ...common, x: m.x + 24, y: m.y - 10, vx: -150, touche: 5 });
  spawnProjectile(game, { ...common, x: hero.x + 2, y: hero.y - 40, vy: 60, gravity: 400, explosion: 18, gas: 3, friendly: true });
}

/** Le scénario : on laisse l'ordre attaquer, on lance des coups, puis (ou non) le boss tombe ; le héros avance. */
function scenario(defeat) {
  const game = settle(play(street(), { lives: 9 }));
  run(game, 90); // l'ordre a commencé : sommations, visées, grenades
  inFlight(game);
  const before = new Set(game.projectiles);
  const flying = game.projectiles.filter((p) => p.team === 'ordre').length;
  if (defeat) game.hurtBoss(game.boss.hp);
  const crowd = game.crowd;
  const bubbles = game.enemies.map((e) => e.bubble?.text ?? null);
  const spawned = [];
  const events = run(game, 360, (i, g) => {
    for (const p of g.projectiles) if (p.team === 'ordre' && !before.has(p)) spawned.push(p);
    return { right: i < 150 };
  });
  const said = game.enemies.filter((e, i) => e.bubble && e.bubble.text !== bubbles[i]).map((e) => e.bubble.text);
  return { game, events, crowd, flying, spawned: new Set(spawned), said };
}

test('cessez-le-feu : sans boss vaincu, la même rue attaque le héros et le cortège', () => {
  const { events, game, crowd } = scenario(false);
  assert.ok(of(events, 'hurt').length >= 2, 'le héros est touché');
  assert.ok(of(events, 'dispersed').length >= 1 && game.crowd < crowd, 'la manif perd du monde');
});

test('cessez-le-feu : le boss vaincu, plus personne n’attaque, et ce qui volait ne blesse plus', () => {
  const { events, game, crowd, flying, spawned, said } = scenario(true);
  assert.equal(game.truce, true);
  assert.ok(flying >= 3, `des coups étaient en vol au moment de la victoire (${flying})`);
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
