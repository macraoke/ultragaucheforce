// Les commandes : chaque appareil lit ses propres touches sur les panneaux ; l'écran Commandes et la pause
// les montrent ; effacer sa progression ne se fait que depuis le menu, après confirmation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withKeys, KEY_NAMES, brief, mentions, padInUse } from '../src/client/input.js';
import { loadContent } from '../tools/content.mjs';
import { askSpecial } from '../src/client/ui.js';

test('le clignotement reconnaît la spéciale sous les mêmes formes que le panneau', () => {
  for (const text of ['[spéciale] : lance-la', '[ spéciale ] : lance-la', '[Speciale]', 'J ou [SPÉCIALE]']) {
    assert.ok(mentions(text, 'speciale'), text);
    assert.equal(withKeys(text, 'clavier').includes('K'), true, text);
  }
  assert.ok(!mentions('[spé] et spéciale', 'speciale'));
  assert.ok(!mentions('', 'speciale'));
});

test('la spéciale clignote au panneau, cesse au premier usage, jamais en pause, huit secondes au plus', () => {
  const game = { hero: { def: { id: 'rousseau', speciale: { nom: 'DÉCONSTRUCTION !' } }, charges: 2 }, sign: '[spéciale] : lance ta spéciale', time: 10 };
  let ask = null;
  const frame = (live = true) => {
    const r = askSpecial(ask, game, live);
    ask = r.ask;
    return r.on;
  };
  assert.equal(frame(false), false, 'en pause devant le panneau : rien ne clignote');
  assert.equal(frame(), true, 'la partie reprend : ça clignote');
  game.hero.charges = 1; // elle s'en sert, toujours devant le panneau
  for (let k = 0; k < 30; k++) {
    game.time += 1 / 60;
    assert.equal(frame(), false, 'après le premier usage, même devant le panneau');
  }
  game.time += 30;
  assert.equal(frame(), false);

  ask = null;
  game.hero.charges = 2;
  game.time = 0;
  assert.equal(frame(), true);
  game.sign = null;
  game.time = 7.9;
  assert.equal(frame(), true, 'le panneau dépassé, elle clignote encore un peu');
  game.time = 8;
  assert.equal(frame(), false, 'huit secondes au plus');
  game.sign = '[ spéciale ] : encore';
  assert.equal(frame(), false, 'une seule demande par partie');
});

test('une manette posée ne prend pas la main : seuls les boutons et axes que le jeu lit comptent', () => {
  const pad = (axes = {}, buttons = []) => ({
    axes: Object.assign(Array(10).fill(0), axes),
    buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i) })),
  });
  assert.equal(padInUse(pad({ 9: 1.2857 })), false, 'le chapeau d’une manette générique, au repos');
  assert.equal(padInUse(pad({ 2: -1, 5: 1 })), false, 'gâchettes analogiques au repos, lues comme axes');
  assert.equal(padInUse(pad({}, [3, 8, 16])), false, 'Y, Select, le bouton central : le jeu ne les lit pas');
  assert.equal(padInUse(pad({ 0: 0.8 })), true, 'le stick');
  assert.equal(padInUse(pad({ 1: -0.7 })), true);
  for (const b of [0, 1, 2, 7, 9, 13]) assert.equal(padInUse(pad({}, [b])), true, `bouton ${b}`);
});

test('panneau : une touche entre crochets devient celle de l’appareil', () => {
  assert.equal(withKeys('[tirer] : lancer des tracts', 'clavier'), 'J ou Entrée : lancer des tracts', 'seule, la commande dit ses deux touches');
  assert.equal(withKeys('[bas] + [tirer] : creuser', 'clavier'), '↓ + J : creuser', 'combinée, la touche courte');
  assert.equal(withKeys('[sauter], [sauter] : grimper', 'clavier'), 'ESPACE, ESPACE : grimper', 'répétée, la touche courte');
  assert.equal(withKeys('[tirer] : lancer des tracts', 'manette'), 'X : lancer des tracts');
  assert.equal(withKeys('[tirer] : lancer des tracts', 'pouce'), 'LANCER : lancer des tracts');
  assert.equal(withKeys('[bas] + [tirer] : creuser', 'pouce'), 'Pouce ↓ + LANCER : creuser');
  assert.equal(withKeys('[Spéciale] ou [speciale]', 'clavier'), 'K ou K', 'majuscule ou accent oublié : même touche');
  assert.equal(withKeys('Va [ailleurs]', 'clavier'), 'Va [ailleurs]', 'un mot inconnu reste tel quel');
  assert.equal(withKeys('J : tracts // TIR : tracts', 'pouce'), 'TIR : tracts', 'l’ancienne forme « clavier // pouce » marche encore');
  assert.equal(withKeys('J : tracts // TIR : tracts', 'manette'), 'J : tracts');
});

test('chaque appareil a toutes ses touches, et une ligne de commandes', () => {
  const actions = Object.keys(KEY_NAMES.clavier);
  for (const device of ['clavier', 'manette', 'pouce']) {
    assert.deepEqual(Object.keys(KEY_NAMES[device]), actions, device);
    assert.equal(brief(device).length, 5, device);
  }
});

test('Millevaches apprend chaque action, avec des touches que chaque appareil connaît', () => {
  const { bundle } = loadContent();
  const signs = Object.values(bundle.niveaux.millevaches.panneaux);
  for (const device of ['clavier', 'manette', 'pouce']) {
    for (const text of signs) assert.doesNotMatch(withKeys(text, device), /\[/, `${device} : ${text}`);
  }
  const all = signs.join(' ');
  for (const word of ['[avancer]', '[sauter]', '[tirer]', 'manif', 'mur', '[bas]', '[haut]', '[spéciale]', 'cage', 'le blindé cède']) {
    assert.ok(all.includes(word), `un panneau parle de « ${word} »`);
  }
});

// ---------------------------------------------------------------------- les écrans, sans navigateur

/** Juste assez de DOM pour construire les écrans et cliquer leurs boutons. */
class Text {
  constructor(text) { this.textContent = String(text); }
}
class Element {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.className = '';
    this.hidden = false;
  }
  append(...nodes) {
    for (const n of nodes) {
      const node = n instanceof Element || n instanceof Text ? n : new Text(n);
      node.parent = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }
  replaceWith(node) {
    node.parent = this.parent;
    this.parent.children[this.parent.children.indexOf(this)] = node;
  }
  get firstChild() { return this.children[0]; }
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
  matches(selectors) {
    return selectors.split(',').some((s) => {
      const [tag, ...classes] = s.trim().split('.');
      return (!tag || this.tagName === tag.toUpperCase()) && classes.every((c) => this.className.split(' ').includes(c));
    });
  }
  querySelectorAll(selectors) { return [...this.nodes()].filter((n) => n.matches(selectors)); }
  querySelector(selectors) { return this.querySelectorAll(selectors)[0] || null; }
}

async function screens({ paused = false, device = 'clavier' } = {}) {
  globalThis.document = { createElement: (tag) => new Element(tag), body: new Element('body'), activeElement: null };
  const { Screens } = await import('../src/client/ui.js');
  const save = { termines: { millevaches: true }, records: { millevaches: 120 }, decouvertes: ['heros:zucman'], vues: {}, heros: 'zucman', options: { son: true, musique: false, sobre: false } };
  const root = new Element('div');
  const went = [];
  const go = new Proxy({ playing: () => paused, device: () => device }, { get: (o, k) => o[k] || (() => went.push(k)) });
  const ui = new Screens(root, { bundle: { heros: {}, citations: {} }, save, audio: { play() {} }, go });
  const buttons = () => root.querySelectorAll('button').map((b) => b.textContent);
  const press = (label) => root.querySelectorAll('button').find((b) => b.textContent === label).click();
  return { ui, root, save, went, buttons, press };
}

test('Options en pleine partie : pas de quoi effacer sa progression', async () => {
  const { ui, buttons } = await screens({ paused: true });
  ui.options();
  assert.ok(!buttons().includes('Effacer ma progression'));
  ui.pause();
  assert.ok(buttons().includes('Commandes'), 'les commandes depuis la pause');
  assert.ok(!buttons().some((b) => /Effacer/.test(b)));
});

test('Options du menu : effacer demande confirmation, et Annuler a la main', async () => {
  const { ui, root, save, buttons, press } = await screens();
  ui.options();
  assert.ok(buttons().includes('Effacer ma progression'));
  press('Effacer ma progression');
  assert.match(root.textContent, /Tu perdras tout ce que tu as débloqué et tes records\. La campagne repartira du premier niveau\./);
  assert.deepEqual(buttons(), ['Annuler', 'Effacer']);
  assert.equal(globalThis.document.activeElement.textContent, 'Annuler', 'Entrée annule');
  press('Annuler');
  assert.deepEqual(save.records, { millevaches: 120 }, 'annuler ne touche à rien');
  assert.deepEqual(save.decouvertes, ['heros:zucman']);
  press('Effacer ma progression');
  press('Effacer');
  assert.deepEqual([save.termines, save.records, save.decouvertes, save.heros], [{}, {}, ['niveaux:get-ready-with-me'], '']); // le tuto reste vu
  assert.deepEqual(save.options, { son: true, musique: false, sobre: false }, 'les options restent');
  assert.match(root.textContent, /Progression effacée/);
});

test('Commandes : le tableau, depuis le menu, sans rien de dangereux à côté', async () => {
  const { ui, root, buttons } = await screens({ device: 'pouce' });
  ui.menu = () => {};
  ui.controls();
  assert.deepEqual(buttons(), ['← Retour']);
  assert.equal(root.querySelector('th.ici').textContent, 'Tactile', 'la colonne de l’appareil en main ressort');
  assert.match(root.textContent, /SAUT/);
});

test('pause : les touches de l’appareil en main, en une ligne', async () => {
  const { ui, root } = await screens({ paused: true, device: 'manette' });
  ui.pause();
  const line = root.querySelector('.touches').textContent;
  assert.match(line, /Croix avancer/);
  assert.match(line, /B spéciale/);
});
