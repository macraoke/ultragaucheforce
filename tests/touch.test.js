// Commandes tactiles : quelles actions pour des doigts donnés ?
// Le multi-toucher réel n'est pas vérifiable sur la machine de développement : la règle est
// donc une fonction pure, testée ici, doigt suivi pas à pas comme dans le jeu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchActions, trackPoint, climbAssist, ZONES } from '../src/client/input.js';
import { flat, level, play, run, settle } from './sim/helpers.js';

const VIEW = { w: 800, h: 360 }; // un téléphone tenu en paysage
const at = (action) => {
  const t = ZONES.targets.find((z) => z.action === action);
  return { x: t.x * VIEW.w, y: t.y * VIEW.h };
};
/** Un doigt posé en (ox, oy) puis glissé de (dx, dy). */
const finger = (ox, oy, dx = 0, dy = 0) => ({ ox, oy, x: ox + dx, y: oy + dy });
const tap = (action) => finger(at(action).x, at(action).y);
/** Un doigt posé en `from`, glissé jusqu'à `to` en `n` pas, suivi comme dans le jeu ; rend chaque état compris. */
const drag = (from, to, n = 20) => {
  let p = trackPoint(undefined, from, VIEW);
  const seen = [touchActions([p], VIEW)];
  for (let i = 1; i <= n; i++) {
    p = trackPoint(p, { x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n }, VIEW);
    seen.push(touchActions([p], VIEW));
  }
  return { p, seen, end: seen.at(-1) };
};
/** Le manche, posé en (100, 250), poussé à `deg` degrés (0 = droite, 90 = haut) sur `r` pixels. */
const push = (deg, r) => drag({ x: 100, y: 250 }, { x: 100 + r * Math.cos((deg * Math.PI) / 180), y: 250 - r * Math.sin((deg * Math.PI) / 180) }).end;

test('moitié gauche : le manche naît où le pouce se pose, n’importe où', () => {
  for (const [ox, oy] of [[40, 300], [200, 120], [390, 20]]) {
    assert.deepEqual(touchActions([finger(ox, oy)], VIEW), {}, 'posé, sans glisser : rien');
    assert.deepEqual(touchActions([finger(ox, oy, -30)], VIEW), { left: true });
    assert.deepEqual(touchActions([finger(ox, oy, 30)], VIEW), { right: true });
  }
});

test('le manche a une course morte : un pouce qui tremble ne fait pas marcher', () => {
  assert.deepEqual(touchActions([finger(100, 250, ZONES.dead - 1)], VIEW), {});
  assert.deepEqual(touchActions([finger(100, 250, ZONES.dead + 1)], VIEW), { right: true });
});

test('le saut part avant le bout de la course du manche, en avançant ou non', () => {
  assert.ok(ZONES.lift < ZONES.reach, 'le saut part pendant que le manche bouge encore à l’écran');
  assert.deepEqual(touchActions([finger(100, 300, 0, -(ZONES.lift + 2))], VIEW), { jump: true, up: true });
  assert.deepEqual(touchActions([finger(100, 300, 40, -(ZONES.lift + 2))], VIEW), { right: true, jump: true });
  assert.deepEqual(touchActions([finger(100, 300, 30, -(ZONES.lift - 4))], VIEW), { right: true }, 'un petit écart ne suffit pas');
});

test('le manche lu par secteurs : « haut » à 30° près de la verticale, la diagonale avance et saute', () => {
  for (const r of [ZONES.reach, 60, 80]) {
    for (const deg of [62, 75, 90, 105, 118]) assert.deepEqual(push(deg, r), { jump: true, up: true }, `${deg}°, ${r} px : on vise en haut, sans marcher`);
    assert.deepEqual(push(45, r), { right: true, jump: true }, `45°, ${r} px : on avance et on saute, le tir reste devant`);
    assert.deepEqual(push(135, r), { left: true, jump: true });
  }
  assert.deepEqual(push(10, 40), { right: true }, 'presque à plat : on avance');
  // Le pouce qui avance (le manche le suit), puis remonte : en haut de l'anneau, il vise en haut.
  let p = trackPoint(undefined, { x: 100, y: 250 }, VIEW);
  for (let x = 104; x <= 160; x += 4) p = trackPoint(p, { x, y: 250 }, VIEW);
  assert.deepEqual(touchActions([p], VIEW), { right: true });
  for (let k = 1; k <= 10; k++) p = trackPoint(p, { x: 160 - 4 * k, y: 250 - 5 * k }, VIEW);
  assert.deepEqual(touchActions([p], VIEW), { jump: true, up: true });
});

test('sorti de l’anneau, le pouce garde sa direction : l’anneau le suit', () => {
  // Le pouce part loin en haut à gauche, bien au-delà de la course du manche, et y reste.
  const { p, seen } = drag({ x: 150, y: 250 }, { x: 70, y: 170 }, 20);
  assert.ok(Math.hypot(p.x - p.ox, p.oy - p.y) <= ZONES.reach + 0.01, 'l’anneau suit le pouce');
  assert.deepEqual(seen.at(-1), { left: true, jump: true }, 'toujours en haut à gauche');
  assert.ok(seen.slice(8).every((s) => s.left && s.jump), 'sans perdre l’appui en chemin');
  // Et loin à droite, presque à plat : on avance, sans sauter.
  assert.deepEqual(drag({ x: 150, y: 250 }, { x: 300, y: 225 }).end, { right: true });
});

test('moitié droite : chaque cible répond, et tout l’écran répond (la plus proche gagne)', () => {
  assert.deepEqual(touchActions([tap('fire')], VIEW), { fire: true });
  assert.deepEqual(touchActions([tap('jump')], VIEW), { jump: true });
  assert.deepEqual(touchActions([tap('special')], VIEW), { special: true });
  assert.deepEqual(touchActions([finger(790, 350)], VIEW), { fire: true }, 'le coin en bas à droite : tir');
  assert.deepEqual(touchActions([finger(790, 10)], VIEW), { fire: true, up: true }, 'le coin en haut à droite, loin de SPÉ : tir en haut');
  assert.deepEqual(touchActions([finger(420, 350)], VIEW), { jump: true }, 'le bas, près du milieu : saut');
  for (let x = 410; x < 800; x += 30) {
    for (let y = 5; y < 360; y += 30) assert.ok(Object.keys(touchActions([finger(x, y)], VIEW)).length >= 1, `(${x}, ${y}) ne fait rien`);
  }
});

test('SPÉ ne part que d’un appui posé dessus, jamais d’un pouce qui glisse depuis TIR ou SAUT', () => {
  for (const from of ['fire', 'jump']) {
    const { seen, end } = drag(at(from), at('special'));
    assert.ok(seen.every((s) => !s.special), `glissé de ${from} jusqu’à SPÉ : pas de spéciale`);
    assert.ok(end.fire || end.jump, 'il garde son action');
  }
  const edge = at('special');
  assert.deepEqual(touchActions([finger(edge.x, edge.y + ZONES.press * VIEW.h - 2)], VIEW), { special: true }, 'posé sur le bord de SPÉ');
  const between = finger((at('fire').x + edge.x) / 2, (at('fire').y + edge.y) / 2);
  assert.ok(!touchActions([between], VIEW).special, 'posé entre TIR et SPÉ : pas de spéciale');
  // Et un doigt posé sur SPÉ reste SPÉ : glissé jusqu'à TIR, il ne tire pas.
  const { seen } = drag(edge, at('fire'));
  assert.ok(seen.every((s) => s.special && !s.fire && !s.jump));
});

test('TIR glissé vers le haut : le tir vise en haut ; le glissement entre SAUT et TIR reste', () => {
  const fire = at('fire');
  const rise = ZONES.aim * VIEW.h;
  assert.deepEqual(drag(fire, { x: fire.x, y: fire.y - 20 }).end, { fire: true }, 'un pouce qui bouge un peu sur TIR : tir devant');
  assert.deepEqual(drag(fire, { x: fire.x, y: fire.y - rise - 4 }).end, { fire: true, up: true });
  assert.deepEqual(drag(fire, { x: fire.x + 10, y: fire.y - 2 * rise }).end, { fire: true, up: true }, 'plus haut, un peu de côté');
  const { seen, end } = drag(at('jump'), fire);
  assert.deepEqual(seen[0], { jump: true });
  assert.ok(seen.some((s) => s.fire && s.jump), 'à cheval en chemin : les deux');
  assert.deepEqual(end, { fire: true });
  assert.deepEqual(drag(fire, at('jump')).end, { jump: true }, 'et dans l’autre sens');
});

test('le pouce à cheval entre TIR et SAUT fait les deux ; jamais avec SPÉ', () => {
  const fire = at('fire');
  const jump = at('jump');
  const middle = finger((fire.x + jump.x) / 2, (fire.y + jump.y) / 2);
  assert.deepEqual(touchActions([middle], VIEW), { fire: true, jump: true });
  const special = at('special');
  const between = finger((fire.x + special.x) / 2, (fire.y + special.y) / 2 - 1);
  assert.ok(!touchActions([between], VIEW).special && !touchActions([between], VIEW).jump, 'entre TIR et SPÉ : le tir, seul');
});

test('deux pouces : avancer et tirer ; trois doigts : avancer, tirer, sauter', () => {
  assert.deepEqual(touchActions([finger(120, 260, 40), tap('fire')], VIEW), { right: true, fire: true });
  assert.deepEqual(touchActions([finger(120, 260, -40), tap('fire'), tap('jump')], VIEW), { left: true, fire: true, jump: true });
});

test('un doigt garde son côté : parti de la droite, il reste une action même s’il glisse à gauche', () => {
  // Suivi réel du doigt, pas à pas : posé à droite de la frontière, il glisse loin à gauche.
  let p = trackPoint(undefined, { x: 500, y: 300 }, VIEW);
  for (let x = 480; x >= 200; x -= 20) p = trackPoint(p, { x, y: 300 }, VIEW);
  assert.equal(p.stick, false);
  assert.equal(p.ox, 500, 'son origine ne bouge pas : ce n’est pas un manche');
  const pressed = touchActions([p], VIEW);
  assert.ok(!pressed.left && !pressed.right, 'il ne fait pas marcher');
  assert.ok(pressed.jump || pressed.fire || pressed.special, 'il reste une action');

  // Et l'inverse : un manche tiré loin à droite reste un manche.
  let stick = trackPoint(undefined, { x: 380, y: 300 }, VIEW);
  for (let x = 400; x <= 700; x += 20) stick = trackPoint(stick, { x, y: 300 }, VIEW);
  assert.equal(stick.stick, true);
  assert.deepEqual(touchActions([stick], VIEW), { right: true });
  assert.deepEqual(touchActions([], VIEW), {});
});

test('tirer le manche vers le bas : on vise en bas, sans avancer ; poussé droit vers le haut : le tir suit le saut', () => {
  assert.deepEqual(touchActions([finger(100, 200, 4, ZONES.pull + 2)], VIEW), { down: true });
  assert.deepEqual(touchActions([finger(100, 200, 14, ZONES.pull + 2)], VIEW), { down: true }, 'un pouce n’est jamais parfaitement droit');
  assert.deepEqual(touchActions([finger(100, 200, 40, ZONES.pull + 2)], VIEW), { right: true }, 'en diagonale vers le bas : on avance');
  assert.deepEqual(touchActions([finger(100, 200, 0, ZONES.pull - 4)], VIEW), {});
  const lift = -(ZONES.lift + 2);
  assert.deepEqual(touchActions([finger(100, 300, 0, lift)], VIEW), { jump: true, up: true });
  assert.deepEqual(touchActions([finger(100, 300, 40, lift)], VIEW), { right: true, jump: true }, 'en avançant : un saut, le tir reste devant');
  // Le pouce redescend après un saut : on mesure depuis le point le plus haut atteint.
  assert.deepEqual(touchActions([{ ox: 100, oy: 300, ay: 240, x: 100, y: 240 + ZONES.pull + 2 }], VIEW), { down: true });
});

test('dans la partie : on vise en haut au pouce, et un glissement jusqu’à SPÉ ne dépense rien', () => {
  const fire = at('fire');
  /** Un doigt glissé de `from` à `to` en dix pas, puis tenu ; `others` : les doigts posés à côté. */
  const gesture = (game, from, to, others = []) => {
    let p = trackPoint(undefined, from, VIEW);
    run(game, 30, (i) => {
      const k = Math.min(1, i / 10);
      p = trackPoint(p, { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }, VIEW);
      return touchActions([p, ...others], VIEW);
    });
  };
  let game = settle(play(flat()));
  gesture(game, fire, { x: fire.x, y: fire.y - ZONES.aim * VIEW.h - 10 });
  assert.equal(game.hero.aim, -1, 'TIR glissé vers le haut : le héros vise en haut');
  game = settle(play(flat()));
  gesture(game, { x: 100, y: 250 }, { x: 120, y: 200 }, [trackPoint(undefined, fire, VIEW)]);
  assert.equal(game.hero.aim, -1, 'TIR tenu, pouce gauche vers le haut un peu de biais : le héros vise en haut');

  game = settle(play(flat()));
  const charges = game.hero.charges;
  assert.ok(charges > 0, 'le héros d’essai a une spéciale');
  gesture(game, fire, at('special'));
  gesture(game, at('jump'), at('special'));
  assert.equal(game.hero.charges, charges, 'glissé de TIR ou de SAUT jusqu’à SPÉ : aucune charge dépensée');
  run(game, 10, () => touchActions([tap('special')], VIEW));
  assert.equal(game.hero.charges, charges - 1, 'un appui sur SPÉ : une charge');
});

// Le passage de la vidéo de Valentin (Bismillah, la garde à vue à l'étage), en petit : une trouée de deux tuiles entre
// un pilier et le bord d'un étage cinq tuiles plus haut. Un saut n'y suffit pas : il faut grimper au pilier.
const SHAFT = level([
  '....................',
  '....................',
  '...A................',
  '...A................',
  '...A................',
  '...A................',
  '...A..AAAAAAAAAAAAAA',
  '...A................',
  '...A................',
  '...A................',
  '...AD..............S',
  'AAAAAAAAAAAAAAAAAAAA',
]);
/** Joue un geste du pouce gauche (décalage depuis où il s'est posé, pas par pas) ; rend vrai si le héros tient à l'étage. */
function climbs(offset, assist = true) {
  const game = settle(play(SHAFT));
  const memo = {};
  let stick = null;
  for (let i = 0; i < 300; i++) {
    const o = offset(i);
    stick = trackPoint(stick, { x: 130 + o.dx, y: 260 + o.dy }, VIEW);
    let touch = touchActions([stick], VIEW);
    if (assist) touch = climbAssist(touch, game.hero, game.world, memo);
    run(game, 1, touch);
    if (game.hero.onGround && game.hero.y + game.hero.h <= 6 * 16 + 1) return true;
  }
  return false;
}
const ramp = (to) => (i) => ({ dx: (to.dx * Math.min(i, 6)) / 6, dy: (to.dy * Math.min(i, 6)) / 6 });

test('grimper au pouce : manche tenu vers le haut, le héros grimpe au pilier et passe à l’étage', () => {
  assert.equal(climbs(ramp({ dx: 0, dy: -50 }), false), false, 'sans l’aide, un saut ne suffit pas');
  assert.equal(climbs(ramp({ dx: 0, dy: -50 })), true, 'tout droit vers le haut, tenu');
  assert.equal(climbs(ramp({ dx: 10, dy: -50 })), true, 'un peu de biais');
  assert.equal(climbs((i) => (i < 90 ? ramp({ dx: -60, dy: -60 })(i) : { dx: 45, dy: -10 })), true, 'vers le pilier, puis vers l’étage');
});

test('l’aide à la grimpe ne touche qu’au saut tenu en l’air : au sol, ou sans saut, les doigts passent tels quels', () => {
  const world = { solid: () => true };
  const grounded = { x: 0, y: 0, w: 10, h: 14, vy: 0, onGround: true, facing: 1 };
  const touch = { right: true, jump: true };
  assert.equal(climbAssist(touch, grounded, world, {}), touch);
  const air = { ...grounded, onGround: false };
  const walk = { right: true, fire: true };
  assert.equal(climbAssist(walk, air, world, {}), walk);
  assert.deepEqual(climbAssist({}, air, world, {}), {}, 'le clavier et la manette ne passent pas par là');
});
