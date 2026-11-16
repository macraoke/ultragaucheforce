// Bruitages. Tout est local : sons synthétisés (une ligne de texte dans
// `content/sons/`) ou petits fichiers compressés du dépôt. Aucun son ne vient du réseau.

import { synthesize, finish, SAMPLE_RATE } from './zzfx.js';

/** Les réglages ZzFX d'une fiche ; l'aléa de hauteur est appliqué à la lecture. */
const zzfxParams = (def) => {
  const params = def.zzfx.map((v) => v ?? undefined);
  params[1] = 0;
  return params;
};

const MARGIN = 4; // ms laissées libres avant l'image suivante : un morceau de synthèse dure moins

/** Le temps libre du navigateur ; sans `requestIdleCallback` (Safari), quelques millisecondes toutes les 50 ms. */
const idle = (work) => (window.requestIdleCallback
  ? window.requestIdleCallback(work)
  : setTimeout(() => {
    const end = performance.now() + MARGIN + 4;
    work({ timeRemaining: () => Math.max(0, end - performance.now()) });
  }, 50));

export class Audio {
  constructor(bundle) {
    this.bundle = bundle;
    this.enabled = true;
    this.volume = 0.35;
    this.ctx = null;
    this.buffers = new Map(); // id → AudioBuffer | Promise
    this.making = new Map(); // id → synthèse commencée dans le temps libre (voir `prepare`)
    this.lastPlayed = new Map(); // id → instant, pour éviter les empilements
  }

  /** À appeler dans un geste de l'utilisateur (toucher, clic, touche) : les navigateurs l'exigent. */
  unlock() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!this.ctx) {
      this.ctx = new Ctx();
      this.prepare();
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    // Sur iPhone, le bouton « silencieux » coupe le son du web sauf si la page se déclare comme lecteur.
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  }

  /**
   * Les bruitages synthétisés se calculent d'avance, par petits morceaux, quand le navigateur
   * n'a rien d'autre à faire : jamais au milieu d'une image, au premier tir ou au premier saut.
   */
  prepare() {
    const waiting = Object.keys(this.bundle.sons).filter((id) => this.bundle.sons[id].zzfx);
    const work = (deadline) => {
      while (waiting.length && deadline.timeRemaining() > MARGIN) {
        const id = waiting[0];
        if (this.buffers.has(id)) {
          waiting.shift(); // déjà prêt : joué avant d'avoir été préparé
          continue;
        }
        if (!this.making.has(id)) this.making.set(id, synthesize(...zzfxParams(this.bundle.sons[id])));
        const step = this.making.get(id).next();
        if (step.done) this.store(id, step.value);
      }
      if (waiting.length) idle(work);
    };
    setTimeout(() => idle(work), 300); // pas tout de suite : le toucher qui crée le son a déjà retardé l'image
  }

  /** Range les échantillons d'un bruitage synthétisé, prêts à jouer. */
  store(id, samples) {
    this.making.delete(id);
    const buf = this.ctx.createBuffer(1, Math.max(1, samples.length), SAMPLE_RATE);
    buf.getChannelData(0).set(samples);
    this.buffers.set(id, buf);
    return buf;
  }

  async buffer(id) {
    if (this.buffers.has(id)) return this.buffers.get(id);
    const def = this.bundle.sons[id];
    if (!def) return null;
    const make = async () => {
      // Pas encore préparé dans le temps libre : on finit le calcul tout de suite.
      if (def.zzfx) return this.store(id, finish(this.making.get(id) ?? synthesize(...zzfxParams(def))));
      const data = await (await fetch(`content/sons/${def.fichier}`)).arrayBuffer();
      return this.ctx.decodeAudioData(data);
    };
    const promise = make().catch(() => null);
    this.buffers.set(id, promise);
    return promise;
  }

  /** Joue un bruitage par son identifiant (nom du fichier dans `content/sons/`). */
  async play(id, { volume = 1, pitch = 1 } = {}) {
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - (this.lastPlayed.get(id) ?? -1) < 0.04) return;
    this.lastPlayed.set(id, now);
    const def = this.bundle.sons[id];
    const buf = await this.buffer(id);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    const wobble = def.zzfx ? 1 + (def.zzfx[1] ?? 0.05) * (Math.random() * 2 - 1) : 1;
    src.buffer = buf;
    src.playbackRate.value = pitch * wobble;
    gain.gain.value = this.volume * volume * (def.volume ?? 1);
    src.connect(gain).connect(this.ctx.destination);
    src.start();
  }

  /** Voix off : un enregistrement `content/voix/<id>.*`, s'il existe. Sans fichier, pas de voix. */
  speak(id) {
    const file = this.enabled && this.bundle.voix?.[id];
    if (!file) return;
    const el = new window.Audio(file);
    el.volume = Math.min(1, this.volume * 2.5);
    el.play().catch(() => {});
  }
}
