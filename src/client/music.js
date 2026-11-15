// Radio Manif : la musique de fond passe par le lecteur officiel de SoundCloud.
// Les pistes sont listées dans `content/musiques/` (une fiche par piste, avec son lien).
// Rien n'est chargé depuis SoundCloud tant que la musique n'est pas activée ; hors-ligne,
// le jeu tourne simplement sans musique.

import { h, link } from './dom.js';

const API = 'https://w.soundcloud.com/player/api.js';
const PLAYER = 'https://w.soundcloud.com/player/';

export class Radio {
  /** @param {HTMLElement} box  le petit panneau où vit le lecteur (visible dans les menus) */
  constructor(bundle, box) {
    this.tracks = Object.values(bundle.musiques || {});
    this.box = box;
    this.enabled = false;
    this.widget = null;
    this.current = null;
    this.loading = null;
    this.onAsk = () => {}; // le joueur demande la musique : à main.js d'enregistrer ce choix
  }

  /** Les pistes prévues pour un endroit : un niveau précis, « menu », « jeu », ou « partout ». */
  pick(slot) {
    const named = this.tracks.find((t) => t.id === slot); // un niveau peut désigner sa piste : « musique: … »
    if (named) return named;
    const exact = this.tracks.filter((t) => t.ou === slot);
    const kind = slot === 'menu' ? [] : this.tracks.filter((t) => t.ou === 'jeu');
    const pool = exact.length ? exact : kind.length ? kind : this.tracks.filter((t) => t.ou === 'partout');
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  setEnabled(on) {
    const possible = this.tracks.length > 0 && navigator.onLine !== false;
    this.enabled = on && possible;
    this.box.hidden = !possible;
    if (this.enabled) return;
    this.widget?.pause();
    // Tant que le joueur n'a rien demandé, aucun lecteur n'est chargé : juste un bouton.
    if (possible && !this.loading) {
      this.box.replaceChildren(h('button', { type: 'button', onclick: () => this.onAsk() }, '▶ Radio Manif'),
        h('p', {}, 'Musique par SoundCloud'));
    }
  }

  /** Charge le lecteur à la première utilisation seulement. */
  ready(track) {
    this.loading ??= new Promise((resolve, reject) => {
      const frame = h('iframe', {
        title: 'Radio Manif — lecteur SoundCloud', allow: 'autoplay', scrolling: 'no',
        src: `${PLAYER}?url=${encodeURIComponent(track.url)}&color=%23e43b44&auto_play=true&hide_related=true&show_comments=false&show_reposts=false&show_teaser=false`,
      });
      this.caption = h('p', {});
      this.box.replaceChildren(h('strong', {}, 'Radio Manif'), frame, this.caption);
      const script = h('script', { src: API });
      script.onload = () => {
        this.widget = window.SC.Widget(frame);
        this.widget.bind(window.SC.Widget.Events.READY, () => resolve(this.widget));
        this.widget.bind(window.SC.Widget.Events.FINISH, () => this.play(this.slot, true));
      };
      script.onerror = reject;
      document.head.append(script);
    });
    return this.loading;
  }

  /** Lance la musique d'un endroit du jeu. Sur mobile, le premier démarrage peut demander un toucher sur le lecteur. */
  async play(slot, force = false) {
    this.slot = slot;
    if (!this.enabled) return;
    const track = this.pick(slot);
    if (!track || (!force && track === this.current)) return;
    try {
      const first = !this.loading;
      const widget = await this.ready(track);
      if (!first) widget.load(track.url, { auto_play: true, hide_related: true, show_comments: false });
      widget.setVolume(45);
      this.current = track;
      this.caption.replaceChildren(link(track.url, `${track.titre} — ${track.artiste}`));
    } catch {
      this.box.hidden = true; // pas de réseau, lecteur bloqué : on joue sans musique
    }
  }

  /** Pendant l'action, le lecteur continue de jouer mais quitte l'écran. */
  setVisible(on) {
    this.box.classList.toggle('cache', !on);
  }
}
