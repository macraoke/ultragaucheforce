// Entrées : clavier, tactile et manette, fondus en un seul état d'actions
// { left, right, up, down, jump, fire, special } que la simulation lit à chaque pas.

/** Touches par POSITION sur le clavier (identiques en AZERTY et QWERTY). */
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump up', KeyW: 'jump up', // haut : on saute, et le tir vise vers le haut
  ArrowDown: 'down', KeyS: 'down', // bas : le tir vise vers le bas (on creuse)
  KeyJ: 'fire', KeyX: 'fire', Enter: 'fire',
  KeyK: 'special', KeyC: 'special', ShiftLeft: 'special', ShiftRight: 'special',
};
const PAUSE_KEYS = ['Escape', 'KeyP'];
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
  ['Sauter, grimper', 'Espace, ↑ ou Z', 'A', 'SAUT, ou pouce gauche vers le haut'],
  ['Tirer (maintenir)', 'J, X ou Entrée', 'X ou gâchette droite', 'TIR'],
  ['Creuser, viser en haut', '↓ ou ↑ sans avancer, puis tirer', 'bas ou haut, puis tirer', 'pouce gauche vers le bas ou le haut, puis TIR'],
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

/**
 * Le joueur se sert-il de cette manette ? Seuls comptent les boutons et les axes que le jeu lit : une manette
 * générique posée sur la table, dont un axe inutilisé ne revient jamais à zéro, ne prend pas la main au clavier.
 */
export const padInUse = (pad) => PAD_BUTTONS.some((i) => pad.buttons[i]?.pressed) || PAD_AXES.some((i) => Math.abs(pad.axes[i] || 0) > 0.5);

/**
 * Les zones tactiles, en fractions de l'écran tenu en paysage. Pas de boutons à viser : tout l'écran répond.
 * Moitié gauche : un manche flottant, là où le pouce se pose. Moitié droite : trois cibles, la plus proche gagne.
 */
export const ZONES = {
  split: 0.5, // frontière entre le manche et les actions
  dead: 10, // course morte du manche, en pixels
  reach: 44, // course utile : au-delà, le manche suit le pouce
  lift: 0.17, // pousser le manche vers le haut de cette fraction de l'écran : saut
  pull: 26, // tirer le manche vers le bas d'autant de pixels : le tir vise en bas (on creuse)
  both: 26, // à peu près à égale distance de TIR et de SAUT (écart en pixels) : les deux
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
  for (const p of points) {
    if (p.stick ?? p.ox < view.w * ZONES.split) {
      const dx = p.x - p.ox;
      const down = p.y - (p.ay ?? p.oy);
      if (down > ZONES.pull && down > Math.abs(dx)) {
        pressed.down = true; // tiré vers le bas : on vise sous ses pieds, sans avancer
        continue;
      }
      if (dx < -ZONES.dead) pressed.left = true;
      else if (dx > ZONES.dead) pressed.right = true;
      if (p.oy - p.y > view.h * ZONES.lift) {
        pressed.jump = true;
        if (Math.abs(dx) <= ZONES.dead) pressed.up = true; // poussé droit vers le haut : le tir suit
      }
      continue;
    }
    const [first, second] = ZONES.targets
      .map((t) => ({ action: t.action, d: Math.hypot(p.x - t.x * view.w, p.y - t.y * view.h) }))
      .sort((m, n) => m.d - n.d);
    pressed[first.action] = true;
    const pair = [first.action, second.action].sort().join('+');
    if (pair === 'fire+jump' && second.d - first.d < ZONES.both) pressed[second.action] = true; // le pouce à cheval
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
  // Le manche suit le pouce : on change de direction tout de suite, et on saute d'une poussée vers le haut.
  if (Math.abs(next.x - next.ox) > ZONES.reach) next.ox = next.x - Math.sign(next.x - next.ox) * ZONES.reach;
  if (next.y - next.oy > ZONES.dead) next.oy = next.y - ZONES.dead;
  // Pour viser en bas, on mesure la descente depuis le point le plus haut atteint, sur la course du manche.
  next.ay = Math.max(Math.min(next.ay, next.y), next.y - ZONES.reach);
  return next;
}

export class Input {
  /** @param {HTMLElement} pad  la surface tactile : elle couvre tout l'écran de jeu */
  constructor(pad) {
    this.pad = pad;
    this.keys = {};
    this.touch = {};
    this.pointers = new Map();
    this.active = false; // vrai seulement en pleine partie : ailleurs, le clavier sert aux menus
    this.onPause = () => {};
    this.onAny = () => {}; // premier geste : sert à débloquer le son
    this.onDevice = () => {}; // le joueur a changé d'appareil : les écrans ouverts redisent les touches
    // L'appareil dont on montre les touches : le dernier qui a servi.
    this.device = document.body.classList.contains('tactile') ? 'pouce' : 'clavier';

    addEventListener('keydown', (e) => {
      this.onAny();
      this.use('clavier');
      if (e.repeat) return;
      if (PAUSE_KEYS.includes(e.code)) return this.onPause();
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
    const thumb = points.find((p) => p.stick);
    const at = thumb ? { x: thumb.ox, y: thumb.oy } : { x: ZONES.stick.x * view.w, y: ZONES.stick.y * view.h };
    this.stick.style.left = `${at.x}px`;
    this.stick.style.top = `${at.y}px`;
    this.stick.classList.toggle('appuye', Boolean(thumb));
    const clamp = (v) => Math.max(-ZONES.reach, Math.min(ZONES.reach, v));
    this.stick.style.setProperty('--dx', `${thumb ? clamp(thumb.x - thumb.ox) : 0}px`);
    const drop = !thumb ? 0 : thumb.y < thumb.oy ? thumb.y - thumb.oy : thumb.y - thumb.ay; // poussé en haut, ou tiré en bas
    this.stick.style.setProperty('--dy', `${clamp(drop)}px`);
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

  /** Manette standard : croix ou stick, A = saut, X ou gâchette droite = tir, B ou gâchette gauche = spéciale. */
  gamepad() {
    const pad = this.findPad();
    if (!pad) return {};
    const b = (i) => Boolean(pad.buttons[i]?.pressed);
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

  /** Manette hors partie : croix ou stick pour changer de bouton, A pour valider, Start pour reprendre. */
  pollMenu() {
    const pad = this.findPad();
    if (!pad) return;
    const b = (i) => Boolean(pad.buttons[i]?.pressed);
    const now = {
      next: b(13) || b(15) || pad.axes[1] > 0.5 || pad.axes[0] > 0.5,
      prev: b(12) || b(14) || pad.axes[1] < -0.5 || pad.axes[0] < -0.5,
      ok: b(0),
      start: b(9),
    };
    const was = this.padMenu || {};
    this.padMenu = now;
    this.padPause = now.start; // évite un second basculement au retour en partie
    const pressed = (k) => now[k] && !was[k];
    if (pressed('start')) return this.onPause();
    const card = document.querySelector('.carton');
    if (card) {
      if (pressed('ok')) card.dispatchEvent(new Event('pointerdown'));
      return;
    }
    const items = [...document.querySelectorAll('#ecran button:not(:disabled), #ecran a.bouton')];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement);
    if (pressed('ok')) (items[at] || items[0]).click();
    else if (pressed('next')) items[(at + 1) % items.length].focus();
    else if (pressed('prev')) items[(at - 1 + items.length) % items.length].focus();
  }

  /** L'état lu par la simulation. */
  actions() {
    const held = {};
    for (const actions of Object.values(this.keys)) for (const action of actions.split(' ')) held[action] = true;
    const pad = this.gamepad();
    const out = {};
    for (const a of ACTIONS) out[a] = Boolean(held[a] || this.touch[a] || pad[a]);
    return out;
  }
}
