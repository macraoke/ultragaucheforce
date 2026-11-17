// La musique part d'elle-même : activée d'office à la première visite, sans question au menu.
// Valentin, 17 novembre 2026 : « j'aimerais bien que ce soit auto play by default ». La question « Radio Manif ? »
// du premier lancement (16 novembre 2026) n'est plus posée ; qui l'avait coupée la garde coupée.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { upgrade, VERSION } from '../src/client/save.js';
import { loadContent } from '../tools/content.mjs';

const { bundle } = loadContent();
const v1 = JSON.parse(readFileSync(new URL('./fixtures/sauvegardes/v1.json', import.meta.url), 'utf8'));
const v2 = JSON.parse(readFileSync(new URL('./fixtures/sauvegardes/v2.json', import.meta.url), 'utf8'));

test('première visite : la musique est activée d’office', () => {
  const save = upgrade(null);
  assert.equal(save.version, VERSION);
  assert.equal(save.options.musique, true);
});

test('une sauvegarde qui n’avait jamais choisi : la musique part ; coupée par le joueur, elle le reste', () => {
  for (const old of [v1, v2]) {
    const never = upgrade({ ...structuredClone(old), options: { ...old.options, musique: false, musiqueChoisie: false } });
    assert.equal(never.options.musique, true, `v${old.version ?? 1} jamais choisi`);
  }
  const no = upgrade({ ...structuredClone(v2), options: { ...v2.options, musique: false, musiqueChoisie: true } });
  assert.equal(no.options.musique, false, '« Non », ou coupée dans les options : gardé');
  const on = upgrade({ ...structuredClone(v1), options: { ...v1.options, musique: true } });
  assert.equal(on.options.musique, true);
  const broken = upgrade({ ...structuredClone(v2), options: 'abîmé' });
  assert.equal(broken.options.musique, true, 'des options abîmées repartent des options de départ');
});

// ---------------------------------------------------------------------- le menu, sans navigateur

class Text {
  constructor(text) { this.textContent = String(text); }
}

/** Juste assez de DOM pour construire le menu et cliquer ses boutons. */
class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.hidden = false;
    this.attributes = {};
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  append(...nodes) {
    for (const n of nodes) this.children.push(n instanceof Element || n instanceof Text ? n : new Text(n));
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  focus() { globalThis.document.activeElement = this; }
  click() { this.onclick?.(); }
  * nodes() {
    for (const c of this.children) {
      if (!(c instanceof Element)) continue;
      yield c;
      yield* c.nodes();
    }
  }
  querySelectorAll(selector) {
    const [tag, cls] = selector.split('.');
    return [...this.nodes()].filter((n) => (!tag || n.tagName === tag.toUpperCase()) && (!cls || n.className.split(' ').includes(cls)));
  }
  querySelector(selectors) {
    for (const s of selectors.split(',')) {
      const found = this.querySelectorAll(s.trim())[0];
      if (found) return found;
    }
    return null;
  }
}

async function menu(options) {
  globalThis.document = { createElement: (tag) => new Element(tag), body: new Element('body'), activeElement: null };
  const { Screens } = await import('../src/client/ui.js');
  const save = upgrade(null);
  Object.assign(save.options, options);
  const root = new Element('div');
  const go = new Proxy({ playing: () => false, device: () => 'clavier', }, { get: (o, k) => o[k] || (() => {}) });
  const ui = new Screens(root, { bundle: { ...bundle, heros: {} }, save, audio: { play() {} }, go });
  ui.menu();
  const buttons = () => root.querySelectorAll('button').map((b) => b.textContent);
  const press = (label) => root.querySelectorAll('button').find((b) => b.textContent === label).click();
  return { ui, root, buttons, press };
}

test('le menu ne pose plus « Radio Manif ? » ; le focus est sur « Jouer »', async () => {
  for (const options of [{}, { musique: false, musiqueChoisie: false }, { musique: false, musiqueChoisie: true }]) {
    const m = await menu(options);
    assert.doesNotMatch(m.root.textContent, /Radio Manif \?/, JSON.stringify(options));
    assert.equal(m.root.querySelectorAll('div.question-radio').length, 0);
    assert.equal(globalThis.document.activeElement.textContent, 'Jouer');
  }
});
