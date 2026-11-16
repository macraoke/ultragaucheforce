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
import { shareImage, openShare } from './share.js';
import { measure } from './mesure.js';
import { showAtelier } from './atelier.js';
import { loadSave, storeSave, discover, isFound } from './save.js';
import { cardName, citationOfWord, levelOrder, rarityName } from './collection.js';
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
let won = []; // clés de ce qui a été débloqué depuis le début du niveau : la rangée de l'écran de fin
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
    device: () => input.device,
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
  const id = levelOrder(bundle)[0];
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

/** Une note à l'écran reste courte : le texte entier est dans la Collection. */
const short = (text, max = 44) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

/**
 * Une rencontre : la carte entre dans la Collection, avec la citation et le fait qui l'expliquent.
 * La première fois, on l'annonce (sauf `quiet`).
 */
function collect(kind, id, quiet = false) {
  const lines = kind === 'pancartes' || kind === 'manchettes'; // sans fiche : identifiées par leur texte
  const item = lines ? bundle[kind].find((p) => p.texte === id) : bundle[kind]?.[id];
  if (!item || !discover(save, kind, item.id)) return;
  won.push(`${kind}:${item.id}`);
  if (kind === 'pancartes') hud.toast(`Pancarte ${rarityName(item)} débloquée : « ${short(item.texte)} »`, `rarete-${item.rarete}`);
  else if (!quiet) hud.toast(`Débloqué : ${cardName(item)}`);
  collect('citations', item.citation, true);
  for (const fiche of [item.fiche].flat()) collect('fiches', fiche, true);
}

/** Les drapeaux des luttes que porte le cortège se débloquent en les voyant. (Les pancartes, elles, se tirent au hasard.) */
function collectCortege() {
  for (const m of game.cortege) if (m.kind === 'drapeau') collect('drapeaux', m.label, true);
}

/**
 * Le personnage de départ : celui que le joueur a choisi ; sinon un de ceux qu'il a débloqués, au hasard ;
 * et la toute première fois, n'importe lequel, au hasard.
 */
function startingHero() {
  const playable = Object.values(bundle.heros).filter((x) => x.statut === 'jouable').map((x) => x.id);
  const mine = playable.filter((x) => isFound(save, 'heros', x));
  if (mine.includes(save.heros)) return save.heros;
  const pool = mine.length ? mine : playable;
  return pool[Math.floor(Math.random() * pool.length)] ?? '';
}

function start(id, level = null) {
  custom = level;
  const again = current?.id === (id ?? 'atelier'); // « Recommencer » : ce qui a déjà été débloqué dans ce niveau reste
  current = { id: id ?? 'atelier', level: level ?? bundle.niveaux[id] };
  // Dans l'Atelier, on essaie le niveau avec le héros que dit sa fiche, pas celui de la sauvegarde.
  game = new Game(bundle, id, { seed: Math.floor(Math.random() * 1e9), level, hero: level ? '' : startingHero() });
  renderer.snap(game);
  hud.reset();
  if (!begin && !again) won = []; // un changement de héros sur le carton d'ouverture garde ce qui a déjà été débloqué
  if (id) collect('niveaux', id, true);
  collect('citations', current.level.citation, true);
  collect('heros', game.hero.def.id, true);
  collectCortege();
  setMode('paused');
  begin = () => {
    begin = null;
    if (id) measure('niveau lancé', { niveau: id }); // chaque vraie partie, rejouée ou non ; pas un changement de héros sur le carton
    setMode('playing');
    radio.play(current.level.musique || current.id);
  };
  screens.intro(current.level, () => begin?.(), game.hero.def.id, !level);
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
  begin = null;
  setMode('over');
  audio.play('victoire');
  const { level, id } = current;
  const boss = game.boss?.def; // celui qu'on vient d'affronter : il est tiré au hasard
  let said = null; // ce que l'écran de taxe a dit des 2 % : l'image à partager le reprend
  if (boss?.fortune.montant) {
    const tax = await showTaxScene(screenRoot, bundle, boss, { audio, hero: game.hero.def });
    tax.learned.forEach((f) => collect('fiches', f, true));
    collect('boss', boss.id, true);
    said = tax.said;
  }
  for (const fiche of [level.fiche].flat()) collect('fiches', fiche, true);
  const order = levelOrder(bundle);
  const index = order.indexOf(id);
  // Le score d'un niveau, c'est la taille de la manif à l'arrivée ; on garde le record.
  const best = save.records[id] || 0;
  if (!custom && game.crowd > best) save.records[id] = game.crowd;
  if (index >= 0) save.termines[id] = true;
  storeSave(save);
  // La pancarte de l'image : la plus rare de celles qui sont arrivées dans la manif pendant cette partie.
  const sign = game.signs.map((t) => bundle.pancartes.find((p) => p.texte === t)).filter(Boolean)
    .reduce((top, p) => (!top || p.rarete >= top.rarete ? p : top), null);
  const crowd = game.crowd;
  if (!custom) measure('niveau terminé', { niveau: id, manif: crowd, secondes: Math.round(game.time), personnages_perdus: game.stats.deaths, boss: boss?.id });
  const share = () => {
    measure('image partagée', { niveau: id });
    openShare(shareImage({
      frames: [document.getElementById('monde'), document.getElementById('textes')],
      level: level.titre, crowd, tax: said, sign: sign?.texte, where: (location.host + location.pathname).replace(/(index\.html)?\/?$/, ''),
    }), {
      text: `✊ ${crowd.toLocaleString('fr-FR')} dans la manif. À toi.`, url: location.origin + location.pathname,
      button: (label, action, className) => screens.button(label, action, className),
    });
  };
  screens.end({
    level, stats: game.stats, time: game.time, crowd, won, best: custom ? null : best, share,
    next: index >= 0 ? order[index + 1] : null,
    last: index === order.length - 1,
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
      // Le grand carton joue à chaque libération.
      setMode('card');
      showHeroCard(bundle, hero, { audio, reduced: save.options.sobre }).then(() => {
        if (mode !== 'card') return;
        setMode('playing');
        if (game.level.cortege) audio.play('slogan'); // le cortège salue le camarade libéré
      });
    } else if (e.type === 'won') win();
    else if (e.type === 'lost') {
      if (!custom) measure('niveau perdu', { niveau: current.id, manif: game.crowd, secondes: Math.round(game.time) });
      begin = null;
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
    renderer.tick(dt);
    if (demo && game.status !== 'playing') attract();
  }
  renderer.device = input.device;
  hud.device = input.device;
  renderer.draw(game, dt);
  if (!demo) hud.update(game);
}

// ---------------------------------------------------------------- branchements

hud.onQuote = (id) => mode === 'playing' && collect('citations', id, true);
input.onPause = togglePause;
input.onAny = () => audio.unlock();
input.onDevice = () => screens.open && screens.refreshKeys(); // un carton ou une pause ouverts redisent les touches
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
  root.style.setProperty('--vw', `${(root.classList.contains('pivote') ? innerHeight : innerWidth) / 100}px`);
  root.classList.toggle('bas', height <= 480);
  renderer.resize();
  renderer.anchor = thumbs ? 0.58 : 0.62; // les pouces occupent les coins du bas : on remonte un peu l'action
  // Au clavier, les notes du coin gauche descendent jusqu'à 140 pixels environ : le panneau passe dessous.
  // Au pouce, elles sont sous le bandeau, et le panneau reste entre le HUD et le bandeau.
  renderer.signTop = thumbs ? 30 : Math.max(30, Math.ceil((140 * (window.devicePixelRatio || 1)) / renderer.scale));
  input.refreshTouch();
}
addEventListener('resize', layout);
document.addEventListener('visibilitychange', () => {
  last = performance.now();
  acc = 0;
  if (document.hidden && mode === 'playing' && !window.__ugf) togglePause(); // pas en débogage : on pilote onglet caché
});
if (matchMedia('(pointer: coarse)').matches) {
  document.body.classList.add('tactile');
  input.device = 'pouce'; // un écran tactile : on montre les commandes du pouce, jusqu'à ce qu'un clavier ou une manette serve
}
addEventListener('touchstart', () => {
  document.body.classList.add('tactile');
  input.use('pouce');
  layout();
}, { once: true, passive: true });
// Au premier toucher, on demande le plein écran, puis le paysage : là où le navigateur le permet.
addEventListener('pointerup', function ask(e) {
  if (e.pointerType !== 'touch') return; // un clic de souris d'abord ne doit pas user la demande
  removeEventListener('pointerup', ask);
  if (document.fullscreenElement) return;
  document.documentElement.requestFullscreen?.({ navigationUI: 'hide' })
    ?.then(() => screen.orientation?.lock?.('landscape'))
    .catch(() => {}); // refusé (iPhone, réglage du navigateur) : le pivot de la page fait le travail
});

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
