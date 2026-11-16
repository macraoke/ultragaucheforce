// La manif qui grossit : recrues, comptages, dispersions, force du nombre, débordement, nasse,
// découvertes et bandeau de PANIQUE TV.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureBundle, flat, play, run, settle } from './helpers.js';
import { TILE } from '../../src/sim/world.js';
import { LINE_REACH } from '../../src/sim/enemy.js';

const enemy = (id) => ({ type: 'ennemi', id });
const recruit = (id) => ({ type: 'recrue', id });
const of = (events, type) => events.filter((e) => e.type === type);

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
  assert.deepEqual(of(events, 'dispersed'), [{ type: 'dispersed', n: 15, crowd: 85 }]);
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
  assert.deepEqual(of(events, 'dispersed'), [{ type: 'dispersed', n: 6, crowd: 194 }], 'un nuage disperse 3 %, une seule fois');
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

// ---------------------------------------------------------------- débordement

test('débordement : la ligne tient, insensible et infranchissable, puis cède quand on est assez nombreux', () => {
  const game = settle(play(flat({
    cortege: true, legende: { l: enemy('ligne') },
    draw: (put, ground) => put(ground, 12, 'l'),
  })));
  const { hero } = game;
  const line = game.enemies[0];
  assert.ok(line.blocking);

  let events = run(game, 200, (i) => ({ right: true, fire: true, jump: i % 40 < 20 }));
  assert.ok(hero.x + hero.w <= line.x + 0.001, 'ni en marchant, ni en sautant');
  assert.equal(line.hp, line.def.pv, 'les tracts ne l’entament pas');
  assert.notEqual(line.state, 'done');
  const blocked = of(events, 'blocked');
  assert.ok(blocked.length >= 2 && blocked.length <= 3, 'un rappel de temps en temps, pas à chaque image');
  assert.deepEqual({ need: blocked[0].need, crowd: blocked[0].crowd }, { need: 30, crowd: 10 });
  game.step({ special: true });
  run(game, 30);
  assert.notEqual(line.state, 'stunned', 'la spéciale ne la fait pas reculer non plus');
  assert.equal(line.x, line.home.x);
  assert.ok(LINE_REACH > hero.def.saut * TILE, 'le barrage monte plus haut que le plus haut des sauts');

  game.addCrowd(20);
  events = run(game, 5, { right: true });
  assert.equal(of(events, 'overrun').length, 1);
  assert.equal(line.state, 'done', 'débordée : elle se range');
  assert.equal(line.blocking, false);
  assert.equal(game.stats.overrun, 1);
  run(game, 60, { right: true });
  assert.ok(hero.x > line.x + line.w, 'la manif passe');
});

test('débordement : jamais d’impasse, des passants rejoignent la manif devant la ligne jusqu’à ce qu’elle cède', () => {
  const game = settle(play(flat({
    cortege: true, legende: { l: enemy('ligne') },
    draw: (put, ground) => put(ground, 12, 'l'),
  })));
  assert.equal(game.crowd, 10);
  const events = run(game, 60 * 30, { right: true });
  assert.equal(of(events, 'overrun').length, 1, 'trente manifestants finissent par être là');
  assert.ok(game.crowd >= 30);
  assert.ok(of(events, 'blocked').length >= 8, 'mais il faut insister : recruter va bien plus vite');
});

test('débordement : une ligne loin du héros attend qu’il arrive pour céder', () => {
  const game = settle(play(flat({
    width: 80, cortege: true, manif: 500, legende: { l: enemy('ligne') },
    draw: (put, ground) => put(ground, 40, 'l'),
  })));
  run(game, 60);
  assert.notEqual(game.enemies[0].state, 'done');
  const events = run(game, 400, { right: true });
  assert.equal(of(events, 'overrun').length, 1);
  assert.equal(of(events, 'blocked').length, 0, 'assez nombreux : on ne bute jamais dessus');
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
  broken.addCrowd(100);
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

test('cortège : toutes les pancartes peuvent être portées, les rares moins souvent', () => {
  const bundle = { ...fixtureBundle(), pancartes: [{ texte: 'COMMUNE', credit: '', rarete: 0 }, { texte: 'LÉGENDAIRE', credit: 'vue — https://exemple.org', rarete: 3 }] };
  const seen = { COMMUNE: 0, LÉGENDAIRE: 0 };
  for (let seed = 1; seed <= 200; seed++) {
    const game = play(flat({ cortege: true }), { bundle, seed });
    seen[game.cortege.find((m) => m.kind === 'pancarte').label]++;
  }
  assert.ok(seen.LÉGENDAIRE > 0 && seen.COMMUNE > seen.LÉGENDAIRE * 4, JSON.stringify(seen));
});
