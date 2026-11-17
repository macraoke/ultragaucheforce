// La manif qui grossit : recrues, comptages, dispersions, force du nombre, débordement, nasse,
// découvertes et bandeau de PANIQUE TV.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureBundle, flat, level, play, run, settle } from './helpers.js';
import { TILE } from '../../src/sim/world.js';
import { LINE_REACH, KETTLE_FLOOR } from '../../src/sim/enemy.js';
import { spawnProjectile } from '../../src/sim/projectile.js';
import { syncCortege } from '../../src/sim/manif.js';

const enemy = (id) => ({ type: 'ennemi', id });
const recruit = (id) => ({ type: 'recrue', id });
const of = (events, type) => events.filter((e) => e.type === type);
const losses = (events) => of(events, 'dispersed').map(({ n, crowd, reason }) => ({ n, crowd, reason }));

// ---------------------------------------------------------------- recrues

test('recrue : rejoint la manif une seule fois, en la touchant ou en lui tendant un tract', () => {
  const lvl = () => flat({ cortege: true, legende: { v: recruit('voisine') }, draw: (put, ground) => put(ground, 9, 'v') });
  const game = settle(play(lvl()));
  assert.equal(game.crowd, 10, 'dix personnes au départ quand le niveau a un cortège');
  assert.equal(game.cortege.length, 3);
  assert.equal(game.recruits.length, 1);

  let events = run(game, 60, { right: true });
  assert.deepEqual(of(events, 'recruit').map(({ id, n, crowd }) => ({ id, n, crowd })), [{ id: 'voisine', n: 20, crowd: 30 }]);
  assert.equal(game.crowd, 30);
  assert.equal(game.cortege.length, 5, 'le cortège qu’on voit grossit avec elle');
  assert.ok(game.recruits[0].joined);
  assert.ok(events.some((e) => e.type === 'bubble' && e.text === 'SLOGAN UN'), 'elle arrive avec son slogan');
  assert.ok(game.panic > 0, 'et PANIQUE TV s’inquiète un peu');

  events = [...run(game, 40, { left: true }), ...run(game, 60, { right: true })]; // on repasse dessus
  assert.equal(of(events, 'recruit').length, 0);
  assert.equal(game.crowd, 30);
  assert.equal(game.stats.recruits, 1);

  const shooter = settle(play(lvl()));
  events = run(shooter, 40, { fire: true });
  assert.equal(of(events, 'recruit').length, 1, 'un tract suffit, sans bouger');
  assert.equal(shooter.crowd, 30);
});

test('recrue « multiplie » : l’assemblée générale double la manif, quelle que soit sa taille', () => {
  const lvl = (extra) => flat({ cortege: true, legende: { a: recruit('assemblee') }, draw: (put, ground) => put(ground, 8, 'a'), ...extra });
  const small = settle(play(lvl()));
  run(small, 60, { right: true });
  assert.equal(small.crowd, 20);

  const big = settle(play(lvl({ manif: 700 })));
  assert.equal(big.crowd, 700, 'le niveau fixe la manif de départ');
  assert.equal(big.cortege.length, 40, 'on en dessine quarante au plus');
  const events = run(big, 60, { right: true });
  assert.equal(big.crowd, 1400, 'le nombre, lui, n’est pas plafonné');
  assert.equal(of(events, 'recruit')[0].n, 700);
  assert.equal(big.cortege.length, 40);

  const alone = settle(play(lvl({ cortege: false })));
  assert.equal(alone.crowd, 0, 'sans cortège, la manif part de zéro');
  run(alone, 60, { right: true });
  assert.equal(alone.crowd, 1, 'multiplier zéro amène quand même quelqu’un');
  assert.equal(alone.cortege.length, 0);
});

test('recrue qui soigne : un medic rend des points de vie au héros, sans dépasser son maximum', () => {
  const lvl = () => flat({ cortege: true, legende: { m: recruit('soigneuse') }, draw: (put, ground) => put(ground, 9, 'm') });
  const hurt = settle(play(lvl()));
  hurt.hero.hp = 1;
  const events = run(hurt, 60, { right: true });
  assert.equal(hurt.hero.hp, 2);
  assert.equal(of(events, 'recruit')[0].healed, 1);

  const fine = settle(play(lvl()));
  const full = fine.hero.hp;
  assert.equal(of(run(fine, 60, { right: true }), 'recruit')[0].healed, 0, 'en pleine forme : rien à soigner');
  assert.equal(fine.hero.hp, full);
});

// ---------------------------------------------------------------- dispersions

test('dispersion : personne ne meurt, et il reste toujours quelqu’un dans le cortège', () => {
  const game = settle(play(flat({ cortege: true, manif: 100 })));
  const lives = game.lives;
  let events = [];
  game.killHero();
  events.push(...game.events.splice(0));
  assert.equal(game.crowd, 85, 'la chute du héros disperse 15 % de la manif');
  assert.deepEqual(losses(events), [{ n: 15, crowd: 85, reason: 'chute' }]);
  assert.equal(game.lives, lives - 1, 'seul le héros y laisse une vie');
  run(game, 80);

  for (let i = 0; i < 60; i++) game.disperse(0.5);
  assert.equal(game.crowd, 1, 'jamais en dessous d’une personne');
  assert.equal(game.cortege.length, 1, 'et on la voit toujours derrière le héros');
  assert.equal(game.disperse(0.5), 0);
  assert.equal(game.stats.dispersed, 99);
  assert.equal(game.disperse(0), 0, 'une part nulle ne disperse rien');

  const gassed = settle(play(flat({ cortege: true, manif: 200 }), { invincible: true }));
  const m = gassed.cortege[0];
  gassed.clouds.push({ x: m.x, y: m.y - 8, r: 30, t: 9 });
  events = run(gassed, 300);
  assert.deepEqual(losses(events), [{ n: 6, crowd: 194, reason: 'gaz' }], 'un nuage disperse 3 %, une seule fois : des gazés');
  assert.ok(gassed.stats.gassed >= 2, 'plusieurs manifestants gazés, une seule dispersion');

  const none = play(flat({ manif: 4 }));
  none.disperse(1);
  assert.equal(none.crowd, 0, 'sans cortège à l’écran, la manif peut se vider');
});

// ---------------------------------------------------------------- le nombre fait la force

test('force du nombre : plus la manif est grande, plus les tracts portent', () => {
  const alone = play(flat());
  assert.equal(alone.power(), 1, 'seul, un tract vaut un tract');
  const powers = [0, 10, 100, 1000, 5000].map((manif) => play(flat({ manif })).power());
  for (let i = 1; i < powers.length; i++) assert.ok(powers[i] > powers[i - 1], 'la force croît avec le nombre');
  assert.ok(powers.at(-1) < 3, '…lentement');

  // Statue à 3 pv, prise de dos : trois tracts à un contre un, deux quand on est mille.
  const shots = (manif) => {
    const game = settle(play(flat({
      manif, legende: { s: enemy('statue') },
      draw: (put, ground) => put(ground, 8, 's'),
    }), { invincible: true }));
    const foe = game.enemies[0];
    foe.facing = 1; // elle regarde ailleurs : son bouclier ne pare pas
    run(game, 240, (i, g) => ({ fire: foe.state !== 'done' && g.stats.tracts < 9 }));
    assert.equal(foe.state, 'done');
    return game.stats.tracts;
  };
  const few = shots(0);
  const many = shots(1000);
  assert.ok(many < few, `moins de tracts à mille (${many}) que seul (${few})`);

  const boss = play(flat({ boss: 'gros', manif: 1000, draw: (put, ground) => put(ground, 12, 'Y') }), { invincible: true });
  settle(boss);
  run(boss, 50, { fire: true });
  const hits = (boss.boss.hpMax - boss.boss.hp) / boss.power();
  assert.ok(hits >= 1 && Math.abs(hits - Math.round(hits)) < 1e-6, 'chaque tract enlève au boss un point multiplié par la force');
});

// ---------------------------------------------------------------- les lignes : une vie, et la manif qui pousse

const wall = ({ draw = (put, ground) => put(ground, 12, 'l'), legende = {}, ...extra } = {}) => flat({
  cortege: true, legende: { l: enemy('ligne'), ...legende }, draw, ...extra,
});

test('ligne : tant qu’elle a de la vie, elle tient : ni en marchant, ni en sautant, ni par la spéciale', () => {
  const game = settle(play(wall()));
  const { hero } = game;
  const line = game.enemies[0];
  assert.ok(line.blocking);
  assert.equal(line.hp, line.def.ligne.vie, 'une vie de ligne, pas les « pv » d’une unité');
  run(game, 200, (i) => ({ right: true, jump: i % 40 < 20 }));
  assert.ok(hero.x + hero.w <= line.x + 0.001, 'ni en marchant, ni en sautant');
  assert.notEqual(line.state, 'done');
  game.step({ special: true });
  run(game, 30);
  assert.notEqual(line.state, 'stunned', 'la spéciale ne la fait pas reculer');
  assert.equal(line.x, line.home.x);
  assert.ok(LINE_REACH > hero.def.saut * TILE, 'le barrage monte plus haut que le plus haut des sauts');
});

test('ligne : la manif au contact la pousse, d’autant plus vite qu’elle est nombreuse', () => {
  const push = (manif) => {
    const game = settle(play(wall({ manif })));
    const line = game.enemies[0];
    let from = -1;
    let steps = 0;
    for (; steps < 60 * 60 && line.state !== 'done'; steps++) {
      run(game, 1, { right: true });
      if (from < 0 && line.push > 0) from = steps;
    }
    assert.equal(line.state, 'done', `${manif} manifestants finissent par la faire céder`);
    return steps - from;
  };
  const vie = fixtureBundle().ennemis.ligne.ligne.vie;
  const { poussee } = fixtureBundle().ennemis.ligne.ligne;
  const small = push(50);
  const big = push(500);
  // `ligne.poussee` points de vie par seconde pour cent manifestants : 5 par seconde à 50, 50 à 500.
  assert.ok(Math.abs(small - (vie / ((poussee * 50) / 100)) * 60) <= 2, `à 50, en ${small} pas`);
  assert.ok(Math.abs(big - (vie / ((poussee * 500) / 100)) * 60) <= 2, `à 500, en ${big} pas`);
  assert.ok(big * 5 < small, 'dix fois plus nombreuse, elle passe dix fois plus vite');
});

test('ligne : plus rien ne la fait céder d’un coup : ni un nombre atteint au loin, ni son propre camp ; elle s’use petit à petit', () => {
  const game = settle(play(wall({ width: 80, manif: 1000, draw: (put, ground) => put(ground, 40, 'l') })));
  const line = game.enemies[0];
  const vie = line.def.ligne.vie;
  run(game, 600);
  assert.equal(line.hp, vie, 'mille manifestants, mais loin d’elle : rien ne bouge');
  game.explode(line.x + line.w / 2, line.y + line.h / 2, 30, { team: 'ordre', friendly: true, damage: 5 });
  game.hurtEnemy(line, 10, 'ordre');
  assert.equal(line.hp, vie, 'les coups de son propre camp n’y font rien');
  assert.notEqual(line.state, 'done');

  const seen = [];
  const events = run(game, 600, (i, g) => {
    if (line.state !== 'done') seen.push(line.hp);
    return { right: true };
  });
  const worn = seen.filter((hp) => hp < vie);
  assert.ok(worn.length >= 20, `elle s’use sur ${worn.length} pas, pas d’un coup`);
  assert.ok(worn.every((hp, i) => i === 0 || hp < worn[i - 1]), 'sa vie ne fait que baisser');
  assert.equal(of(events, 'overrun').length, 1, 'à zéro, elle cède');
  assert.equal(line.blocking, false);
  assert.equal(game.stats.overrun, 1);
  run(game, 60, { right: true });
  assert.ok(game.hero.x > line.x + line.w, 'la manif passe');
});

test('ligne : la manif ne la pousse ni à travers le sol, ni à travers un mur', () => {
  // Une ligne sur une dalle ; le héros passe dans le couloir, six cases dessous, avec mille manifestants.
  const below = settle(play(flat({
    width: 60, height: 20, cortege: true, manif: 1000, legende: { l: enemy('ligne') },
    draw: (put) => {
      put(13, 14, 'A'.repeat(16)); // la dalle, six cases au-dessus du sol du couloir
      put(12, 22, 'l'); // la ligne, posée dessus
    },
  })));
  const line = below.enemies[0];
  let passed = false;
  run(below, 600, (i, g) => {
    passed ||= g.hero.x > line.x + line.w;
    return { right: true };
  });
  assert.ok(passed, 'le héros est passé dessous');
  assert.equal(line.hp, line.def.ligne.vie, 'vie inchangée');

  // Au même niveau, mais un mur entre eux : rien non plus.
  const walled = settle(play(flat({
    width: 40, manif: 1000, legende: { l: enemy('ligne') },
    draw: (put, ground) => {
      for (let row = ground - 6; row <= ground; row++) put(row, 18, 'A');
      put(ground, 21, 'l');
    },
  })));
  const behind = walled.enemies[0];
  run(walled, 300, { right: true });
  assert.ok(Math.abs(walled.hero.x + walled.hero.w / 2 - (behind.x + behind.w / 2)) < 72, 'le héros est tout près, de l’autre côté du mur');
  assert.equal(behind.hp, behind.def.ligne.vie, 'vie inchangée');
});

test('ligne : enfoncée dans son cratère, elle reste poussée depuis le bord, et cède', () => {
  // Un sol de terre ; la ligne est posée dessus. On creuse deux cases sous elle : elle tombe au fond.
  const rows = [
    ...Array.from({ length: 7 }, () => '.'.repeat(40)),
    `..D.........l.......................S...`,
    'T'.repeat(40),
    'T'.repeat(40),
    'A'.repeat(40),
    'A'.repeat(40),
  ];
  const game = settle(play(level(rows, { cortege: true, manif: 140, legende: { l: enemy('ligne') } })));
  const line = game.enemies[0];
  const feet = line.y + line.h;
  for (let tx = Math.floor(line.x / TILE); tx <= Math.floor((line.x + line.w - 0.01) / TILE); tx++) {
    game.world.set(tx, 8, 0);
    game.world.set(tx, 9, 0);
  }
  run(game, 30);
  assert.equal(line.y + line.h, feet + 2 * TILE, 'elle est au fond du cratère, deux cases plus bas');
  let rim = false;
  const events = run(game, 60 * 10, (i, g) => {
    rim ||= g.hero.y + g.hero.h === feet && Math.abs(g.hero.x + g.hero.w - line.x) < 1;
    return { right: true };
  });
  assert.ok(rim, 'le héros est au bord, retenu par sa barrière');
  assert.equal(of(events, 'overrun').length, 1, 'la manif la pousse, et elle cède');
});

// ---------------------------------------------------------------- nasse

const nasse = (ennemi, extra = {}) => flat({
  width: 70, nasse: { ennemi, nombre: 2, vitesse: 20 },
  draw: (put, ground) => put(ground, 30, 'N'), ...extra,
});

test('nasse : les lignes apparaissent des deux côtés, se referment, et finissent toujours par être levées', () => {
  const game = settle(play(nasse('statue'), { invincible: true }));
  const { hero } = game;
  let events = run(game, 400, { right: true });
  const start = of(events, 'kettle');
  assert.deepEqual(start.map((e) => e.state), ['start']);
  assert.equal(game.enemies.length, 4, 'deux de chaque côté');
  assert.ok(game.enemies.every((e) => e.blocking && e.kettle));
  assert.ok(game.kettle.x0 < hero.x && hero.x + hero.w <= game.kettle.x1 + 0.001, 'le héros est pris entre les deux lignes');
  const gap = game.kettle.x1 - game.kettle.x0;
  assert.ok(gap < 2 * 140, 'elles se sont rapprochées');

  events = run(game, 60 * 21, (i) => ({ right: i % 200 < 100, left: i % 200 >= 100, fire: true, jump: i % 50 < 20 }));
  assert.ok(game.kettle === null, 'au bout de vingt secondes au plus, la nasse est levée');
  assert.deepEqual(of(events, 'kettle'), [{ type: 'kettle', state: 'end', reason: 'time' }]);
  assert.ok(game.enemies.every((e) => e.state === 'done' && !e.blocking));
  run(game, 600, { right: true });
  assert.equal(game.status, 'won', 'jamais une impasse : on sort du niveau');
});

test('nasse au rythme du niveau : elle revient d’elle-même, là où le héros se trouve, sans repère', () => {
  const game = settle(play(flat({ width: 70, nasse: { ennemi: 'statue', nombre: 2, vitesse: 20, rythme: 3 } }), { invincible: true }));
  assert.equal(of(run(game, 60 * 2), 'kettle').length, 0, 'pas avant le délai');
  const events = run(game, 60 * 2);
  assert.deepEqual(of(events, 'kettle').map((e) => e.state), ['start']);
  assert.ok(Math.abs(game.kettle.x - (game.hero.x + game.hero.w / 2)) < TILE, 'autour du héros');
  const later = run(game, 60 * 30);
  assert.ok(of(later, 'kettle').filter((e) => e.state === 'end').length >= 1, 'toujours levée');
  assert.ok(of(later, 'kettle').filter((e) => e.state === 'start').length >= 1, 'puis elle revient');

  const calm = settle(play(flat({ width: 70, nasse: { ennemi: 'statue', nombre: 2, vitesse: 20, rythme: 0 } }), { invincible: true }));
  assert.equal(of(run(calm, 60 * 20), 'kettle').length, 0, 'rythme 0 : seulement aux repères');
});

test('nasse : elle prend fin si une ligne cède ou si le héros en sort par le haut', () => {
  const broken = settle(play(nasse('ligne', { cortege: true }), { invincible: true }));
  run(broken, 260, { right: true });
  assert.ok(broken.kettle, 'nasse en cours');
  broken.addCrowd(300); // la manif pousse la ligne qui la retient
  let events = run(broken, 300, { right: true });
  assert.deepEqual(of(events, 'kettle'), [{ type: 'kettle', state: 'end', reason: 'broken' }]);
  assert.ok(of(events, 'overrun').length >= 1);

  const out = settle(play(nasse('statue'), { invincible: true }));
  run(out, 260, { right: true });
  assert.ok(out.kettle);
  out.hero.x = out.kettle.x1 + 80; // passé au-dessus de la ligne, retombé de l'autre côté
  events = run(out, 2);
  assert.deepEqual(of(events, 'kettle'), [{ type: 'kettle', state: 'end', reason: 'out' }]);

  const calm = settle(play(nasse('statue', { nasse: { ennemi: '', nombre: 2, vitesse: 20 } })));
  events = run(calm, 400, { right: true });
  assert.equal(of(events, 'kettle').length, 0, 'sans unité désignée, le repère ne fait rien');
});

/**
 * Une rue à trois étages : une passerelle un étage au-dessus (rangée 7), la rue (rangée 11, une case de terre sur
 * l'acier), le métro dessous (sol en rangée 16), et une trémie dans la chaussée, juste après le repère, pour y descendre.
 */
function storeys() {
  const W = 70;
  const grid = Array.from({ length: 17 }, () => Array(W).fill('.'));
  const put = (row, col, text) => [...text].forEach((c, i) => { grid[row][col + i] = c; });
  put(16, 0, 'A'.repeat(W));
  put(11, 0, 'T'.repeat(W));
  put(12, 0, 'A'.repeat(W));
  put(11, 33, '..'); // la trémie vers le métro
  put(12, 33, '..');
  put(7, 18, 'A'.repeat(36)); // la passerelle, un étage au-dessus de la rue
  put(10, 2, 'D');
  put(10, 30, 'N');
  put(10, 66, 'S');
  return level(grid.map((r) => r.join('')), { nasse: { ennemi: 'statue', nombre: 2, vitesse: 20 } });
}

/** Le héros pris dans la nasse de la rue, immobile au milieu. */
function kettled() {
  const game = settle(play(storeys(), { invincible: true }));
  run(game, 400, (i, g) => ({ right: !g.kettle }));
  assert.ok(game.kettle, 'la nasse s’est formée dans la rue');
  return game;
}

test('nasse : elle ne tient que l’étage de ses lignes ; monter d’un étage ou descendre au métro suffit pour en sortir', () => {
  // Dedans : sauter sur place ne fait pas sortir de la nasse.
  const inside = kettled();
  assert.ok(inside.kettle.units.every((e) => e.y + e.h === 11 * TILE), 'ses lignes sont dans la rue');
  let events = run(inside, 120, (i) => ({ jump: i % 30 < 15 }));
  assert.equal(of(events, 'kettle').length, 0, 'un saut n’en sort pas');
  assert.ok(inside.kettle);

  // À l'étage au-dessus, sur la passerelle : libre.
  const above = kettled();
  above.hero.y = 7 * TILE - above.hero.h;
  above.hero.vy = 0;
  events = run(above, 10);
  assert.deepEqual(of(events, 'kettle'), [{ type: 'kettle', state: 'end', reason: 'out' }], 'à l’étage au-dessus, la nasse est levée');
  events = run(above, 240, { right: true });
  assert.ok(above.hero.x > 45 * TILE, 'il passe au-dessus des lignes, sans barrage');

  // En dessous : il tombe par le trou dans le métro, libre.
  const below = kettled();
  below.hero.x = 33 * TILE + 2;
  events = run(below, 60);
  assert.deepEqual(of(events, 'kettle'), [{ type: 'kettle', state: 'end', reason: 'out' }], 'descendu au métro, la nasse est levée');
  assert.ok(below.hero.y + below.hero.h > 13 * TILE, 'il est bien sous la rue');

  // Un trou d'une case sous ses pieds ne le fait pas sortir : ni creusé par lui, ni laissé par une grenade.
  const dug = kettled();
  events = run(dug, 60 * 3, { down: true, fire: true });
  assert.ok(dug.hero.y + dug.hero.h > dug.kettle?.y, 'il est dans son trou');
  assert.equal(of(events, 'kettle').length, 0, 'creuser une case n’en sort pas');
  const blown = kettled();
  const feet = blown.hero.y + blown.hero.h;
  blown.explode(blown.hero.x + blown.hero.w / 2, feet + TILE / 2, 10, { team: 'ordre', terrain: 9 });
  events = run(blown, 60);
  assert.ok(blown.hero.y + blown.hero.h > feet, 'la grenade a creusé la chaussée sous lui');
  assert.equal(of(events, 'kettle').length, 0, 'un trou de grenade n’en sort pas');

  // Le barrage d'une ligne de nasse s'arrête à son étage : au-dessus, rien ne retient ; dedans, on ne passe pas.
  const wall = kettled();
  const unit = wall.kettle.units.find((e) => e.kettle > 0);
  const ground = unit.y + unit.h;
  const at = (feet) => {
    Object.assign(wall.hero, { x: unit.x, y: feet - wall.hero.h });
    wall.blockHero();
    return wall.hero.x !== unit.x;
  };
  assert.equal(at(ground - KETTLE_FLOOR), false, 'à l’étage au-dessus, il passe');
  assert.equal(at(ground - 2 * TILE), true, 'à son étage, même en l’air, la ligne le retient');
  assert.ok(KETTLE_FLOOR < LINE_REACH, 'moins haut que le barrage d’une ligne ordinaire');
});

test('nasse : le repère ne se déclenche qu’à son étage', () => {
  const game = settle(play(storeys(), { invincible: true }));
  game.hero.x = 20 * TILE;
  game.hero.y = 7 * TILE - game.hero.h; // sur la passerelle, au-dessus du repère
  const events = run(game, 200, { right: true });
  assert.ok(game.hero.x > 32 * TILE, 'il est passé au-dessus du repère');
  assert.equal(of(events, 'kettle').length, 0, 'à l’étage au-dessus, pas de nasse');
});

test('nasse : ses lignes ne craignent pas les grenades de leur propre camp', () => {
  /** Une grenade fratricide qui tombe droit sur l'unité. */
  const grenade = (game, unit) => spawnProjectile(game, {
    team: 'ordre', friendly: true, w: 5, h: 5, damage: 3, range: 200, explosion: 18,
    x: unit.x + unit.w / 2 - 2, y: unit.y - 24, vy: 80, gravity: 400,
  });
  const game = settle(play(nasse('statue'), { invincible: true }));
  run(game, 260, { right: true });
  assert.ok(game.kettle, 'nasse en cours');
  const unit = game.kettle.units[0];
  grenade(game, unit);
  const events = run(game, 60);
  assert.equal(unit.hp, unit.def.pv, 'pv inchangés');
  assert.notEqual(unit.state, 'done');
  assert.ok(of(events, 'parry').some((e) => e.line), 'paré, comme une ligne');

  // Témoin : la même grenade sur la même unité, hors de toute nasse, l'entame.
  const alone = settle(play(flat({ legende: { u: enemy('statue') }, draw: (put, ground) => put(ground, 20, 'u') }), { invincible: true }));
  const statue = alone.enemies[0];
  grenade(alone, statue);
  run(alone, 60);
  assert.ok(statue.hp < statue.def.pv, 'hors nasse, son propre camp l’entame');
});

// ---------------------------------------------------------------- découvertes

test('découvertes : chaque personnage ou mot est signalé une seule fois par partie', () => {
  const game = play(flat({
    width: 90, cortege: true, panneaux: { 1: 'BIENVENUE' },
    legende: { v: recruit('voisine'), c: enemy('crieur'), f: enemy('fonceur') },
    draw: (put, ground) => {
      put(ground, 4, '1');
      put(ground, 7, 'v');
      put(ground, 10, 'K');
      put(ground, 16, 'f');
      put(ground, 19, 'f');
      put(ground, 30, 'c');
      put(ground, 34, 'c');
    },
  }), { invincible: true });
  const events = [...game.events.splice(0), ...run(game, 900, (i) => ({ right: i < 60 || i > 500, left: i >= 60 && i < 90, fire: i > 100 }))];
  const found = of(events, 'discover').map((e) => `${e.kind}:${e.id}`);
  assert.equal(new Set(found).size, found.length, 'jamais deux fois la même');
  for (const key of ['heros:alpha', 'heros:beta', 'recrue:voisine', 'ennemi:fonceur', 'ennemi:crieur']) {
    assert.ok(found.includes(key), `${key} manque dans ${found.join(', ')}`);
  }
  assert.ok(found.includes('mot:MOT UN') || found.includes('mot:MOT DEUX'), 'les mots criés se collectionnent');

  const arena = play(flat({ boss: 'gros', draw: (put, ground) => put(ground, 12, 'Y') }), { invincible: true });
  const seen = [...arena.events.splice(0), ...run(arena, 120)];
  assert.deepEqual(of(seen, 'discover').map((e) => `${e.kind}:${e.id}`), ['heros:alpha', 'boss:gros']);
});

// ---------------------------------------------------------------- bandeau

test('alertes de PANIQUE TV : les manchettes du niveau d’abord, puis les bandeaux du fonds commun, avec leur crédit', () => {
  const bundle = { ...fixtureBundle(), manchettes: [{ texte: 'BANDEAU RELEVÉ', credit: 'Chaîne, janv. 2023 — https://exemple.org/bandeau' }] };
  const game = play(flat({ manchette: ['NIVEAU UN'] }), { bundle });
  game.events.splice(0);
  game.headline();
  game.headline();
  game.headline('FLASH SPÉCIAL');
  assert.deepEqual(of(game.events, 'headline').map((e) => [e.text, e.credit]), [
    ['NIVEAU UN', undefined],
    ['BANDEAU RELEVÉ', 'Chaîne, janv. 2023 — https://exemple.org/bandeau'],
    ['FLASH SPÉCIAL', undefined],
  ]);
});

// ---------------------------------------------------------------- pancartes

test('pancartes : les manifestants qui arrivent en portent parfois une, tirée au hasard, nouvelle ou non', () => {
  const lvl = flat({ cortege: true, legende: { v: recruit('voisine') }, draw: (put, ground) => put(ground, 9, 'v') });
  let drawn = 0;
  let joined = 0;
  const texts = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const game = settle(play(lvl, { seed }));
    const start = game.stats.signs;
    const events = run(game, 60, { right: true });
    joined += of(events, 'recruit').length;
    drawn += game.stats.signs - start;
    for (const e of of(events, 'sign')) texts.add(e.text);
    assert.equal(of(events, 'sign').length, game.stats.signs - start, 'chaque pancarte arrivée est signalée');
  }
  assert.equal(joined, 60);
  assert.ok(drawn > 30 && drawn < 150, `tantôt oui, tantôt non (${drawn} pancartes pour 60 recrues)`);
  assert.deepEqual([...texts].sort(), ['PANCARTE DEUX', 'PANCARTE UN'], 'avec ou sans source, toutes peuvent sortir');
});

test('pancartes : les rares sortent moins souvent, et le cortège ne montre que celles qui sont arrivées', () => {
  const bundle = { ...fixtureBundle(), pancartes: [{ texte: 'COMMUNE', credit: '', rarete: 0 }, { texte: 'LÉGENDAIRE', credit: 'vue — https://exemple.org', rarete: 3 }] };
  const seen = { COMMUNE: 0, LÉGENDAIRE: 0 };
  let empty = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const game = play(flat({ cortege: true }), { bundle, seed });
    const carrier = game.cortege.find((m) => m.kind === 'pancarte');
    assert.deepEqual(game.signs.length, game.stats.signs);
    if (!game.signs.length) {
      empty++;
      assert.equal(carrier.label, '', 'aucune pancarte arrivée : le porteur a les mains vides');
    } else {
      assert.equal(carrier.label, game.signs.at(-1));
      seen[carrier.label]++;
    }
  }
  assert.ok(empty > 120 && empty < 280, `une fois sur deux, le cortège de départ n'en a pas (${empty} sur 400)`);
  assert.ok(seen.LÉGENDAIRE > 0 && seen.COMMUNE > seen.LÉGENDAIRE * 2, `une légendaire sort trois fois moins qu’une commune : ${JSON.stringify(seen)}`);
});

// ---------------------------------------------------------------- drapeaux

test('drapeaux : plus de drapeaux que de porteurs, chacun finit par défiler d’une partie à l’autre', () => {
  const base = fixtureBundle();
  const one = Object.values(base.drapeaux)[0];
  const drapeaux = Object.fromEntries(Array.from({ length: 23 }, (_, i) => [`lutte-${i}`, one]));
  const bundle = { ...base, drapeaux };
  const seen = new Set();
  for (let seed = 1; seed <= 23; seed++) {
    const game = settle(play(flat({ cortege: true }), { bundle, seed }));
    game.crowd = 1000;
    syncCortege(game);
    const flags = game.cortege.filter((m) => m.kind === 'drapeau').map((m) => m.label);
    assert.ok(flags.length < 23, `un cortège plein porte moins de drapeaux qu’il n’en existe (${flags.length})`);
    assert.equal(new Set(flags).size, flags.length, 'pas deux fois le même drapeau dans un cortège');
    flags.forEach((f) => seen.add(f));
  }
  assert.equal(seen.size, 23, 'la graine change le premier drapeau : aucun ne reste au vestiaire');
});
