// PANIQUE TV sur le terrain : quand la panique franchit un palier, une poubelle prend feu
// et une équipe télé vient filmer le feu, pas la manif.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtureBundle, flat, play, run, settle } from './helpers.js';

const enemy = (id) => ({ type: 'ennemi', id });
const decor = (id) => ({ type: 'decor', id });
const of = (events, type) => events.filter((e) => e.type === type);
const centre = (b) => b.x + b.w / 2;

/** Le contenu d'essai, plus une poubelle qui brûle et une équipe télé à pied (ses répliques : ses bandeaux). */
function bundle() {
  const base = fixtureBundle();
  const crew = { ...base.ennemis.drone, id: 'equipe', nom: 'Équipe télé', deplacement: 'marche', vitesse: 40, panique: 3, pv: 2, replique: ['UN VRAI BANDEAU ?'] };
  const bin = { id: 'poubelle', nom: 'Poubelle', brule: true, devant: false, ecrit: '', sprites: { image: ['kkkk', 'kkkk'] } };
  const plant = { ...bin, id: 'plante', brule: false };
  return { ...base, ennemis: { ...base.ennemis, equipe: crew }, decors: { poubelle: bin, plante: plant } };
}

/** Un niveau plat : une poubelle (ou une plante) à huit cases du héros, une équipe télé endormie tout au bout. */
const street = (what) => flat({
  width: 90,
  legende: { p: decor(what), t: enemy('equipe') },
  draw: (put, ground) => {
    put(ground, 10, 'p');
    put(ground, 80, 't');
  },
});

test('palier de panique : une poubelle prend feu, une équipe télé vient la filmer, elle, pas le héros', () => {
  const game = settle(play(street('poubelle'), { bundle: bundle() }));
  const { hero } = game;
  const before = game.enemies.length;
  game.addPanic(40); // franchit le premier palier
  const events = game.events.splice(0);
  assert.equal(of(events, 'fire').length, 1, 'le feu est signalé au client');
  assert.equal(game.fires.length, 1);
  const [fire] = game.fires;
  assert.equal(game.decors.find((d) => d.id === 'poubelle').fire, fire, 'c’est la poubelle qui brûle');
  assert.equal(game.enemies.length, before + 2, 'toujours deux renforts au palier : l’équipe en est un');
  const crew = game.enemies.find((e) => e.film);
  assert.equal(crew.film, fire);
  assert.equal(crew.def.id, 'equipe');

  run(game, 400); // le héros ne bouge pas, à huit cases du feu
  assert.ok(Math.abs(centre(crew) - fire.x) <= 31, `l’équipe s’est plantée devant le feu (à ${Math.abs(centre(crew) - fire.x).toFixed(0)} px)`);
  assert.ok(crew.framing, 'elle filme');
  assert.equal(crew.facing, Math.sign(fire.x - centre(crew)), 'tournée vers le feu');
  assert.ok(Math.abs(centre(hero) - centre(crew)) > 70, 'le héros est hors de son champ : ce n’est pas lui qu’elle cadre');

  const panic = game.panic;
  const said = of(run(game, 300), 'bubble');
  assert.ok(game.panic > panic, 'tant qu’elle filme le feu, la panique monte');
  assert.ok(game.panic - panic < 3 * 5, 'mais doucement');
  assert.ok(crew.bubble === null || ['● REC', 'UN VRAI BANDEAU ?'].includes(crew.bubble.text), 'elle ne dit que ses répliques');
  assert.equal(said.length, 0);

  game.hurtEnemy(crew, 99, 'luttes');
  const frozen = game.panic;
  run(game, 120);
  assert.equal(crew.state, 'done');
  assert.ok(!crew.framing, 'en panne, elle ne filme plus');
  assert.equal(game.panic, frozen, 'et la panique ne monte plus');
});

test('palier de panique : la même poubelle ne brûle pas deux fois, et le tout reste borné', () => {
  const game = settle(play(street('poubelle'), { bundle: bundle() }));
  const before = game.enemies.length;
  game.addPanic(40);
  game.addPanic(40); // second palier : plus de poubelle à allumer
  assert.equal(game.fires.length, 1);
  assert.equal(game.enemies.filter((e) => e.film).length, 1);
  assert.equal(game.enemies.length, before + 4, 'quatre renforts au plus, équipe comprise');
});

test('palier de panique sans décor qui brûle : rien ne change', () => {
  const game = settle(play(street('plante'), { bundle: bundle() }));
  const before = game.enemies.length;
  game.addPanic(40);
  assert.equal(game.fires.length, 0);
  assert.equal(of(game.events, 'fire').length, 0);
  assert.equal(game.enemies.filter((e) => e.film).length, 0);
  assert.equal(game.enemies.length, before + 2, 'deux renforts, comme avant');
});

test('palier de panique sans unité télé dans la légende : la poubelle brûle, personne ne vient la filmer', () => {
  const lvl = flat({ width: 90, legende: { p: decor('poubelle'), g: enemy('garde') }, draw: (put, ground) => { put(ground, 10, 'p'); put(ground, 80, 'g'); } });
  const game = settle(play(lvl, { bundle: bundle() }));
  game.addPanic(40);
  assert.equal(game.fires.length, 1);
  assert.equal(game.enemies.filter((e) => e.film).length, 0);
});

test('même graine, mêmes feux : la partie reste déterministe', () => {
  const trace = () => {
    const game = settle(play(street('poubelle'), { bundle: bundle(), seed: 11 }));
    game.addPanic(40);
    run(game, 500, { right: true });
    return JSON.stringify([game.fires, game.enemies.map((e) => [e.def.id, Math.round(e.x), e.state, e.framing]), Math.round(game.panic * 100)]);
  };
  assert.equal(trace(), trace());
});
