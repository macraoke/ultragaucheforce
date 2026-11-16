// « Radio Manif ? » au premier lancement : rien de SoundCloud avant la réponse, la réponse est retenue,
// et une sauvegarde d'avant la question n'est pas perdue.
// Décision de Valentin, 16 novembre 2026 : « Une question au premier lancement ».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { upgrade, asksMusic, VERSION } from '../src/client/save.js';
import { loadContent } from '../tools/content.mjs';

const { bundle } = loadContent();
const v1 = JSON.parse(readFileSync(new URL('./fixtures/sauvegardes/v1.json', import.meta.url), 'utf8'));

test('première visite : la question est posée, la musique est coupée', () => {
  const save = upgrade(null);
  assert.equal(save.version, VERSION);
  assert.deepEqual(save.options, { son: true, musique: false, sobre: false, musiqueChoisie: false });
  assert.ok(asksMusic(save));
});

test('une sauvegarde d’avant la question : musique déjà activée, rien à demander ; sinon, la question une fois', () => {
  const on = upgrade({ ...structuredClone(v1), options: { ...v1.options, musique: true } });
  assert.equal(on.options.musiqueChoisie, true);
  assert.equal(asksMusic(on), false);
  const off = upgrade(structuredClone(v1));
  assert.equal(off.options.musique, false);
  assert.equal(off.options.musiqueChoisie, false, 'jamais invité : on lui pose la question');
  assert.ok(asksMusic(off));
  const broken = upgrade({ ...structuredClone(v1), options: 'abîmé' });
  assert.equal(broken.options.musiqueChoisie, false, 'des options abîmées ne bloquent pas le passage');
});

test('« Non » est retenu, distinct de « jamais demandé »', () => {
  const save = upgrade(null);
  Object.assign(save.options, { musique: false, musiqueChoisie: true });
  const again = upgrade(JSON.parse(JSON.stringify(save)));
  assert.equal(again.options.musique, false);
  assert.equal(asksMusic(again), false);
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
  }
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
  const answers = [];
  const go = new Proxy({ playing: () => false, device: () => 'clavier', music: (yes) => answers.push(yes) }, { get: (o, k) => o[k] || (() => {}) });
  const ui = new Screens(root, { bundle: { ...bundle, heros: {} }, save, audio: { play() {} }, go });
  ui.menu();
  const buttons = () => root.querySelectorAll('button').map((b) => b.textContent);
  const press = (label) => root.querySelectorAll('button').find((b) => b.textContent === label).click();
  return { ui, root, buttons, press, answers };
}

test('le menu demande « Radio Manif ? », le focus sur « Oui » ; Oui et Non répondent', async () => {
  const m = await menu({});
  assert.match(m.root.textContent, /Radio Manif \?/);
  assert.match(m.root.textContent, /Musique par SoundCloud/);
  assert.ok(m.buttons().includes('▶ Oui') && m.buttons().includes('Non'));
  assert.equal(globalThis.document.activeElement.textContent, '▶ Oui', 'Entrée, ou A, répond oui');
  m.press('▶ Oui');
  m.press('Non');
  assert.deepEqual(m.answers, [true, false]);
});

test('Échap : non pour cette fois, sans rien retenir', async () => {
  const m = await menu({});
  m.ui.escape();
  assert.doesNotMatch(m.root.textContent, /Radio Manif \?/);
  assert.deepEqual(m.answers, [], 'aucun choix enregistré');
  assert.equal(globalThis.document.activeElement.textContent, 'Jouer');
});

test('une réponse donnée, ou la musique déjà activée : plus de question', async () => {
  for (const options of [{ musiqueChoisie: true }, { musique: true }]) {
    const m = await menu(options);
    assert.doesNotMatch(m.root.textContent, /Radio Manif \?/, JSON.stringify(options));
    assert.equal(globalThis.document.activeElement.textContent, 'Jouer');
  }
});
