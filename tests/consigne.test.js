// La consigne du tuto : un panneau qui nomme une commande attend le geste, puis montre un ✓ et s'efface.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coach, gesturesOf, guideView, CHECK_TIME } from '../src/client/consigne.js';
import { askedFor } from '../src/client/ui.js';
import { loadContent } from '../tools/content.mjs';
import { TUTORIAL, levelOrder } from '../src/client/collection.js';
import { firstVisit } from '../src/client/save.js';

test('chaque panneau attend les gestes que nomment ses marqueurs', () => {
  assert.deepEqual(gesturesOf('[avancer] : avancer · [sauter] : sauter'), ['avancer', 'sauter']);
  assert.deepEqual(gesturesOf('[tirer] : lancer des tracts'), ['tirer']);
  assert.deepEqual(gesturesOf('[spéciale] : lance ta spéciale'), ['speciale']);
  assert.deepEqual(gesturesOf('Pousse contre le mur : [sauter], [sauter], [sauter]'), ['sauter']);
  assert.deepEqual(gesturesOf('[bas] + [tirer] : creuser · [haut] + [tirer] : lancer en haut'), ['creuser', 'lancer-haut']);
  assert.deepEqual(gesturesOf('[ Spéciale ]'), ['speciale'], 'les mêmes formes que withKeys');
  assert.deepEqual(gesturesOf('Va jusqu’à la paysanne : elle rejoint la manif ✊'), [], 'sans marqueur : rien à attendre');
  assert.deepEqual(gesturesOf('[pause] ou [inconnu]'), []);
  assert.deepEqual(gesturesOf(''), []);
});

test('les panneaux du tuto : chacun enseigne un geste ou une règle, et les gestes de base y sont tous', async () => {
  const { bundle } = await loadContent();
  const signs = Object.values(bundle.niveaux[TUTORIAL].panneaux);
  const taught = new Set(signs.flatMap(gesturesOf));
  for (const g of ['avancer', 'sauter', 'tirer', 'speciale']) assert.ok(taught.has(g), g);
  assert.ok(!bundle.campagne.includes(TUTORIAL), 'le tuto n’est pas une étape de la campagne');
  assert.ok(!levelOrder(bundle).includes(TUTORIAL), 'ni du plan de campagne');
});

test('le tuto vient au tout premier « Jouer », jamais après qu’un niveau a été commencé', () => {
  assert.equal(firstVisit({ decouvertes: [] }), true);
  assert.equal(firstVisit({ decouvertes: ['heros:melenchon', 'citations:x'] }), true);
  assert.equal(firstVisit({ decouvertes: ['niveaux:millevaches'] }), false, 'un joueur qui a déjà joué n’y est pas renvoyé');
  assert.equal(firstVisit({ decouvertes: [`niveaux:${TUTORIAL}`] }), false, 'lancé une fois, ou passé : la suite est la campagne');
});

/** Joue la consigne pas à pas : `sign` le panneau lu, `actions` ce qui est enfoncé, 1/60 s par pas. */
function player() {
  let state = null;
  let time = 0;
  return {
    step(sign = null, actions = {}, n = 1) {
      for (let i = 0; i < n; i++) {
        time += 1 / 60;
        state = coach(state, { sign, actions, time });
      }
      return guideView(state);
    },
  };
}

test('la consigne reste tant que le geste manque, même loin du panneau, puis ✓ et s’efface', () => {
  const p = player();
  const sign = '[tirer] : lancer des tracts';
  let view = p.step(sign);
  assert.deepEqual(view, { text: sign, done: false, hints: ['fire'] });
  view = p.step(null, { right: true }, 600); // dix secondes plus loin, sans lancer
  assert.equal(view?.text, sign, 'toujours là, sans limite de temps');
  assert.equal(view.done, false);
  view = p.step(null, { fire: true });
  assert.equal(view.done, true, 'le geste fait : ✓');
  assert.deepEqual(view.hints, [], 'plus rien ne clignote');
  view = p.step(null, {}, Math.ceil(CHECK_TIME * 60) + 1);
  assert.equal(view, null, 'le ✓ tombe');
  assert.equal(p.step(sign, {}), null, 'un panneau déjà fait n’attend plus');
});

test('un panneau à deux gestes les attend tous les deux, et allume le prochain', () => {
  const p = player();
  const sign = '[bas] + [tirer] : creuser · [haut] + [tirer] : lancer en haut';
  assert.deepEqual(p.step(sign).hints, ['bas', 'fire']);
  assert.deepEqual(p.step(sign, { fire: true }).hints, ['bas', 'fire'], 'lancer seul ne creuse pas');
  assert.deepEqual(p.step(sign, { down: true, fire: true }).hints, ['haut', 'fire']);
  const view = p.step(null, { up: true, fire: true });
  assert.equal(view.done, true);
});

test('un autre panneau lu remplace la consigne ; un panneau sans marqueur l’efface', () => {
  const p = player();
  p.step('[spéciale] : lance ta spéciale');
  assert.equal(p.step('[avancer] : avancer · [sauter] : sauter').text, '[avancer] : avancer · [sauter] : sauter');
  assert.equal(p.step('Un tonneau saute, ses voisins aussi'), null, 'rien ne reste figé');
  assert.equal(p.step(null, {}, 120), null);
});

test('un geste déjà tenu à l’arrivée compte : le joueur n’est jamais retenu', () => {
  const p = player();
  const view = p.step('[avancer] : avancer · [sauter] : sauter', { right: true });
  assert.deepEqual(view.hints, ['jump']);
});

test('le clignotement réunit la spéciale demandée et le geste de la consigne', () => {
  assert.deepEqual([...askedFor(false, null)], []);
  assert.deepEqual([...askedFor(true, null)], ['special']);
  assert.deepEqual([...askedFor(false, { hints: ['bas', 'fire'] })].sort(), ['bas', 'fire']);
  assert.deepEqual([...askedFor(true, { hints: ['special'] })], ['special']);
});
