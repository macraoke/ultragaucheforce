// Les notes de déblocage passent une à une, au temps de jeu : figées pendant une pause,
// et au pouce elles attendent qu'un panneau d'aide (au même endroit, en haut) soit passé.
// Un faux document suffit : on vérifie ce que `Hud.pump` met à l'écran, pas son allure.

import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.parent = null;
    this.text = '';
    const names = new Set();
    this.classList = {
      toggle: (name, on) => (on ? names.add(name) : names.delete(name)),
      contains: (name) => names.has(name),
      add: (name) => names.add(name),
      remove: (name) => names.delete(name),
    };
  }

  append(...nodes) {
    for (const n of nodes) {
      if (typeof n === 'string') this.text += n;
      else {
        n.parent = this;
        this.children.push(n);
      }
    }
  }

  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = null;
  }

  replaceChildren() {
    this.children = [];
  }
}

const nodes = { toasts: new FakeNode('div'), hud: new FakeNode('div') };
const body = new FakeNode('body');
globalThis.document = {
  body,
  getElementById: (id) => nodes[id],
  createElement: (tag) => new FakeNode(tag),
};

const { Hud, readTime } = await import('../src/client/ui.js');
const { SIGN_LINGER } = await import('../src/client/render.js');

const shown = () => nodes.toasts.children.map((n) => n.text);
const waiting = () => nodes.toasts.classList.contains('attend');
function hud(thumbs) {
  body.classList.toggle('tactile', thumbs);
  nodes.toasts.replaceChildren();
  nodes.toasts.classList.toggle('attend', false);
  return new Hud({ citations: {} });
}

test('une note reste le temps d’être lue, en temps de jeu : une pause la fige', () => {
  const h = hud(false);
  h.toast('Débloqué : BAC', '', 'cartes');
  h.toast('Pancarte commune débloquée : « ON EST LÀ »', 'rarete-0', 'pancartes');
  h.pump(10);
  assert.deepEqual(shown(), ['Débloqué : BAC'], 'une note à la fois');
  for (let k = 0; k < 600; k++) h.pump(10); // en pause, le temps de jeu ne bouge pas
  assert.deepEqual(shown(), ['Débloqué : BAC'], 'figée pendant la pause');
  h.pump(10 + readTime('Débloqué : BAC') - 0.01);
  assert.deepEqual(shown(), ['Débloqué : BAC']);
  h.pump(10 + readTime('Débloqué : BAC'));
  assert.deepEqual(shown(), ['Pancarte commune débloquée : « ON EST LÀ »'], 'puis la suivante');
});

test('au pouce, une note attend qu’un panneau d’aide soit passé, et son temps de lecture ne court pas', () => {
  const h = hud(true);
  h.toast('Débloqué : BAC', '', 'cartes');
  h.pump(0);
  assert.deepEqual(shown(), ['Débloqué : BAC']);
  // Un panneau s'affiche une seconde et demie après : la note s'efface tant qu'il est là, et un peu après.
  h.pump(1.5);
  h.pump(1.5, true);
  assert.ok(waiting(), 'cachée sous le panneau');
  h.pump(4, true);
  h.pump(4 + SIGN_LINGER - 0.01);
  assert.ok(waiting(), 'le panneau s’efface encore');
  h.pump(4 + SIGN_LINGER);
  assert.ok(!waiting(), 'le panneau passé, elle revient');
  // Elle avait été vue 1,5 s : il lui reste le reste de son temps de lecture.
  const left = readTime('Débloqué : BAC') - 1.5;
  h.pump(4 + SIGN_LINGER + left - 0.05);
  assert.deepEqual(shown(), ['Débloqué : BAC']);
  h.pump(4 + SIGN_LINGER + left + 0.05);
  assert.deepEqual(shown(), []);
});

test('au clavier, un panneau d’aide ne retient pas les notes (elles ne sont pas au même endroit)', () => {
  const h = hud(false);
  h.toast('Débloqué : BAC', '', 'cartes');
  h.pump(0, true);
  assert.ok(!waiting());
  assert.deepEqual(shown(), ['Débloqué : BAC']);
});
