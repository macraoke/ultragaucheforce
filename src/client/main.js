// Démarrage du jeu dans le navigateur : charge le contenu, branche les entrées, fait tourner
// la simulation à pas fixe (60 pas par seconde) et passe d'un écran à l'autre.

import { Game, DT } from '../sim/game.js';
import { botActions } from '../sim/bot.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { Radio } from './music.js';
import { Screens, Hud } from './ui.js';
import { showHeroCard } from './herocard.js';
import { showTaxScene } from './tax.js';
import { showAtelier } from './atelier.js';
import { loadSave, storeSave, discover } from './save.js';
import { cardName, citationOfWord, rarityName } from './collection.js';
import { registerServiceWorker } from './sw-register.js';

const bundle = await (await fetch('content.json')).json();
const save = loadSave();
const screenRoot = document.getElementById('ecran');
const audio = new Audio(bundle);
const radio = new Radio(bundle, document.getElementById('radio'));
const renderer = new Renderer(document.getElementById('monde'), document.getElementById('textes'), bundle);
const input = new Input(document.getElementById('tactile'));
const hud = new Hud(bundle);

/** @type {Game | null} */
let game = null;
let mode = 'menu'; // menu (démo en fond) | playing | paused | card | over
let current = null; // { id, level } du niveau en cours
let custom = null; // niveau de l'Atelier en cours de test
let begin = null; // le carton d'ouverture attend : fonction qui lance vraiment le niveau
let bot = {};
let written = []; // banderoles et tags du niveau que le héros n'a pas encore lus
let won = []; // clés des cartes gagnées depuis le début du niveau : la rangée de l'écran de fin
let acc = 0;
let last = performance.now();

radio.onAsk = () => {
  save.options.musique = true;
  storeSave(save);
  applyOptions();
};

function applyOptions() {
  audio.enabled = save.options.son;
  renderer.reduced = save.options.sobre;
  document.body.classList.toggle('sobre', save.options.sobre); // la feuille de style coupe ses animations
  radio.setEnabled(save.options.musique);
  if (save.options.musique) radio.play(mode === 'playing' && current ? current.level.musique || current.id : 'menu');
}

const screens = new Screens(screenRoot, {
  bundle, save, audio,
  go: {
    play: (id) => start(id),
    resume: () => setMode('playing'),
    restart: () => (custom ? start(null, custom) : start(current.id)),
    checkpoint: () => {
      game.respawn();
      renderer.snap(game);
      setMode('playing');
    },
    quit: () => toMenu(),
    atelier: () => openAtelier(),
    options: () => applyOptions(),
    learn: (ids) => ids.forEach((id) => collect('fiches', id, true)),
    back: () => (mode === 'paused' ? screens.pause() : screens.menu()),
    playing: () => mode === 'paused',
  },
});

function setMode(next) {
  mode = next;
  if (next === 'playing') screens.close();
  hud.setVisible(next === 'playing' || next === 'paused' || next === 'card');
  document.body.classList.toggle('en-jeu', next === 'playing');
  radio.setVisible(next !== 'playing' && next !== 'card');
  renderer.demo = next === 'menu';
  input.release();
  input.active = next === 'playing';
  acc = 0;
}

/** Fond du menu : une vraie partie, jouée par le robot de test. */
function attract() {
  const id = bundle.campagne[0];
  if (!id) return (game = null);
  game = new Game(bundle, id, { seed: Math.floor(Math.random() * 1e9), invincible: true });
  bot = {};
  renderer.snap(game);
}

function toMenu() {
  begin = null;
  custom = null;
  current = null;
  setMode('menu');
  attract();
  screens.menu();
  radio.play('menu');
}

/**
 * Une rencontre : la carte entre dans la Collection, avec la citation et le fait qui l'expliquent.
 * La première fois, on l'annonce (sauf `quiet`).
 */
function collect(kind, id, quiet = false) {
  const lines = kind === 'pancartes' || kind === 'manchettes'; // sans fiche : identifiées par leur texte
  const item = lines ? bundle[kind].find((p) => p.texte === id) : bundle[kind]?.[id];
  if (!item || !discover(save, kind, id)) return;
  won.push(`${kind}:${id}`);
  if (kind === 'pancartes') hud.toast(`Pancarte ${rarityName(item)} : « ${item.texte} »`, `rarete-${item.rarete}`);
  else if (!quiet) hud.toast(`Nouvelle carte : ${cardName(item)}`);
  collect('citations', item.citation, true);
  for (const fiche of [item.fiche].flat()) collect('fiches', fiche, true);
  for (const slogan of item.slogan || []) collect('pancartes', slogan, true); // une recrue arrive avec ses slogans
}

/** Ce que porte le cortège entre dans la Collection : de vraies pancartes, les drapeaux des luttes. */
function collectCortege() {
  for (const m of game.cortege) {
    if (m.kind === 'pancarte') collect('pancartes', m.label, true);
    else if (m.kind === 'drapeau') collect('drapeaux', m.label, true);
  }
}

/** Passer devant une banderole ou un tag, c'est l'avoir lu. */
function readSigns() {
  const { hero } = game;
  written = written.filter((d) => {
    if (Math.abs(d.x - hero.x) > 96 || Math.abs(d.y - hero.y) > 96) return true;
    collect('pancartes', renderer.written(d), true);
    return false;
  });
}

/** Les pancartes déjà dans la Collection : une pancarte ramassée en donne d'abord une autre. */
const ownedSigns = () => save.decouvertes.filter((key) => key.startsWith('pancartes:')).map((key) => key.slice('pancartes:'.length));

function start(id, level = null) {
  custom = level;
  const again = current?.id === (id ?? 'atelier'); // « Recommencer » : les cartes déjà gagnées dans ce niveau restent
  current = { id: id ?? 'atelier', level: level ?? bundle.niveaux[id] };
  // Dans l'Atelier, on essaie le niveau avec le héros que dit sa fiche, pas celui de la sauvegarde.
  game = new Game(bundle, id, { seed: Math.floor(Math.random() * 1e9), level, hero: level ? '' : save.heros, owned: ownedSigns() });
  renderer.snap(game);
  hud.reset();
  if (!begin && !again) won = []; // un changement de héros sur le carton d'ouverture garde les cartes déjà gagnées
  if (id) collect('niveaux', id, true);
  collect('citations', current.level.citation, true);
  collect('heros', game.hero.def.id, true);
  collectCortege();
  written = game.decors.filter((d) => bundle.decors[d.id]?.ecrit);
  setMode('paused');
  begin = () => {
    begin = null;
    setMode('playing');
    radio.play(current.level.musique || current.id);
  };
  screens.intro(current.level, () => begin?.(), game.hero.def.id);
}

function openAtelier() {
  setMode('menu');
  document.body.dataset.ecran = 'atelier';
  showAtelier(screenRoot, { bundle, save, test: (level) => start(null, level), back: () => toMenu() });
}

function togglePause() {
  if (mode === 'playing') {
    setMode('paused');
    screens.pause();
  } else if (begin) begin();
  else if (mode === 'paused' && screens.open) setMode('playing');
}

async function win() {
  setMode('over');
  audio.play('victoire');
  const { level, id } = current;
  const boss = bundle.boss[level.boss];
  if (boss?.fortune.montant) {
    const learned = await showTaxScene(screenRoot, bundle, boss, { audio, hero: game.hero.def });
    learned.forEach((f) => collect('fiches', f, true));
    collect('boss', boss.id, true);
  }
  for (const fiche of [level.fiche].flat()) collect('fiches', fiche, true);
  const index = bundle.campagne.indexOf(id);
  if (index >= 0) {
    save.termines[id] = true;
    storeSave(save);
  }
  screens.end({
    level, stats: game.stats, time: game.time, crowd: game.crowd, won,
    next: index >= 0 ? bundle.campagne[index + 1] : null,
    last: index === bundle.campagne.length - 1,
  });
  won = []; // rejouer ce niveau repart d'une rangée vide
}

/** Réagit aux événements émis par la simulation pendant un pas. */
function handle(events) {
  renderer.absorb(events);
  for (const e of events) {
    if (e.type === 'sfx') audio.play(e.id);
    else if (e.type === 'headline') {
      hud.banner(e.text, e.credit);
      collect('manchettes', e.text, true);
      audio.play('papier', { volume: 0.6 });
    } else if (e.type === 'panic') audio.play(e.level >= 2 ? 'casseroles' : 'sifflet');
    else if (e.type === 'boss' && e.state === 'enter') {
      audio.speak(game.boss.def.id);
      radio.play('boss');
    }
    else if (e.type === 'card') collect('fiches', e.id);
    else if (e.type === 'discover') {
      // Un mot crié, par eux ou par nous : la vraie citation dont il vient entre dans la Collection.
      if (e.kind === 'mot') collect('citations', citationOfWord(bundle, e.id)?.id, true);
      else collect({ ennemi: 'ennemis', recrue: 'recrues' }[e.kind] || e.kind, e.id);
    } else if (e.type === 'recruit') collectCortege();
    else if (e.type === 'sign') collect('pancartes', e.text);
    else if (e.type === 'heroCard') {
      const hero = bundle.heros[e.hero];
      collect('heros', hero.id, true);
      collectCortege(); // les soutiens venus avec le camarade libéré
      setMode('card');
      showHeroCard(bundle, hero, { audio, reduced: save.options.sobre }).then(() => {
        if (mode !== 'card') return;
        setMode('playing');
        if (game.level.cortege) audio.play('slogan'); // le cortège salue le camarade libéré
      });
    } else if (e.type === 'won') win();
    else if (e.type === 'lost') {
      setMode('over');
      screens.lost();
    }
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (mode !== 'playing') input.pollMenu();
  if (!game) return;
  const demo = mode === 'menu';
  if (mode === 'playing' || demo) {
    acc += dt;
    let steps = 0;
    while (acc >= DT && steps < 6 && (mode === 'playing' || mode === 'menu')) {
      acc -= DT;
      steps++;
      game.step(demo ? botActions(game, bot) : input.actions());
      const events = game.events.splice(0);
      if (demo) renderer.absorb(events);
      else handle(events);
    }
    if (steps === 6) acc = 0; // onglet ralenti : on ne rattrape pas le retard
    if (!demo && written.length) readSigns();
    renderer.tick(dt);
    if (demo && game.status !== 'playing') attract();
  }
  renderer.draw(game, dt);
  if (!demo) hud.update(game);
}

// ---------------------------------------------------------------- branchements

hud.onQuote = (id) => mode === 'playing' && collect('citations', id, true);
input.onPause = togglePause;
input.onAny = () => audio.unlock();
document.getElementById('pause').onclick = togglePause;
addEventListener('pointerdown', () => audio.unlock(), true);
const PHONE = 950; // plus grand côté d'un téléphone, en pixels : au-delà (tablette, ordinateur tactile), on ne pivote pas

function layout() {
  const root = document.documentElement;
  const thumbs = document.body.classList.contains('tactile');
  // Au pouce, sur téléphone, le jeu se joue en paysage : tenu debout, tout pivote d'un quart de tour.
  // Pas en pleine saisie : le clavier virtuel rétrécit la fenêtre et ferait basculer l'écran.
  const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName);
  if (!typing) root.classList.toggle('pivote', thumbs && innerHeight > innerWidth && innerHeight < PHONE);
  // La hauteur visible de l'écran de jeu : les styles s'en servent à la place de `vh`, qui ignore le pivot.
  const height = root.classList.contains('pivote') ? innerWidth : innerHeight;
  root.style.setProperty('--vh', `${height / 100}px`);
  root.classList.toggle('bas', height <= 480);
  renderer.resize();
  renderer.anchor = thumbs ? 0.76 : 0.8; // les pouces occupent les coins du bas : on remonte un peu l'action
  input.refreshTouch();
}
addEventListener('resize', layout);
document.addEventListener('visibilitychange', () => {
  last = performance.now();
  acc = 0;
  if (document.hidden && mode === 'playing' && !window.__ugf) togglePause(); // pas en débogage : on pilote onglet caché
});
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('tactile');
addEventListener('touchstart', () => {
  document.body.classList.add('tactile');
  layout();
}, { once: true, passive: true });
// Au premier toucher, on demande le plein écran, puis le paysage : là où le navigateur le permet.
addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'touch' || document.fullscreenElement) return;
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })
    ?.then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {}); // refusé (iPhone, réglage du navigateur) : le pivot de la page fait le travail
}, { once: true });

// Crochet de débogage (`?debug`) : piloter et inspecter la partie sans jouer en temps réel.
if (new URLSearchParams(location.search).has('debug')) {
  window.__ugf = {
    get game() { return game; },
    get mode() { return mode; },
    bundle, start, toMenu, setMode, screens, input, radio, audio,
    /** Redessine tout de suite (utile quand l'onglet est en arrière-plan). */
    draw(snap = false) {
      if (snap) renderer.snap(game);
      renderer.tick(1 / 60);
      renderer.draw(game, 1 / 60);
      hud.update(game);
    },
    /** Avance de n pas avec des actions fixes, ou avec le robot si `actions` vaut 'bot'. */
    step(n = 1, actions = {}) {
      for (let i = 0; i < n && game.status === 'playing'; i++) {
        game.step(actions === 'bot' ? botActions(game, bot) : actions);
        handle(game.events.splice(0));
      }
      return { x: Math.round(game.hero.x), y: Math.round(game.hero.y), status: game.status, lives: game.lives, panic: Math.round(game.panic) };
    },
  };
}

layout();
applyOptions();
registerServiceWorker((apply) => {
  screens.update = apply; // une nouvelle version attend : le menu la propose, jamais en pleine partie
  if (mode === 'menu' && screens.open) screens.menu();
});
toMenu();
requestAnimationFrame(frame);
