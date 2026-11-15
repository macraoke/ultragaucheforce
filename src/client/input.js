// Entrées : clavier, tactile et manette, fondus en un seul état d'actions
// { left, right, jump, fire, special } que la simulation lit à chaque pas.

/** Touches par POSITION sur le clavier (identiques en AZERTY et QWERTY). */
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  Space: 'jump', ArrowUp: 'jump', KeyW: 'jump',
  KeyJ: 'fire', KeyX: 'fire', Enter: 'fire',
  KeyK: 'special', KeyC: 'special', ShiftLeft: 'special', ShiftRight: 'special',
};
const PAUSE_KEYS = ['Escape', 'KeyP'];
export const ACTIONS = ['left', 'right', 'jump', 'fire', 'special'];

/**
 * Quelles actions sont enfoncées, étant donné les doigts posés et les boutons à l'écran ?
 * Fonction pure (testée dans Node) : chaque doigt actionne le bouton sous lui, même s'il
 * y est arrivé en glissant depuis un autre bouton.
 * @param {{x: number, y: number}[]} points
 * @param {{action: string, left: number, top: number, right: number, bottom: number}[]} buttons
 * @param {number} margin  tolérance autour de chaque bouton, en pixels
 */
export function touchedActions(points, buttons, margin = 14) {
  const pressed = {};
  for (const p of points) {
    let best = null;
    let bestDistance = Infinity;
    for (const b of buttons) {
      if (p.x < b.left - margin || p.x > b.right + margin || p.y < b.top - margin || p.y > b.bottom + margin) continue;
      const d = Math.hypot(p.x - (b.left + b.right) / 2, p.y - (b.top + b.bottom) / 2);
      if (d < bestDistance) {
        best = b;
        bestDistance = d;
      }
    }
    if (best) pressed[best.action] = true;
  }
  return pressed;
}

export class Input {
  /** @param {HTMLElement} pad  le conteneur des boutons tactiles (éléments avec data-action) */
  constructor(pad) {
    this.pad = pad;
    this.keys = {};
    this.touch = {};
    this.pointers = new Map();
    this.onPause = () => {};
    this.onAny = () => {}; // premier geste : sert à débloquer le son

    addEventListener('keydown', (e) => {
      this.onAny();
      if (e.repeat) return;
      if (PAUSE_KEYS.includes(e.code)) return this.onPause();
      const action = KEYS[e.code];
      if (!action || e.target.matches?.('input, textarea, select')) return;
      this.keys[e.code] = action;
      e.preventDefault();
    });
    addEventListener('keyup', (e) => delete this.keys[e.code]);
    addEventListener('blur', () => this.release());
    document.addEventListener('visibilitychange', () => document.hidden && this.release());

    // Une seule surface tactile : à chaque mouvement, on reteste tous les doigts contre tous les boutons.
    const track = (e) => {
      this.onAny();
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.refreshTouch();
      e.preventDefault();
    };
    const drop = (e) => {
      this.pointers.delete(e.pointerId);
      this.refreshTouch();
    };
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
  }

  refreshTouch() {
    const buttons = [...this.pad.querySelectorAll('[data-action]')].map((b) => {
      const r = b.getBoundingClientRect();
      return { action: b.dataset.action, left: r.left, top: r.top, right: r.right, bottom: r.bottom, el: b };
    });
    this.touch = touchedActions([...this.pointers.values()], buttons);
    for (const b of buttons) b.el.classList.toggle('appuye', Boolean(this.touch[b.action]));
  }

  release() {
    this.keys = {};
    this.pointers.clear();
    this.refreshTouch();
  }

  /** Manette standard : croix ou stick, A = saut, X ou gâchette droite = tir, B ou gâchette gauche = spéciale. */
  gamepad() {
    const pad = [...(navigator.getGamepads?.() || [])].find(Boolean);
    if (!pad) return {};
    const b = (i) => Boolean(pad.buttons[i]?.pressed);
    if (b(9)) {
      if (!this.padPause) this.onPause();
      this.padPause = true;
    } else this.padPause = false;
    return {
      left: b(14) || pad.axes[0] < -0.4,
      right: b(15) || pad.axes[0] > 0.4,
      jump: b(0),
      fire: b(2) || b(7) || b(5),
      special: b(1) || b(6) || b(4),
    };
  }

  /** L'état lu par la simulation. */
  actions() {
    const held = {};
    for (const action of Object.values(this.keys)) held[action] = true;
    const pad = this.gamepad();
    const out = {};
    for (const a of ACTIONS) out[a] = Boolean(held[a] || this.touch[a] || pad[a]);
    return out;
  }
}
