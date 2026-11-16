// Commandes tactiles : quelles actions pour des doigts donnés ?
// Le multi-toucher réel n'est pas vérifiable sur la machine de développement : la règle est
// donc une fonction pure, testée ici.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchActions, trackPoint, ZONES } from '../src/client/input.js';

const VIEW = { w: 800, h: 360 }; // un téléphone tenu en paysage
const at = (action) => {
  const t = ZONES.targets.find((z) => z.action === action);
  return { x: t.x * VIEW.w, y: t.y * VIEW.h };
};
/** Un doigt posé en (ox, oy) puis glissé de (dx, dy). */
const finger = (ox, oy, dx = 0, dy = 0) => ({ ox, oy, x: ox + dx, y: oy + dy });
const tap = (action) => finger(at(action).x, at(action).y);

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

test('pousser le manche vers le haut fait sauter, en avançant ou non', () => {
  const lift = VIEW.h * ZONES.lift + 2;
  assert.deepEqual(touchActions([finger(100, 300, 0, -lift)], VIEW), { jump: true, up: true });
  assert.deepEqual(touchActions([finger(100, 300, 30, -lift)], VIEW), { right: true, jump: true });
  assert.deepEqual(touchActions([finger(100, 300, 30, -10)], VIEW), { right: true }, 'un petit écart ne suffit pas');
});

test('moitié droite : chaque cible répond, et tout l’écran répond (la plus proche gagne)', () => {
  assert.deepEqual(touchActions([tap('fire')], VIEW), { fire: true });
  assert.deepEqual(touchActions([tap('jump')], VIEW), { jump: true });
  assert.deepEqual(touchActions([tap('special')], VIEW), { special: true });
  assert.deepEqual(touchActions([finger(790, 350)], VIEW), { fire: true }, 'le coin en bas à droite : tir');
  assert.deepEqual(touchActions([finger(790, 10)], VIEW), { special: true }, 'le coin en haut à droite : spéciale');
  assert.deepEqual(touchActions([finger(420, 350)], VIEW), { jump: true }, 'le bas, près du milieu : saut');
  for (let x = 410; x < 800; x += 30) {
    for (let y = 5; y < 360; y += 30) assert.ok(Object.keys(touchActions([finger(x, y)], VIEW)).length >= 1, `(${x}, ${y}) ne fait rien`);
  }
});

test('le pouce à cheval entre TIR et SAUT fait les deux ; jamais avec SPÉ', () => {
  const fire = at('fire');
  const jump = at('jump');
  const middle = finger((fire.x + jump.x) / 2, (fire.y + jump.y) / 2);
  assert.deepEqual(touchActions([middle], VIEW), { fire: true, jump: true });
  const special = at('special');
  const between = finger((fire.x + special.x) / 2, (fire.y + special.y) / 2 - 1);
  assert.equal(Object.keys(touchActions([between], VIEW)).length, 1, 'entre TIR et SPÉ : une seule action');
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
  const lift = -(VIEW.h * ZONES.lift + 2);
  assert.deepEqual(touchActions([finger(100, 300, 0, lift)], VIEW), { jump: true, up: true });
  assert.deepEqual(touchActions([finger(100, 300, 30, lift)], VIEW), { right: true, jump: true }, 'en avançant : un saut, le tir reste devant');
  // Le pouce redescend après un saut : on mesure depuis le point le plus haut atteint.
  assert.deepEqual(touchActions([{ ox: 100, oy: 300, ay: 240, x: 100, y: 240 + ZONES.pull + 2 }], VIEW), { down: true });
});
