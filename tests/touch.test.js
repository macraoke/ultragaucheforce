// Commandes tactiles : quels boutons sont enfoncés pour des doigts donnés ?
// Le multi-toucher réel n'est pas vérifiable sur la machine de développement : la règle est
// donc une fonction pure, testée ici.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchedActions } from '../src/client/input.js';

// Deux boutons à gauche, deux à droite, comme à l'écran.
const button = (action, left, top, size = 60) => ({ action, left, top, right: left + size, bottom: top + size });
const BUTTONS = [button('left', 20, 300), button('right', 100, 300), button('fire', 600, 300), button('jump', 690, 300)];

test('un doigt sur un bouton l’enfonce', () => {
  assert.deepEqual(touchedActions([{ x: 50, y: 330 }], BUTTONS), { left: true });
});

test('le pouce qui glisse de ◀ à ▶ change de direction sans se lever', () => {
  const slide = [50, 70, 85, 95, 110, 130].map((x) => touchedActions([{ x, y: 330 }], BUTTONS));
  assert.deepEqual(slide[0], { left: true });
  assert.deepEqual(slide.at(-1), { right: true });
  assert.ok(slide.every((pressed) => Object.keys(pressed).length === 1), 'jamais de trou ni de double appui pendant la glissade');
});

test('deux doigts, deux boutons : avancer et tirer en même temps', () => {
  assert.deepEqual(touchedActions([{ x: 130, y: 330 }, { x: 630, y: 330 }], BUTTONS), { right: true, fire: true });
});

test('trois doigts : avancer, tirer et sauter', () => {
  const pressed = touchedActions([{ x: 50, y: 330 }, { x: 630, y: 330 }, { x: 720, y: 330 }], BUTTONS);
  assert.deepEqual(pressed, { left: true, fire: true, jump: true });
});

test('un doigt loin de tout bouton ne fait rien', () => {
  assert.deepEqual(touchedActions([{ x: 400, y: 100 }], BUTTONS), {});
  assert.deepEqual(touchedActions([], BUTTONS), {});
});

test('un doigt juste à côté d’un bouton compte quand même (marge de tolérance)', () => {
  assert.deepEqual(touchedActions([{ x: 10, y: 295 }], BUTTONS), { left: true });
  assert.deepEqual(touchedActions([{ x: 10, y: 295 }], BUTTONS, 0), {}, 'sans marge, il est dehors');
});

test('entre deux boutons, le plus proche gagne', () => {
  // ◀ finit à 80, ▶ commence à 100 : les marges se recouvrent entre les deux.
  assert.deepEqual(touchedActions([{ x: 86, y: 330 }], BUTTONS), { left: true });
  assert.deepEqual(touchedActions([{ x: 94, y: 330 }], BUTTONS), { right: true });
});
