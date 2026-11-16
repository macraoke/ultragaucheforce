// Les combats se lisent : le héros touché (par quoi, ce qu'il lui reste), une unité touchée, parée, sonnée, gazée
// ou hors service, la manif qui perd du monde (pourquoi, et où), et jamais d'impasse devant une ligne.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureBundle, flat, play, run, settle } from './helpers.js';
import { FEEL } from '../../src/sim/hero.js';

const enemy = (id) => ({ type: 'ennemi', id });
const of = (events, type) => events.filter((e) => e.type === type);
const sounds = (events) => of(events, 'sfx').map((e) => e.id);

// ---------------------------------------------------------------- le héros touché

test('héros touché : il blanchit un instant, puis ne craint rien ; le client sait d’où vient le coup, par quoi, et ce qui reste', () => {
  const game = settle(play(flat()));
  const { hero } = game;
  game.events.length = 0;
  const x0 = hero.x;
  game.hurtHero(1, { x: hero.x + hero.w / 2 + 40, kind: 'tir' });
  const [hurt] = of(game.events.splice(0), 'hurt');
  assert.deepEqual({ kind: hurt.kind, hp: hurt.hp, max: hurt.max, dir: hurt.dir }, { kind: 'tir', hp: hero.def.pv - 1, max: hero.def.pv, dir: -1 },
    'le coup vient de droite : le client dessine le recul vers la gauche');
  assert.ok(hero.flash > 0, 'blanc');
  assert.equal(hero.invuln, FEEL.hurtInvuln);
  run(game, 30);
  assert.equal(hero.x, x0, 'la partie ne le déplace pas : le recul est dessiné, l’équilibre ne change pas');
  assert.equal(hero.flash, 0, 'le blanc ne dure qu’un instant');
  game.hurtHero(1, { kind: 'tir' });
  assert.equal(hero.hp, hero.def.pv - 1, 'puis il clignote sans rien craindre');

  const gassed = settle(play(flat()));
  gassed.events.length = 0;
  gassed.hurtHero(1, { kind: 'gaz' });
  assert.equal(of(gassed.events, 'hurt')[0].kind, 'gaz');
});

test('héros touché : on sait par quoi — bousculé par un fonceur, chargé par une ruée', () => {
  const hitBy = (id) => {
    const game = settle(play(flat({ legende: { u: enemy(id) }, draw: (put, ground) => put(ground, 9, 'u') })));
    const events = [];
    for (let i = 0; i < 400 && game.hero.hp === game.hero.def.pv; i++) events.push(...run(game, 1));
    return of(events, 'hurt')[0];
  };
  const bumped = hitBy('fonceur');
  assert.equal(bumped.kind, 'contact');
  assert.equal(bumped.dir, -1, 'il arrive de droite : le héros recule vers la gauche');
  assert.equal(hitBy('chargeur').kind, 'charge');
});

// ---------------------------------------------------------------- une unité touchée, parée, hors service

test('bouclier de face : chaque tract arrêté se voit et s’entend (« paré »), sans flash ni dégât ; de dos, le coup porte', () => {
  const statue = (start) => settle(play(flat({
    legende: { s: enemy('statue') },
    draw: (put, ground) => {
      put(ground, 2, '.');
      put(ground, start, 'D');
      put(ground, 8, 's');
    },
  })));
  const front = statue(3);
  const unit = front.enemies[0];
  const events = [];
  let flashed = false;
  for (let i = 0; i < 120; i++) {
    events.push(...run(front, 1, { fire: true }));
    flashed ||= unit.flash > 0;
  }
  assert.ok(of(events, 'parry').length >= 5, 'chaque tract arrêté le dit');
  assert.equal(of(events, 'parry')[0].line, false);
  assert.ok(!flashed, 'pas de blanc : rien n’a porté');
  assert.equal(unit.hp, unit.def.pv);
  assert.ok(sounds(events).includes('pare') && !sounds(events).includes('touche'));

  const back = statue(13);
  run(back, 2, { left: true });
  const hits = [];
  let dir = 0;
  for (let i = 0; i < 90 && back.enemies[0].state !== 'done'; i++) {
    hits.push(...run(back, 1, { fire: true }));
    if (back.enemies[0].flash > 0) dir = back.enemies[0].hitDir;
  }
  assert.equal(dir, -1, 'le coup vient de droite et part vers la gauche : le dessin recule de ce côté');
  assert.ok(sounds(hits).includes('touche'), 'un coup qui porte a son propre bruit');
  assert.equal(of(hits, 'parry').length, 0);
});

test('ligne : un tract qui l’atteint l’entame, comme le boss ; à zéro, elle cède', () => {
  const game = settle(play(flat({ cortege: true, legende: { l: enemy('ligne') }, draw: (put, ground) => put(ground, 9, 'l') })));
  const line = game.enemies[0];
  const events = run(game, 40, { fire: true });
  assert.ok(line.hp < line.def.ligne.vie, 'les tracts l’entament');
  assert.equal(line.push, 0, 'trop loin pour que la manif pousse : ce sont bien les tracts');
  assert.equal(of(events, 'parry').length, 0, 'plus parés');
  assert.ok(sounds(events).includes('touche'), 'un coup qui porte');
  assert.equal(line.x, line.home.x, 'ni recul');
  const rest = run(game, 600, { fire: true });
  assert.equal(of(rest, 'overrun').length, 1, 'à zéro, elle cède');
  assert.equal(line.state, 'done');
});

test('un tract qui explose sur un bouclier n’est pas « paré » : le souffle passe, et seulement lui', () => {
  const blasting = structuredClone(fixtureBundle());
  Object.assign(blasting.heros.alpha.arme, { explosion: 20, cadence: 2, blindage: 0, perce: 0 });
  const game = settle(play(flat({ legende: { s: enemy('statue') }, draw: (put, ground) => put(ground, 8, 's') }), { bundle: blasting }));
  const unit = game.enemies[0];
  let both = 0;
  const events = [];
  for (let i = 0; i < 120 && unit.state !== 'done'; i++) {
    const seen = run(game, 1, { fire: true });
    events.push(...seen);
    if (of(seen, 'parry').length && unit.flash > 0) both++;
  }
  assert.equal(both, 0, 'jamais « paré » et touché par le même tract');
  assert.equal(of(events, 'parry').length, 0, 'le souffle n’est pas arrêté : rien n’est paré');
  assert.ok(unit.hp < unit.def.pv, 'le souffle l’atteint, comme avant');

  // Le même tract, sans explosion : paré, aucun dégât.
  const plain = structuredClone(blasting);
  plain.heros.alpha.arme.explosion = 0;
  const still = settle(play(flat({ legende: { s: enemy('statue') }, draw: (put, ground) => put(ground, 8, 's') }), { bundle: plain }));
  const seen = run(still, 120, { fire: true });
  assert.ok(of(seen, 'parry').length > 0);
  assert.equal(still.enemies[0].hp, still.enemies[0].def.pv);
});

test('hors service : la simulation note « EN GRÈVE ! » (le rendu ne l’écrit pas, voir tests/ecran.test.js), et un événement pour le client', () => {
  const game = settle(play(flat({ legende: { a: enemy('agent') }, draw: (put, ground) => put(ground, 8, 'a') })));
  const events = run(game, 120, { fire: true });
  const unit = game.enemies[0];
  assert.equal(unit.state, 'done');
  assert.equal(unit.bubble?.text, 'EN GRÈVE !');
  assert.deepEqual(of(events, 'down').map((e) => e.end), ['greve']);
  assert.ok(sounds(events).includes('greve'));
});

// ---------------------------------------------------------------- sonné, gazé

test('sonné par une onde ou gazé par son propre camp : deux états qui se distinguent, puis il reprend', () => {
  const game = settle(play(flat({ legende: { s: enemy('statue') }, draw: (put, ground) => put(ground, 5, 's') })));
  const unit = game.enemies[0];
  game.step({ special: true });
  assert.equal(unit.state, 'stunned');
  assert.equal(unit.daze, 'choc', 'l’onde : des étoiles');
  assert.ok(unit.hp > 0 && unit.hp < unit.def.pv, 'entamé, pas hors service');
  run(game, 60 * 4);
  assert.notEqual(unit.state, 'stunned');
  assert.equal(unit.daze, null, 'remis');

  game.clouds.push({ x: unit.x + unit.w / 2, y: unit.y + unit.h / 2, r: 30, t: 1.5 });
  run(game, 2);
  assert.equal(unit.state, 'stunned');
  assert.equal(unit.daze, 'gaz', 'le nuage : des larmes');
  run(game, 60 * 3);
  assert.equal(unit.daze, null);
});

// ---------------------------------------------------------------- la manif perd du monde

test('interpellations : une unité qui atteint le cortège emmène trois manifestants, puis souffle', () => {
  const game = settle(play(flat({ width: 80, cortege: true, manif: 100, legende: { a: enemy('agent') }, draw: (put, ground) => put(ground, 12, 'a') })));
  const events = [];
  const at = [];
  for (let i = 0; i < 400; i++) {
    const seen = run(game, 1, { right: true });
    events.push(...seen);
    if (of(seen, 'dispersed').length) at.push(i);
  }
  const losses = of(events, 'dispersed');
  assert.ok(losses.length >= 1, 'le cortège passe sur elle');
  assert.deepEqual({ n: losses[0].n, crowd: losses[0].crowd, reason: losses[0].reason }, { n: 3, crowd: 97, reason: 'interpelle' });
  assert.ok(Math.abs(losses[0].x - (game.enemies[0].x + game.enemies[0].w / 2)) < 1, 'là où elle se trouve');
  assert.ok(losses[0].gone.length <= 6, 'le client sait où étaient ceux qui partent');
  for (let k = 1; k < at.length; k++) assert.ok(at[k] - at[k - 1] >= 150, 'pas plus d’une fois toutes les deux secondes et demie');
});

test('touchés : le tir du viseur file dans le cortège (« arme.touche ») et en fait partir deux', () => {
  assert.equal(fixtureBundle().ennemis.viseur.arme.touche, 2, 'lu dans la fiche');
  // Le viseur attend à gauche ; le héros part à droite : le cortège s'étire entre eux, et c'est lui que le tir atteint.
  const game = settle(play(flat({
    width: 60, cortege: true, manif: 100, legende: { v: enemy('viseur') },
    draw: (put, ground) => {
      put(ground, 2, '.');
      put(ground, 3, 'v');
      put(ground, 10, 'D');
    },
  })));
  const { hero } = game;
  const events = run(game, 50, { right: true });
  for (let i = 0; i < 300 && !of(events, 'dispersed').length; i++) events.push(...run(game, 1));
  const [loss] = of(events, 'dispersed');
  assert.ok(loss, 'un tir atteint le cortège');
  assert.deepEqual({ n: loss.n, reason: loss.reason, crowd: loss.crowd }, { n: 2, reason: 'touche', crowd: 98 });
  assert.ok(loss.x < hero.x, 'dans le cortège, derrière le héros');
  assert.equal(hero.hp, hero.def.pv, 'le tir s’est arrêté dans le cortège : le héros n’a rien');
});

test('une unité sonnée n’interpelle personne', () => {
  const game = settle(play(flat({ width: 80, cortege: true, manif: 100, legende: { a: enemy('agent') }, draw: (put, ground) => put(ground, 12, 'a') })));
  const unit = game.enemies[0];
  const events = [];
  for (let i = 0; i < 400; i++) {
    Object.assign(unit, { state: 'stunned', stun: 1, daze: 'choc' }); // sonnée tout du long
    events.push(...run(game, 1, { right: true }));
  }
  assert.ok(game.cortege.some((m) => m.x > unit.x + unit.w), 'le cortège est passé sur elle');
  assert.equal(of(events, 'dispersed').length, 0, 'personne d’interpellé');
});

// ---------------------------------------------------------------- jamais d'impasse

test('jamais d’impasse : gazée sans relâche devant une ligne jusqu’à n’être plus qu’une, la manif passe : ses tracts l’usent', () => {
  const game = settle(play(flat({ cortege: true, legende: { l: enemy('ligne') }, draw: (put, ground) => put(ground, 12, 'l') })));
  const line = game.enemies[0];
  let crowd = Infinity;
  const events = run(game, 60 * 60, (i, g) => {
    if (i % 60 === 59) g.loseCrowd(4, 'gaz');
    if (line.state !== 'done') crowd = g.crowd;
    return { right: true, fire: true };
  });
  assert.equal(of(events, 'overrun').length, 1, 'la ligne cède');
  assert.equal(line.state, 'done');
  assert.equal(crowd, 1, 'il ne restait plus qu’une personne quand elle a cédé');
});
