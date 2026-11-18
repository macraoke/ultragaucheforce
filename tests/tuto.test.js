// Le tuto, joué comme un joueur : chaque panneau qui nomme un geste est fait, dans l'ordre, et la consigne le voit.
// Grimper au mur, creuser la dalle, lancer en haut sur le drone de PANIQUE TV : chacun a son espace.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../tools/content.mjs';
import { Game } from '../src/sim/game.js';
import { botActions } from '../src/sim/bot.js';
import { coach, gesturesOf, guideView } from '../src/client/consigne.js';
import { TUTORIAL } from '../src/client/collection.js';
import { TILE } from '../src/sim/world.js';

const { bundle } = await loadContent();
const tuto = bundle.niveaux[TUTORIAL];
const signs = Object.values(tuto.panneaux);

test('le tuto : neuf panneaux au plus, courts, et chaque geste à apprendre a le sien', () => {
  assert.ok(signs.length <= 9);
  for (const s of signs) assert.ok(s.length <= 90, `trop long : ${s}`);
  const taught = new Set(signs.flatMap(gesturesOf));
  for (const g of ['avancer', 'sauter', 'tirer', 'grimper', 'creuser', 'lancer-haut', 'speciale']) assert.ok(taught.has(g), g);
  assert.ok(signs.some((s) => /PANIQUE TV/.test(s) && gesturesOf(s).includes('lancer-haut')), 'le drone et son lancer en haut');
});

/** Un joueur scripté : il avance de panneau en panneau et fait ce que chacun demande. */
function player() {
  const game = new Game(bundle, TUTORIAL, { seed: 7, invincible: true });
  let guide = null;
  const done = []; // les panneaux dont le ✓ est passé
  const step = (actions) => {
    game.step(actions);
    const before = guideView(guide);
    guide = coach(guide, { sign: game.sign, actions, time: game.time, hero: game.hero });
    const after = guideView(guide);
    if (before && !before.done && after?.done) done.push(after.text);
  };
  const until = (stop, actions, max = 1200) => {
    for (let i = 0; i < max && game.status === 'playing'; i++) {
      if (stop()) return true;
      step(typeof actions === 'function' ? actions() : actions);
    }
    return stop();
  };
  const reading = (start) => () => game.sign?.startsWith(start);
  return { game, step, until, reading, done, view: () => guideView(guide) };
}

test('le tuto se fait geste par geste : grimper, creuser, lancer en haut sur le drone', () => {
  const p = player();
  const { game } = p;
  const hero = () => game.hero;
  const drone = () => game.enemies.find((e) => e.def.id === 'drone');

  assert.ok(p.until(p.reading('[avancer] :'), { right: true }));
  p.step({ jump: true });
  p.until(() => hero().onGround, {});
  // Sauter tout du long : un appui à chaque atterrissage, tenu pendant la montée.
  let up = false;
  const hop = () => {
    const h = hero();
    up = h.onGround ? !up : h.vy < 0;
    return up;
  };
  assert.ok(p.until(p.reading('[tirer]'), () => ({ right: true, jump: hop() })));
  p.until(() => false, { fire: true }, 30);

  // Le mur d'acier : trop haut pour un saut, on y grimpe par rebonds.
  assert.ok(p.until(p.reading('[avancer] + [sauter]'), { right: true }));
  assert.deepEqual(p.view().hints, ['cote', 'jump'], 'au pouce : le côté et SAUT');
  const ground = hero().y;
  let held = false;
  const climbed = p.until(() => hero().onGround && hero().y < ground - 4 * TILE, () => {
    const h = hero();
    const jump = !held && (h.onGround || (h.onWall !== 0 && h.vy > -30));
    held = jump;
    return { right: true, jump };
  }, 600);
  assert.ok(climbed, 'en haut du mur');
  assert.ok(p.done.some((t) => t.startsWith('[avancer] + [sauter]')), 'la consigne a vu le rebond contre le mur');

  // Sur la dalle : on creuse jusqu'à la salle du dessous.
  assert.ok(p.until(p.reading('[bas] + [tirer]'), { right: true }, 300));
  const top = hero().y;
  assert.ok(p.until(() => hero().onGround && hero().y >= top + 3 * TILE, { down: true, fire: true }, 600), 'descendu en creusant');
  assert.ok(p.done.includes('[bas] + [tirer] : Creuser'));

  // Le drone de PANIQUE TV cadre le héros : en quelques secondes, le bandeau passe à l'alerte (le tuto part d'une
  // panique de 20, `panique: 20`). On lance en haut : les drones descendent, et la panique ne monte plus.
  assert.ok(p.until(p.reading('Le drone'), { right: true }, 900));
  assert.equal(game.panicLevel, 0, 'encore calme en arrivant au drone');
  assert.ok(p.until(() => drone().framing, { right: true }, 300), 'le drone cadre le héros');
  const filmed = game.time;
  assert.ok(p.until(() => game.panicLevel >= 1, {}, 60 * 8), 'filmé, PANIQUE TV passe à l’alerte');
  assert.ok(game.time - filmed > 1.5 && game.time - filmed < 8, `l'alerte en ${(game.time - filmed).toFixed(1)} s`);
  const filming = () => game.enemies.filter((e) => e.def.reaction === 'cadre' && e.state !== 'done');
  assert.ok(p.until(() => drone().state === 'done', { up: true, fire: true }, 240), 'touché en lançant en haut');
  // L'alerte envoie des renforts : d'autres drones. On les fait descendre aussi, en lançant en haut.
  assert.ok(p.until(() => !filming().length, { up: true, fire: true }, 60 * 10), 'plus aucun drone ne filme');
  const after = game.panic;
  p.until(() => false, {}, 120);
  assert.equal(game.panic, after, 'plus de drone : l’alerte ne monte plus');
  assert.equal(game.panicLevel, 1, 'elle reste à l’alerte : la panique ne redescend pas d’elle-même');
  assert.ok(p.done.some((t) => t.startsWith('Le drone')));

  // La spéciale, la cage, puis le robot finit le niveau.
  assert.ok(p.until(p.reading('[spéciale]'), { right: true }, 900));
  p.step({ special: true });
  assert.ok(p.done.includes('[spéciale] : Lancer ta spéciale') || p.view()?.done);
  const memo = {};
  assert.ok(p.until(() => hero().def.id !== tuto.heros, () => botActions(game, memo), 1800), 'un camarade libéré prend le relais');
  assert.ok(p.until(() => game.status === 'won', () => botActions(game, memo), 60 * 120), 'au bout : la sortie');
});
