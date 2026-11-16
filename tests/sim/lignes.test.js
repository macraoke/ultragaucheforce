// Une ligne qui tient arrête aussi l'autre camp : ses unités au sol (charge, ruée, marche, recul) et ses tirs droits,
// comme elle arrête le héros et ses tracts (qui l'entament). Les grenades passent par-dessus.
// Une ligne qui a cédé n'arrête plus personne.

import test from 'node:test';
import assert from 'node:assert/strict';
import { flat, play, run, settle } from './helpers.js';

const enemy = (id) => ({ type: 'ennemi', id });
const of = (events, type) => events.filter((e) => e.type === type);

/** La ligne d'essai (soixante points de vie) en colonne 5, une unité d'en face derrière elle, en colonne `col`. */
const behind = (id, { col = 8, ...extra } = {}) => flat({
  width: 40, legende: { l: enemy('ligne'), u: enemy(id) },
  draw: (put, ground) => {
    put(ground, 5, 'l');
    put(ground, col, 'u');
  },
  ...extra,
});

const parts = (game) => ({ line: game.enemies.find((e) => e.def.id === 'ligne'), foe: game.enemies.find((e) => e.def.id !== 'ligne') });

test('ligne qui tient : la charge d’en face s’y arrête, le héros qui attend devant n’est pas touché ; ses tracts s’y écrasent', () => {
  const game = settle(play(behind('chargeur')));
  const { hero } = game;
  const { line, foe } = parts(game);
  const phases = [];
  const events = [];
  for (let i = 0; i < 600; i++) {
    events.push(...run(game, 1, { right: true })); // sans manif ni tracts : la ligne tient tout du long
    const phase = foe.rush?.phase ?? null;
    if (phase && phases.at(-1) !== phase) phases.push(phase);
    assert.ok(foe.x >= line.x + line.w - 0.001, `la charge ne traverse pas la ligne (pas ${i})`);
  }
  assert.deepEqual(phases.slice(0, 4), ['sommation', 'ruee', 'pause', 'sommation'], 'sommations, ruée, puis la ruée s’arrête à la ligne');
  assert.ok(Math.abs(foe.x - (line.x + line.w)) < 1, 'elle est venue jusqu’au contact de la ligne');
  assert.equal(of(events, 'hurt').length, 0, 'le héros n’est pas touché');
  assert.equal(hero.hp, hero.def.pv);

  assert.ok(hero.x + hero.w <= line.x + 0.001, 'le héros reste devant la ligne');
  assert.equal(line.hp, line.def.ligne.vie, 'personne ne l’a entamée');

  // Ses tracts s'écrasent sur la ligne, qu'ils entament : l'unité derrière n'en reçoit aucun.
  run(game, 20, { right: true, fire: true });
  assert.ok(line.hp < line.def.ligne.vie, 'les tracts l’entament');
  assert.notEqual(line.state, 'done', 'elle tient encore');
  assert.equal(foe.hp, foe.def.pv, 'derrière elle, rien ne l’atteint');
});

test('ligne qui tient : rien ne passe au sol, ni en fonçant, ni à moto, ni en reculant sous un coup', () => {
  for (const id of ['fonceur', 'moto', 'chargeur']) {
    const game = settle(play(behind(id)));
    const { line, foe } = parts(game);
    let x = Infinity;
    const events = run(game, 300, (i, g) => {
      x = Math.min(x, foe.x);
      return {};
    });
    assert.ok(x >= line.x + line.w - 0.001, `${id} : ne traverse pas (au plus près, ${(x - line.x - line.w).toFixed(1)} px derrière)`);
    assert.equal(of(events, 'hurt').length, 0, `${id} : le héros n’est pas touché`);

    // Le recul d'une unité sonnée la pousse vers la ligne : elle s'y arrête aussi.
    Object.assign(foe, { state: 'stunned', stun: 1, kick: -400, x: line.x + line.w + 2 });
    run(game, 30);
    assert.ok(foe.x >= line.x + line.w - 0.001, `${id} : le recul ne la fait pas passer`);
  }
});

test('ligne qui tient : une grenade lancée de derrière passe par-dessus et touche encore', () => {
  const game = settle(play(behind('garde')));
  const { line } = parts(game);
  let over = false;
  const events = run(game, 150, () => {
    over ||= game.projectiles.some((p) => p.team === 'ordre' && p.gravity > 0 && p.x + p.w < line.x);
    return {};
  });
  assert.ok(over, 'la grenade franchit la ligne');
  const hurt = of(events, 'hurt');
  assert.ok(hurt.length >= 1 && hurt.every((e) => e.kind === 'explosion' || e.kind === 'gaz'), 'le héros est touché par la grenade ou son gaz');
});

test('ligne qui tient : les tirs droits d’en face s’y écrasent, comme nos tracts ; le jet du canon à eau s’y arrête', () => {
  const shot = settle(play(behind('viseur')));
  const { line } = parts(shot);
  const events = run(shot, 300);
  assert.ok(of(events, 'sfx').filter((e) => e.id === 'tir').length >= 3, 'il tire');
  assert.equal(of(events, 'hurt').length, 0, 'aucun tir ne passe');
  assert.ok(of(events, 'parry').filter((e) => e.line).length >= 3, 'chaque tir est paré par la ligne');
  assert.equal(line.hp, line.def.ligne.vie, 'et ne l’entame pas');

  const jet = settle(play(behind('canon', { col: 9 })));
  const { line: wall, foe: canon } = parts(jet);
  const x0 = jet.hero.x;
  let longest = 0;
  run(jet, 300, () => {
    longest = Math.max(longest, canon.jet?.length ?? 0);
    return {};
  });
  assert.ok(longest > 0, 'il arrose');
  assert.ok(canon.x - longest >= wall.x + wall.w - 4, `le jet s’arrête à la ligne (${longest} px)`);
  assert.equal(jet.hero.x, x0, 'le héros n’est pas repoussé');
});

test('ligne cédée : elle n’arrête plus personne, la charge passe', () => {
  const game = settle(play(behind('chargeur', { manif: 1000 })));
  const { hero } = game;
  const { line, foe } = parts(game);
  run(game, 30); // mille manifestants, à portée : la manif la pousse
  assert.equal(line.state, 'done', 'poussée jusqu’à zéro, elle a cédé');
  let x = Infinity;
  const events = run(game, 200, () => {
    x = Math.min(x, foe.x);
    return {};
  });
  assert.ok(x + foe.w < line.x, 'la charge passe là où était la ligne');
  assert.ok(of(events, 'hurt').some((e) => e.kind === 'charge'), 'et touche le héros');
  assert.ok(hero.hp < hero.def.pv);
});

test('ligne qui tient : une ruée s’arrête dès qu’elle touche la ligne, sans finir sa course contre elle', () => {
  const game = settle(play(behind('chargeur')));
  const { line, foe } = parts(game);
  const step = foe.def.charge.vitesse / 60;
  let from = null;
  let rushing = 0;
  let paused = false;
  for (let i = 0; i < 400 && !paused; i++) {
    run(game, 1);
    if (foe.rush?.phase === 'ruee') {
      from ??= foe.x + step; // là où la ruée est partie
      rushing++;
    }
    paused = rushing > 0 && foe.rush?.phase === 'pause';
  }
  assert.ok(paused, 'la ruée a pris fin');
  const contact = (from - (line.x + line.w)) / step; // pas pour aller de son départ à la ligne
  assert.ok(rushing <= contact + 3, `elle s’arrête au contact (${rushing} pas de ruée, ${contact.toFixed(0)} pour arriver)`);
  assert.ok(rushing < (foe.def.charge.distance / foe.def.charge.vitesse) * 60 - 10, 'bien avant la fin de sa course');
  // Collée à la ligne, elle ne relance pas de ruée contre elle : pas de bruit de charge sans fin.
  const later = run(game, 60 * 10);
  assert.equal(of(later, 'sfx').filter((e) => e.id === 'charge').length, 0, 'plus de ruée contre la ligne');
  assert.ok(Math.abs(foe.x - (line.x + line.w)) < 2, 'elle reste au contact');
});

test('ligne qui tient : une moto et une patrouille y font demi-tour, comme devant un mur', () => {
  // La moto fonce vers la ligne, qui est entre elle et le héros.
  const moto = settle(play(behind('moto')));
  const { line, foe } = parts(moto);
  let reached = false;
  let turned = false;
  for (let i = 0; i < 600 && !turned; i++) {
    run(moto, 1);
    assert.ok(foe.x >= line.x + line.w - 0.001, 'elle ne traverse pas');
    reached ||= foe.x - (line.x + line.w) < 2;
    turned = reached && foe.facing > 0 && foe.x - (line.x + line.w) > 16;
  }
  assert.ok(reached, 'elle est allée jusqu’à la ligne');
  assert.ok(turned, 'puis elle repart dans l’autre sens');

  // Une patrouille : le héros est trop loin pour qu'elle le voie, elle va et vient.
  const walk = settle(play(flat({
    width: 60, legende: { l: enemy('ligne'), g: enemy('garde') },
    draw: (put, ground) => {
      put(ground, 16, 'l');
      put(ground, 19, 'g');
    },
  })));
  const guard = walk.enemies.find((e) => e.def.id === 'garde');
  const wall = walk.enemies.find((e) => e.def.id === 'ligne');
  let closest = Infinity;
  let back = false;
  for (let i = 0; i < 600 && !back; i++) {
    run(walk, 1);
    assert.notEqual(guard.state, 'alert', 'elle ne voit pas le héros');
    closest = Math.min(closest, guard.x - (wall.x + wall.w));
    back = guard.facing > 0 && guard.x > wall.x + wall.w + 20;
  }
  assert.ok(closest < 2, 'elle est allée jusqu’à la ligne');
  assert.ok(back, 'puis elle a fait demi-tour');
});

test('nasse : une ligne qui se referme laisse dehors les unités qu’elle rattrape, jamais enfermées avec le héros', () => {
  for (const col of [37, 23]) {
    const game = settle(play(flat({
      width: 70, nasse: { ennemi: 'statue', nombre: 2, vitesse: 20 }, legende: { u: enemy('agent') },
      draw: (put, ground) => {
        put(ground, 30, 'N');
        put(ground, col, 'u');
      },
    }), { invincible: true }));
    const foe = game.enemies.find((e) => e.def.id === 'agent');
    const mark = 30 * 16 + 8;
    let closest = Infinity;
    let kettled = false;
    run(game, 60 * 15, (i, g) => {
      kettled ||= Boolean(g.kettle);
      const cx = g.hero.x + g.hero.w / 2;
      if (g.kettle) closest = Math.min(closest, Math.abs(foe.x + foe.w / 2 - cx));
      return { right: cx < mark - 2, left: cx > mark + 2 };
    });
    assert.ok(kettled, 'la nasse s’est formée');
    assert.ok(closest > 50, `colonne ${col} : l’unité reste hors de la nasse (au plus près, ${closest.toFixed(0)} px du héros)`);
  }
});
