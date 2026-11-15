// Bruitages. Tout est local : sons synthétisés (une ligne de texte dans
// `content/sons/`) ou petits fichiers compressés du dépôt. Aucun son ne vient du réseau.

import { buildSamples, SAMPLE_RATE } from './zzfx.js';

export class Audio {
  constructor(bundle) {
    this.bundle = bundle;
    this.enabled = true;
    this.volume = 0.35;
    this.ctx = null;
    this.buffers = new Map(); // id → AudioBuffer | Promise
    this.lastPlayed = new Map(); // id → instant, pour éviter les empilements
  }

  /** À appeler dans un geste de l'utilisateur (toucher, clic, touche) : les navigateurs l'exigent. */
  unlock() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx ??= new Ctx();
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    // Sur iPhone, le bouton « silencieux » coupe le son du web sauf si la page se déclare comme lecteur.
    if (navigator.audioSession) navigator.audioSession.type = 'playback';
  }

  async buffer(id) {
    if (this.buffers.has(id)) return this.buffers.get(id);
    const def = this.bundle.sons[id];
    if (!def) return null;
    const make = async () => {
      if (def.zzfx) {
        const params = def.zzfx.map((v) => v ?? undefined);
        params[1] = 0; // l'aléa de hauteur est appliqué à la lecture
        const samples = buildSamples(...params);
        const buf = this.ctx.createBuffer(1, Math.max(1, samples.length), SAMPLE_RATE);
        buf.getChannelData(0).set(samples);
        return buf;
      }
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
