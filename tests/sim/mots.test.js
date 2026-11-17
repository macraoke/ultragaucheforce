// Les mots d'en face (éditorialistes, ministres) : un préavis avant le tir, une tête qui blesse à la bouche,
// et des lettres que les tracts du héros abattent.

import test from 'node:test';
import assert from 'node:assert/strict';
import { flat, play, run, settle } from './helpers.js';
import { overlap } from '../../src/sim/physics.js';
import { wordBox } from '../../src/sim/projectile.js';
import { WORD_CHAR } from '../../src/sim/behaviors.js';

const enemy = (id) => ({ type: 'ennemi', id });
const of = (events, type) => events.filter((e) => e.type === type);
const words = (game) => game.projectiles.filter((p) => p.team === 'ordre' && p.word);
/** Avance jusqu'au premier mot (trois secondes au plus). */
function untilWord(game) {
  for (let i = 0; i < 180 && !words(game).length; i++) run(game, 1);
  assert.ok(words(game).length, 'l’orateur doit avoir parlé');
  return words(game)[0];
}
const arena = (col) => flat({ legende: { o: enemy('orateur') }, draw: (put, ground) => put(ground, col, 'o') });

test('mots : un préavis visible avant chaque mot, rien ne part pendant', () => {
  const game = settle(play(arena(14)));
  const foe = game.enemies[0];
  let warned = 0;
  while (!words(game).length && warned < 200) {
    run(game, 1);
    if (foe.aim) {
      warned++;
      assert.equal(foe.aim.straight, true, 'un tir droit devant : pas de visée sur le héros');
      assert.equal(words(game).length, 0, 'rien ne part pendant le préavis');
    }
  }
  assert.ok(warned >= 22 && warned <= 26, `arme.visee: 0.4 s de préavis (${warned} pas)`);
  const [word] = words(game);
  assert.ok(word.vx < 0 && word.vy === 0, 'puis le mot part tout droit vers le héros');
});

test('mots : la tête blesse, les lettres suivent derrière, à la taille du mot dessiné', () => {
  const game = settle(play(arena(14)));
  const word = untilWord(game);
  const foe = game.enemies[0];
  assert.equal(word.w, foe.def.arme.taille, 'la boîte qui blesse : la tête, « arme.taille »');
  assert.equal(word.text, Math.ceil(word.word.length * WORD_CHAR), 'le mot dessiné : 3,3 pixels par lettre');
  assert.ok(word.text < word.word.length * 5, 'plus court que l’ancienne boîte de 5 pixels par lettre');
  assert.ok(foe.x - (word.x + word.w) >= 0 && foe.x - (word.x + word.w) < 3, 'la tête part de la bouche, pas plus loin');
  const box = wordBox(word);
  assert.ok(box.x === word.x && box.w === word.text, 'les lettres suivent derrière la tête');
});

test('mots : un mot ne démarre jamais sur le héros, même à un pas de la bouche', () => {
  // Près : le héros à 40 pixels de la bouche. L'ancienne boîte (5 pixels par lettre, toute devant) le touchait au départ.
  const near = settle(play(arena(6)));
  const { hero } = near;
  const foe = near.enemies[0];
  const word = untilWord(near);
  const gap = foe.x - (hero.x + hero.w);
  assert.ok(gap > word.w && gap < word.word.length * 5, `le héros est à ${gap} pixels de la bouche`);
  assert.ok(!overlap(word, hero), 'au départ, le mot ne touche pas le héros');
  let steps = 0;
  while (hero.hp === hero.def.pv && steps < 120) {
    run(near, 1);
    steps++;
  }
  assert.equal(hero.hp, hero.def.pv - 1, 'immobile, il finit par être touché');
  assert.ok(steps * 1000 / 60 >= (gap - word.w) / foe.def.arme.vitesse * 1000 - 20, `le mot a fait le chemin (${steps} pas)`);

  // Collé : le héros contre l'orateur. Le mot qui naît sur lui le traverse sans le blesser.
  const glued = settle(play(arena(3)));
  const born = untilWord(glued);
  assert.ok(overlap(born, glued.hero) && born.spare, 'né sur le héros : il le traverse');
  run(glued, 60);
  assert.equal(glued.hero.hp, glued.hero.def.pv, 'aucun mot ne démarre sur le joueur');
});

test('mots : un tract qui touche une lettre abat le mot entier', () => {
  const game = settle(play(arena(14)));
  const foe = game.enemies[0];
  untilWord(game);
  const hp = foe.hp;
  const events = run(game, 40, { fire: true });
  const down = of(events, 'wordDown');
  assert.ok(down.length >= 1, 'le mot est abattu en vol');
  assert.ok(down[0].word, 'on sait quel mot');
  assert.equal(game.hero.hp, game.hero.def.pv, 'le héros n’est pas touché');
  assert.ok(of(events, 'sfx').some((e) => e.id === 'touche'), 'ça s’entend');
  assert.ok(foe.hp >= hp - 1, 'le tract qui abat le mot s’arrête là');

  // Même partie, mêmes actions : même résultat.
  const again = settle(play(arena(14)));
  untilWord(again);
  assert.deepEqual(of(run(again, 40, { fire: true }), 'wordDown'), down);
});
