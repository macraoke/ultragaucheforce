// La régie de la chaîne : un décor qu'on casse à coups de tracts. Cassée, elle coupe l'antenne de PANIQUE TV.

import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURES, fixtureBundle, flat, play, run, settle } from './helpers.js';
import { readContentFiles, loadContent } from '../../tools/content.mjs';
import { buildContent } from '../../src/content/rules.js';
import { PANIC_STEPS } from '../../src/sim/game.js';

const of = (events, type) => events.filter((e) => e.type === type);
const block = (n) => Array(n).fill('k'.repeat(16));

/** Le contenu d'essai, une régie (4 pv, 12 s d'antenne coupée, 20 points de panique en moins) et un drone télé. */
function bundle() {
  const base = fixtureBundle();
  const crew = { ...base.ennemis.drone, id: 'plateau', nom: 'Drone télé', camp: 'medias', pv: 3, panique: 5, vue: 400, replique: ['UN VRAI BANDEAU'] };
  const regie = { id: 'regie', nom: 'Régie', pv: 4, coupe: 12, coupePanique: 20, devant: false, ecrit: '', sprites: { image: block(32), cassee: block(32) } };
  return { ...base, ennemis: { ...base.ennemis, plateau: crew }, decors: { regie }, manchettes: [{ texte: 'BANDEAU', credit: '' }] };
}

/** La régie à six cases du héros, un drone télé derrière elle, qui vient le cadrer. */
const studio = () => flat({
  width: 40,
  legende: { r: { type: 'decor', id: 'regie' }, t: { type: 'ennemi', id: 'plateau' } },
  draw: (put, ground) => {
    put(ground, 8, 'r');
    put(ground, 18, 't');
  },
});

/** Tire vers la droite jusqu'à ce que la régie tombe (dix secondes au plus) ; rend les événements. */
function breakIt(game) {
  const seen = [];
  for (let i = 0; i < 600 && !game.decors[0].broken; i++) {
    seen.before = game.panic; // la panique juste avant le coup qui la casse
    seen.push(...run(game, 1, { fire: i % 2 === 0 }));
  }
  return seen;
}

test('régie : quatre tracts la cassent, et l’antenne est coupée douze secondes', () => {
  const game = settle(play(studio(), { bundle: bundle() }));
  const [regie] = game.decors;
  assert.equal(regie.hp, 4);
  const seen = breakIt(game);
  assert.ok(regie.broken, 'cassée');
  assert.equal(of(seen, 'decorDown').length, 1);
  assert.deepEqual(of(seen, 'offAir').map((e) => e.seconds), [12]);
  assert.ok(game.offAir > 11.9 && game.offAir <= 12);
  assert.equal(game.enemies[0].hp, game.enemies[0].def.pv, 'les tracts s’arrêtent sur la régie : le drone derrière n’est pas touché');

  const after = run(game, 30, { fire: true });
  assert.equal(of(after, 'decorDown').length + of(after, 'offAir').length, 0, 'une régie cassée ne se casse plus');
});

test('antenne coupée : la panique ne monte plus, aucune alerte, les médias se taisent ; puis tout reprend', () => {
  const game = settle(play(studio(), { bundle: bundle() }));
  game.addPanic(50); // premier palier franchi
  assert.equal(game.panicLevel, 1);
  const { before } = breakIt(game);
  assert.ok(before > 54, `les tracts et le plateau l’ont fait monter (${before.toFixed(1)})`);
  assert.ok(Math.abs(game.panic - (before - 20)) < 0.5, 'elle perd vingt points');
  game.panic = 40;
  game.cutAir(1, 20, 0);
  assert.equal(game.panic, PANIC_STEPS[0], 'sans repasser sous le palier atteint');
  run(game, 61);

  game.events.splice(0);
  game.addPanic(40);
  game.headline();
  const quiet = run(game, 60);
  assert.equal(game.panicLevel, 1, 'ni palier…');
  assert.equal(of([...game.events, ...quiet], 'headline').length, 0, '… ni alerte');
  const [crew] = game.enemies;
  assert.ok(!crew.framing && crew.state === 'patrol', 'le drone ne cadre plus');
  assert.equal(crew.bubble, null, 'et ne dit rien');

  run(game, 12 * 60); // l'antenne revient
  assert.equal(game.offAir, 0);
  assert.ok(crew.framing, 'le drone cadre à nouveau');
  assert.ok(game.panic > PANIC_STEPS[0] + 5, 'la panique remonte');
});

test('régie : même graine, même partie', () => {
  const snapshot = () => {
    const game = settle(play(studio(), { bundle: bundle(), seed: 5 }));
    breakIt(game);
    run(game, 240, { right: true, fire: true });
    return [game.time, game.offAir, game.panic, game.hero.x, game.enemies.map((e) => [e.state, e.hp])];
  };
  assert.deepEqual(snapshot(), snapshot());
});

test('régie : le vérificateur borne ses réglages, et une coupure exige un décor qui se casse', () => {
  const files = readContentFiles();
  const path = 'content/decors/essai-regie.txt';
  const check = (head) => buildContent([...files, { path, text: `nom: Essai\n${head}\n--- image\nkk\nkk\n` }]).errors.filter((e) => e.file === path).map((e) => e.message);
  assert.deepEqual(check('pv: 2\ncoupe: 5\ncoupe.panique: 10'), []);
  assert.match(check('coupe: 5').join(), /doit pouvoir se casser/);
  assert.match(check('pv: 2\ncoupe: 31').join(), /entre 0 et 30/);
  assert.match(check('pv: 13').join(), /entre 0 et 12/);
  assert.match(check('pv: 2\ncoupe.panique: 40').join(), /entre 0 et 33/);

  const { bundle: real } = loadContent();
  const level = real.niveaux['chaine-info'];
  const signs = Object.entries(level.legende).filter(([, ref]) => ref.id === 'regie-antenne').map(([c]) => c);
  assert.equal(level.carte.join('').split('').filter((c) => signs.includes(c)).length, 1, 'une seule régie de l’antenne, au dernier étage de la chaîne d’info');
});

test('« panique » : un niveau peut partir avec de la panique, sous le premier palier ; sans la clé, de zéro', () => {
  const files = readContentFiles(FIXTURES);
  const plaine = files.find((f) => f.path.endsWith('plaine.txt'));
  const withLine = (line) => buildContent(files.map((f) => (f === plaine ? { ...f, text: f.text.replace('fond: campagne', `fond: campagne\n${line}`) } : f)));
  const ok = withLine('panique: 20');
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.bundle.niveaux.plaine.panique, 20);
  assert.ok(withLine(`panique: ${PANIC_STEPS[0]}`).errors.length, 'pas jusqu’au premier palier');
  assert.equal(buildContent(files).bundle.niveaux.plaine.panique, 0, 'sans la clé : zéro');
  const start = (level) => {
    const game = play(level);
    return { panic: game.panic, level: game.panicLevel };
  };
  assert.deepEqual(start(flat({ width: 20, panique: 20 })), { panic: 20, level: 0 });
  assert.deepEqual(start(flat({ width: 20 })), { panic: 0, level: 0 });
});
