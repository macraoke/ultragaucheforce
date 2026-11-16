// Entrées : clavier, tactile et manette, fondus en un seul état d'actions
// { left, right, up, down, jump, fire, special } que la simulation lit à chaque pas.

import { hitsSolid, wallAt } from '../sim/physics.js';
import { TILE } from '../sim/world.js';

/** Touches par POSITION sur le clavier (identiques en AZERTY et QWERTY). */
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump up', KeyW: 'jump up', // haut : on saute, et le tir vise vers le haut
  ArrowDown: 'down', KeyS: 'down', // bas : le tir vise vers le bas (on creuse)
  KeyJ: 'fire', KeyX: 'fire', Enter: 'fire',
  KeyK: 'special', KeyC: 'special', ShiftLeft: 'special', ShiftRight: 'special',
};
export const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'fire', 'special'];

/**
 * Le nom court de chaque commande, tel qu'il est à l'écran sur chaque appareil. Les panneaux s'en servent :
 * « [tirer] : lancer des tracts » devient « J : lancer des tracts » au clavier, « TIR : … » au pouce.
 */
export const KEY_NAMES = {
  clavier: { avancer: '← →', sauter: 'ESPACE', tirer: 'J', bas: '↓', haut: '↑', speciale: 'K', pause: 'Échap' },
  manette: { avancer: 'Croix', sauter: 'A', tirer: 'X', bas: '↓', haut: '↑', speciale: 'B', pause: 'Start' },
  pouce: { avancer: 'Pouce gauche', sauter: 'SAUT', tirer: 'TIR', bas: 'Pouce ↓', haut: 'Pouce ↑', speciale: 'SPÉ', pause: 'II' },
};

/** Le tableau complet des commandes (écran Commandes, README) : toutes les touches qui marchent. */
export const CONTROLS = [
  ['Avancer', '← → ou Q D', 'croix ou stick', 'moitié gauche : glisser le pouce'],
  ['Sauter, grimper', 'Espace, ↑ ou Z', 'A', 'SAUT, ou pouce gauche vers le haut ; tenu le long d’un mur, on grimpe'],
  ['Tirer (maintenir)', 'J, X ou Entrée', 'X ou gâchette droite', 'TIR'],
  ['Creuser, viser en haut', '↓ ou ↑ sans avancer, puis tirer', 'bas ou haut, puis tirer', 'pouce gauche vers le bas ou le haut, puis TIR ; ou TIR glissé vers le haut'],
  ['Spéciale', 'K, C ou Maj', 'B ou gâchette gauche', 'SPÉ'],
  ['Pause', 'Échap ou P', 'Start', 'II'],
];

/** Les commandes en une ligne, pour le carton d'ouverture et la pause : [touche, ce qu'elle fait]. */
export const brief = (device) => {
  const k = KEY_NAMES[device] || KEY_NAMES.clavier;
  return [[k.avancer, 'avancer'], [k.sauter, 'sauter'], [k.tirer, 'tirer'], [`${k.bas} + ${k.tirer}`, 'creuser'], [k.speciale, 'spéciale']];
};

const TOKEN = /\[([^\]]+)\]/g;
/** « [ Spéciale ] » → « speciale » : sans espaces, sans accents, en minuscules. */
const tokenName = (word) => word.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Le texte d'un panneau pour cet appareil. `[tirer]`, `[sauter]`, `[avancer]`, `[bas]`, `[haut]`, `[spéciale]`, `[pause]`
 * deviennent la touche de l'appareil ; un mot inconnu entre crochets reste tel quel.
 * L'ancienne forme « au clavier // au pouce » marche encore.
 */
export function withKeys(text, device = 'clavier') {
  if (!text) return '';
  const [keys, thumbs] = text.split(' // ');
  const chosen = thumbs && device === 'pouce' ? thumbs : keys;
  const names = KEY_NAMES[device] || KEY_NAMES.clavier;
  return chosen.replace(TOKEN, (all, word) => names[tokenName(word)] ?? all);
}

/** Ce panneau nomme-t-il cette commande (`speciale`, `tirer`…), sous l'une des formes que `withKeys` reconnaît ? */
export const mentions = (text, action) => [...(text || '').matchAll(TOKEN)].some(([, word]) => tokenName(word) === action);

/** Les boutons et les axes de la manette standard que le jeu lit (voir `gamepad()` et `pollMenu()`). */
const PAD_BUTTONS = [0, 1, 2, 4, 5, 6, 7, 9, 12, 13, 14, 15];
const PAD_AXES = [0, 1];

/** Un élément à l'écran : ni `hidden`, ni `display: none`, ni `visibility: hidden`, lui ou un parent. */
export const shown = (el) => (el.checkVisibility
  ? el.checkVisibility({ visibilityProperty: true, checkVisibilityCSS: true })
  : el.getClientRects().length > 0);

/**
 * Le joueur se sert-il de cette manette ? Seuls comptent les boutons et les axes que le jeu lit : une manette
 * générique posée sur la table, dont un axe inutilisé ne revient jamais à zéro, ne prend pas la main au clavier.
 */
export const padInUse = (pad) => PAD_BUTTONS.some((i) => pad.buttons[i]?.pressed) || PAD_AXES.some((i) => Math.abs(pad.axes[i] || 0) > 0.5);

/**
 * Les zones tactiles, en fractions de l'écran tenu en paysage. Pas de boutons à viser : tout l'écran répond.
 * Moitié gauche : un manche flottant, là où le pouce se pose. Moitié droite : TIR et SAUT, le plus proche gagne ;
 * au-dessus de TIR, le tir vise en haut. SPÉ ne répond qu'à un doigt posé sur elle.
 */
export const ZONES = {
  split: 0.5, // frontière entre le manche et les actions
  dead: 10, // course morte du manche, en pixels
  reach: 44, // course utile : au-delà, le manche suit le pouce
  lift: 26, // pousser le manche vers le haut d'autant de pixels : saut (avant le bout de sa course, diagonale comprise)
  cone: 30, // poussé vers le haut à moins de 30° de la verticale : on ne marche pas, le tir vise en haut
  pull: 26, // tirer le manche vers le bas d'autant de pixels : le tir vise en bas (on creuse)
  both: 26, // à peu près à égale distance de TIR et de SAUT (écart en pixels) : les deux
  aim: 0.11, // un doigt de TIR monté au-dessus du bouton (en fraction du petit côté de l'écran) : le tir vise en haut
  press: 0.1, // SPÉ : un doigt posé à moins de cette distance de son centre (fraction du petit côté), jamais glissé
  stick: { x: 0.14, y: 0.72 }, // où le manche se repose quand personne n'y touche
  targets: [
    { action: 'fire', x: 0.87, y: 0.72 },
    { action: 'jump', x: 0.71, y: 0.84 },
    { action: 'special', x: 0.9, y: 0.34 },
  ],
};

/**
 * Quelles actions sont enfoncées, étant donné les doigts posés ? Fonction pure, testée dans Node.
 * @param {{x: number, y: number, ox: number, oy: number, ay?: number, stick?: boolean}[]} points  position de chaque
 *        doigt, point où il s'est posé, `ay` : le point le plus haut d'où il redescend (sinon `oy`), et `stick` :
 *        vrai s'il s'est posé à gauche (sinon on le déduit de `ox`)
 * @param {{w: number, h: number}} view  taille de l'écran de jeu, en pixels
 */
export function touchActions(points, view) {
  const pressed = {};
  const unit = Math.min(view.w, view.h); // l'unité des boutons à l'écran (`vmin`)
  const spot = (action) => {
    const t = ZONES.targets.find((z) => z.action === action);
    return { action, x: t.x * view.w, y: t.y * view.h };
  };
  const [fire, jump, special] = [spot('fire'), spot('jump'), spot('special')];
  const upright = Math.tan((ZONES.cone * Math.PI) / 180);
  for (const p of points) {
    if (p.stick ?? p.ox < view.w * ZONES.split) {
      const dx = p.x - p.ox;
      const down = p.y - (p.ay ?? p.oy);
      const rise = p.oy - p.y;
      if (down > ZONES.pull && down > Math.abs(dx)) {
        pressed.down = true; // tiré vers le bas : on vise sous ses pieds, sans avancer
        continue;
      }
      if (rise > ZONES.lift) {
        pressed.jump = true;
        if (Math.abs(dx) <= rise * upright) {
          pressed.up = true; // poussé vers le haut, de biais ou non : on ne marche pas, le tir suit vers le haut
          continue;
        }
      }
      if (dx < -ZONES.dead) pressed.left = true;
      else if (dx > ZONES.dead) pressed.right = true;
      continue;
    }
    // SPÉ part d'un doigt posé sur elle, jamais d'un pouce qui glisse depuis TIR ou SAUT ; posé dessus, il reste SPÉ.
    if (Math.hypot(p.ox - special.x, p.oy - special.y) <= ZONES.press * unit) {
      pressed.special = true;
      continue;
    }
    const [first, second] = [fire, jump]
      .map((t) => ({ action: t.action, d: Math.hypot(p.x - t.x, p.y - t.y) }))
      .sort((m, n) => m.d - n.d);
    pressed[first.action] = true;
    if (second.d - first.d < ZONES.both) pressed[second.action] = true; // le pouce à cheval
    else if (first.action === 'fire' && fire.y - p.y > ZONES.aim * unit) pressed.up = true; // monté au-dessus de TIR
  }
  return pressed;
}

/**
 * Suit un doigt d'un événement à l'autre. Son côté est fixé quand il se pose : parti de la droite, il reste une
 * action même s'il glisse à gauche. Seul le manche déplace son origine pour suivre le pouce.
 * @param {object | undefined} p  l'état du doigt (absent au premier contact)
 * @param {{x: number, y: number}} at  sa position, dans le repère du jeu
 * @param {{w: number, h: number}} view
 */
export function trackPoint(p, at, view) {
  const next = { ...(p || { ox: at.x, oy: at.y, ay: at.y, stick: at.x < view.w * ZONES.split }), ...at };
  if (!next.stick) return next;
  // Le manche suit le pouce : sorti de l'anneau, l'anneau glisse avec lui, dans la direction du pouce. On change de
  // direction tout de suite, et un pouce parti loin en haut à gauche dit toujours « en haut à gauche ».
  const dx = next.x - next.ox;
  const rise = Math.max(0, next.oy - next.y);
  const reach = Math.hypot(dx, rise);
  if (reach > ZONES.reach) {
    next.ox = next.x - (dx * ZONES.reach) / reach;
    if (rise > 0) next.oy = next.y + (rise * ZONES.reach) / reach;
  }
  if (next.y - next.oy > ZONES.dead) next.oy = next.y - ZONES.dead;
  // Pour viser en bas, on mesure la descente depuis le point le plus haut atteint, sur la course du manche.
  next.ay = Math.max(Math.min(next.ay, next.y), next.y - ZONES.reach);
  return next;
}

/** Un mur à moins d'autant de pixels (une trouée de deux tuiles) attire le héros qui grimpe au pouce. */
const CLIMB_REACH = 24;

/**
 * Grimper au pouce, d'un geste tenu. En l'air, le saut tenu (manche vers le haut, ou SAUT) et un mur tout près : le
 * héros s'y accroche et grimpe, un rebond chaque fois qu'il redescend, puis passe par-dessus. Le manche poussé vers
 * l'autre côté l'en détache. Au clavier et à la manette, rien ne change : on y grimpe en tapant le saut.
 * Lit la partie, ne la modifie pas : seules les actions des doigts changent.
 * @param {object} touch  les actions des doigts (`touchActions`)
 * @param {{x: number, y: number, w: number, h: number, vy: number, onGround: boolean, facing: number, dead?: boolean}} hero
 * @param {{solid(tx: number, ty: number): boolean}} world
 * @param {{side?: number, let?: boolean}} memo  d'un pas à l'autre : le mur qu'on grimpe, le saut relâché au pas d'avant
 */
export function climbAssist(touch, hero, world, memo) {
  if (!touch.jump || !hero || hero.onGround || hero.dead) {
    memo.side = 0;
    memo.across = 0;
    return touch;
  }
  const near = (s) => hitsSolid(world, s > 0 ? hero.x + hero.w : hero.x - CLIMB_REACH, hero.y, CLIMB_REACH, hero.h);
  const pushed = touch.left ? -1 : touch.right ? 1 : 0;
  const toward = (s) => ({ ...touch, up: false, left: s < 0, right: s > 0 });
  if (memo.across && !pushed) return toward(memo.across); // il passe sur l'étage : il y va jusqu'à s'y poser
  const first = memo.side || hero.facing || 1;
  const side = pushed ? (near(pushed) ? pushed : 0) : [first, -first].find(near) || 0;
  if (!side) {
    // Plus de mur : le haut est atteint. Sans autre geste du pouce, il passe par-dessus.
    if (pushed || !memo.side) {
      memo.side = 0;
      return touch;
    }
    return toward(memo.side);
  }
  memo.side = side;
  // Le pouce dit seulement « en haut » : de l'autre côté de la trouée, un plancher bien sous ses pieds (une tuile de
  // marge, le temps de traverser), plus haut que ce qu'il a sous lui, c'est l'étage. Il y passe.
  const across = -side;
  const x = across > 0 ? hero.x + hero.w : hero.x - 2 * TILE;
  const feet = hero.y + hero.h;
  const floor = (x0, w) => {
    for (let ty = Math.floor(feet / TILE); ty <= Math.floor(feet / TILE) + 5; ty++) if (hitsSolid(world, x0, ty * TILE, w, 1)) return ty * TILE;
    return Infinity;
  };
  const step = floor(x, 2 * TILE);
  if (!pushed && step - feet >= TILE && step < floor(hero.x, hero.w) && !hitsSolid(world, x, hero.y, 2 * TILE, hero.h)) {
    memo.across = across;
    return toward(across);
  }
  const out = toward(side);
  // Un rebond par appui : quand il redescend contre le mur, le saut se relâche un pas, puis repart.
  if (wallAt(world, hero, side) && hero.vy >= 0 && !memo.let) {
    out.jump = false;
    memo.let = true;
  } else memo.let = false;
  return out;
}

export class Input {
  /** @param {HTMLElement} pad  la surface tactile : elle couvre tout l'écran de jeu */
  constructor(pad) {
    this.pad = pad;
    this.keys = {};
    this.touch = {};
    this.pointers = new Map();
    this.active = false; // vrai seulement en pleine partie : ailleurs, le clavier sert aux menus
    this.onPause = () => {}; // P, Start
    this.onBack = () => {}; // Échap, et B de la manette hors partie : l'écran d'avant (en partie, Échap met en pause)
    this.onAny = () => {}; // premier geste : sert à débloquer le son
    this.onDevice = () => {}; // le joueur a changé d'appareil : les écrans ouverts redisent les touches
    this.held = new Set(); // boutons de manette tenus en quittant un menu : ils ne comptent en jeu qu'une fois relâchés
    this.climb = {}; // au pouce, le mur que le héros grimpe (voir `climbAssist`)
    // L'appareil dont on montre les touches : le dernier qui a servi.
    this.device = document.body.classList.contains('tactile') ? 'pouce' : 'clavier';

    addEventListener('keydown', (e) => {
      this.onAny();
      this.use('clavier');
      if (e.repeat) return;
      if (e.code === 'Escape') return this.onBack();
      if (e.code === 'KeyP') return this.onPause();
      const action = KEYS[e.code];
      if (!action || !this.active) return;
      this.keys[e.code] = action;
      e.preventDefault();
    });
    addEventListener('keyup', (e) => delete this.keys[e.code]);
    addEventListener('blur', () => this.release());
    document.addEventListener('visibilitychange', () => document.hidden && this.release());

    // Les repères à l'écran : le manche et trois cibles, posés aux endroits que dit ZONES.
    this.stick = pad.querySelector('.manche');
    this.marks = [...pad.querySelectorAll('[data-action]')];
    for (const mark of this.marks) {
      const target = ZONES.targets.find((t) => t.action === mark.dataset.action);
      mark.style.left = `${target.x * 100}%`;
      mark.style.top = `${target.y * 100}%`;
    }

    const track = (e) => {
      this.onAny();
      const p = trackPoint(this.pointers.get(e.pointerId), this.locate(e), this.view);
      this.pointers.set(e.pointerId, p);
      this.refreshTouch();
      e.preventDefault();
    };
    const drop = (e) => {
      this.pointers.delete(e.pointerId);
      this.refreshTouch();
    };
    addEventListener('pointerdown', (e) => e.pointerType === 'touch' && this.use('pouce'), true);
    pad.addEventListener('pointerdown', (e) => {
      try {
        pad.setPointerCapture(e.pointerId); // le doigt reste suivi même s'il sort de la zone
      } catch {
        // pointeur déjà relâché ou navigateur sans capture : on suit quand même
      }
      track(e);
    });
    pad.addEventListener('pointermove', (e) => this.pointers.has(e.pointerId) && track(e));
    pad.addEventListener('pointerup', drop);
    pad.addEventListener('pointercancel', drop);
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS : pas de zoom au pincement ni au double toucher pendant le jeu.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    this.refreshTouch();
  }

  /** L'écran de jeu est-il pivoté d'un quart de tour (téléphone tenu debout) ? */
  get turned() {
    return document.documentElement.classList.contains('pivote');
  }

  /** Taille de l'écran de jeu, dans son propre repère. */
  get view() {
    return this.turned ? { w: innerHeight, h: innerWidth } : { w: innerWidth, h: innerHeight };
  }

  /** Position d'un doigt dans le repère du jeu. */
  locate(e) {
    return this.turned ? { x: e.clientY, y: innerWidth - e.clientX } : { x: e.clientX, y: e.clientY };
  }

  refreshTouch() {
    const { view } = this;
    const points = [...this.pointers.values()];
    this.touch = touchActions(points, view);
    for (const mark of this.marks) mark.classList.toggle('appuye', Boolean(this.touch[mark.dataset.action]));
    // La flèche de TIR s'allume quand le tir part vraiment en haut : sans avancer (la règle de la simulation, partout).
    const { fire, up, left, right, down } = this.touch;
    this.marks.find((m) => m.dataset.action === 'fire')?.classList.toggle('haut', Boolean(fire && up && !left && !right && !down));
    const thumb = points.find((p) => p.stick);
    const at = thumb ? { x: thumb.ox, y: thumb.oy } : { x: ZONES.stick.x * view.w, y: ZONES.stick.y * view.h };
    this.stick.style.left = `${at.x}px`;
    this.stick.style.top = `${at.y}px`;
    this.stick.classList.toggle('appuye', Boolean(thumb));
    // La boule reste dans l'anneau, dans la direction du pouce, même quand il en sort.
    const dx = thumb ? thumb.x - thumb.ox : 0;
    const dy = !thumb ? 0 : thumb.y < thumb.oy ? thumb.y - thumb.oy : thumb.y - thumb.ay; // poussé en haut, ou tiré en bas
    const k = Math.min(1, ZONES.reach / (Math.hypot(dx, dy) || 1));
    this.stick.style.setProperty('--dx', `${dx * k}px`);
    this.stick.style.setProperty('--dy', `${dy * k}px`);
  }

  release() {
    this.keys = {};
    this.pointers.clear();
    this.refreshTouch();
  }

  /** Note l'appareil qui vient de servir ; s'il change, les touches affichées changent avec lui. */
  use(device) {
    if (device === this.device) return;
    this.device = device;
    this.onDevice(device);
  }

  /** La manette branchée, s'il y en a une ; on la note comme appareil en cours dès qu'on y touche. */
  findPad() {
    const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
    if (pad && padInUse(pad)) this.use('manette');
    return pad;
  }

  /** Les boutons de la manette tels que les menus les lisent. */
  menuButtons(pad) {
    const b = (i) => Boolean(pad.buttons[i]?.pressed);
    return {
      next: b(13) || b(15) || pad.axes[1] > 0.5 || pad.axes[0] > 0.5,
      prev: b(12) || b(14) || pad.axes[1] < -0.5 || pad.axes[0] < -0.5,
      ok: b(0),
      back: b(1),
      start: b(9),
    };
  }

  /** Manette standard : croix ou stick, A = saut, X ou gâchette droite = tir, B ou gâchette gauche = spéciale. */
  gamepad() {
    const pad = this.findPad();
    if (!pad) return {};
    const raw = (i) => Boolean(pad.buttons[i]?.pressed);
    // Le bouton qui a fermé un menu (B sur la pause, A sur « Reprendre ») ne part pas en jeu tant qu'il reste enfoncé :
    // B est aussi la spéciale, A le saut.
    for (const i of this.held) if (!raw(i)) this.held.delete(i);
    const b = (i) => raw(i) && !this.held.has(i);
    // Ce qui est tenu en jouant ne compte pas comme un appui dans le menu qui s'ouvre (A, B tenus en mettant en pause).
    this.padMenu = this.menuButtons(pad);
    if (b(9)) {
      if (!this.padPause) this.onPause();
      this.padPause = true;
    } else this.padPause = false;
    return {
      left: b(14) || pad.axes[0] < -0.4,
      right: b(15) || pad.axes[0] > 0.4,
      up: b(12) || pad.axes[1] < -0.6,
      down: b(13) || pad.axes[1] > 0.6,
      jump: b(0),
      fire: b(2) || b(7) || b(5),
      special: b(1) || b(6) || b(4),
    };
  }

  /** Manette hors partie : croix ou stick pour changer de bouton, A pour valider, B pour revenir, Start pour reprendre. */
  pollMenu() {
    const pad = this.findPad();
    if (!pad) return;
    const now = this.menuButtons(pad);
    const was = this.padMenu || {};
    this.padMenu = now;
    this.padPause = now.start; // évite un second basculement au retour en partie
    const pressed = (k) => now[k] && !was[k];
    if (pressed('start')) return this.onPause();
    // A et B servent aussi en jeu (saut, spéciale) : l'appui qui agit ici est retenu jusqu'à ce qu'on le relâche.
    if (pressed('ok')) this.held.add(0);
    if (pressed('back')) this.held.add(1);
    const card = document.querySelector('.carton');
    if (card) {
      if (pressed('ok')) card.dispatchEvent(new Event('pointerdown'));
      return;
    }
    // Une carte ouverte par-dessus l'écran : B la ferme comme Échap, et la croix ne parcourt qu'elle.
    const layer = document.querySelector('#ecran .carte-ouverte');
    if (pressed('back')) {
      if (layer) layer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
      else this.onBack();
      return;
    }
    // Seulement ce qu'on voit : un panneau replié ou un bouton caché n'arrête pas la croix.
    const items = [...(layer || document).querySelectorAll(layer ? 'button:not(:disabled), a.bouton' : '#ecran button:not(:disabled), #ecran a.bouton')]
      .filter(shown);
    if (!items.length) return;
    const at = items.indexOf(document.activeElement);
    if (pressed('ok')) (items[at] || items[0]).click();
    else if (pressed('next')) items[(at + 1) % items.length].focus();
    else if (pressed('prev')) items[(at - 1 + items.length) % items.length].focus();
  }

  /**
   * L'état lu par la simulation.
   * @param {{hero: object, world: object}} [game]  la partie en cours : au pouce, le héros grimpe d'un geste tenu
   */
  actions(game) {
    const held = {};
    for (const actions of Object.values(this.keys)) for (const action of actions.split(' ')) held[action] = true;
    const pad = this.gamepad();
    const touch = game ? climbAssist(this.touch, game.hero, game.world, this.climb) : this.touch;
    const out = {};
    for (const a of ACTIONS) out[a] = Boolean(held[a] || touch[a] || pad[a]);
    return out;
  }
}
