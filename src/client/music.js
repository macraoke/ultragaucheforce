// Radio Manif : la musique de fond passe par le lecteur officiel de SoundCloud.
// Les pistes sont listées dans `content/musiques/` (une fiche par piste, avec son lien).
// Rien n'est chargé depuis SoundCloud tant que la musique n'est pas activée ; hors-ligne,
// le jeu tourne simplement sans musique.
//
// Le lecteur ne prévient pas toujours qu'une piste ne joue pas : une piste retirée envoie ERROR,
// une piste chiffrée sans module de lecture n'envoie rien, une lecture refusée faute de geste du
// joueur envoie PAUSE aussitôt. La Radio attend donc que la lecture avance vraiment : une piste qui
// ne démarre pas cède la place à une autre ; une lecture refusée montre le bouton de relance, et le
// prochain toucher la relance.

import { h, link } from './dom.js';

const API = 'https://w.soundcloud.com/player/api.js';
const PLAYER = 'https://w.soundcloud.com/player/';
// Options du lecteur. `widget.load()` les réécrit en « true » ou « false » : la couleur n'y figure pas.
const OPTIONS = { auto_play: true, hide_related: true, show_comments: false, show_reposts: false, show_teaser: false };
const VOLUME = 45;
/** Le temps laissé à une piste pour démarrer, en millisecondes. */
export const START_TIMEOUT = 10000;
const CONNECT_TIMEOUT = 20000;
const EVENTS = ['READY', 'PLAY', 'PLAY_PROGRESS', 'PAUSE', 'FINISH', 'ERROR'];

/**
 * Les pistes possibles pour un moment du jeu, de la plus précise à la plus large :
 * celle que nomme le niveau (`musique`), celles de l'endroit (`ou`), celles de tous les niveaux
 * (`jeu`, sauf au menu), celles de partout, puis n'importe laquelle plutôt que le silence.
 */
export function poolsFor(tracks, slot, named = null) {
  const at = (ou) => tracks.filter((t) => t.ou === ou);
  return [named ? tracks.filter((t) => t.id === named) : [], at(slot), slot === 'menu' ? [] : at('jeu'), at('partout'), tracks]
    .filter((pool) => pool.length);
}

/** Une piste au hasard dans la première liste qui en a une qui marche ; `avoid` (celle qui vient de finir) en dernier. */
export function chooseTrack(tracks, { slot, named = null, failed = new Set(), avoid = null, random = Math.random }) {
  for (const pool of poolsFor(tracks, slot, named)) {
    const ok = pool.filter((t) => !failed.has(t.id));
    if (!ok.length) continue;
    const fresh = ok.filter((t) => t !== avoid);
    const from = fresh.length ? fresh : ok;
    return from[Math.floor(random() * from.length)];
  }
  return null;
}

export class Radio {
  /**
   * @param {HTMLElement | null} box  le petit panneau où vit le lecteur (visible dans les menus)
   * @param {object} [env]  ce qui touche au navigateur et à SoundCloud ; les tests le remplacent
   */
  constructor(bundle, box, env = {}) {
    this.tracks = Object.values(bundle.musiques || {});
    this.env = {
      random: Math.random,
      later: (fn, ms) => setTimeout(fn, ms),
      cancel: (timer) => clearTimeout(timer),
      online: () => navigator.onLine !== false,
      activated: () => navigator.userActivation?.hasBeenActive ?? true, // le joueur a-t-il déjà touché la page ?
      connect: connectWidget,
      ...env,
    };
    this.view = this.env.view || new RadioPanel(box);
    this.view.onAsk = () => this.onAsk();
    this.view.onRetry = () => this.unblock();
    this.enabled = false;
    this.status = 'off'; // off | loading | playing | paused | blocked
    this.widget = null;
    this.connecting = null;
    this.current = null; // la piste chargée (ou en train de l'être)
    this.slot = 'menu';
    this.named = null;
    this.chosenFor = null; // le moment pour lequel `current` a été choisie
    this.failed = new Set(); // pistes qui n'ont pas voulu jouer pendant cette visite
    this.attempt = null; // une lecture demandée, pas encore confirmée : { track, refused, retried, loaded }
    this.timer = null;
    this.ownPause = false; // la pause vient de nous (musique coupée) : son PAUSE n'est pas un refus
    this.hidden = false;
    this.wanted = false; // la musique jouait quand l'onglet a été caché
    this.onAsk = () => {}; // le joueur demande la musique : à main.js d'enregistrer ce choix
  }

  setEnabled(on) {
    const possible = this.tracks.length > 0 && this.env.online();
    const was = this.enabled;
    this.enabled = on && possible;
    if (!this.enabled) {
      this.halt();
      this.status = 'off';
    }
    this.render(possible);
    if (this.enabled && !was) this.play(this.slot, this.named);
  }

  /**
   * Lance la musique d'un moment du jeu : « menu », « boss », ou l'identifiant d'un niveau,
   * avec la piste que nomme le niveau s'il en nomme une.
   */
  play(slot, named = null) {
    const again = this.chosenFor === `${slot}|${named}`;
    this.slot = slot;
    this.named = named;
    if (!this.enabled) return;
    const live = this.status === 'playing' || this.status === 'loading';
    if (again && live) return; // « Recommencer » : la même musique continue
    const track = this.choose();
    if (!track) return this.block();
    this.chosenFor = `${slot}|${named}`;
    if (track !== this.current) return this.start(track);
    if (!live) this.resume();
  }

  choose(avoid = null) {
    return chooseTrack(this.tracks, { slot: this.slot, named: this.named, failed: this.failed, avoid, random: this.env.random });
  }

  /** Charge une piste ; le lecteur n'est créé qu'à la première. */
  start(track) {
    this.current = track;
    this.status = 'loading';
    this.ownPause = false;
    // Tant que le lecteur n'a pas fini de charger cette piste, ce qu'il annonce vient de la précédente.
    this.watch(track, { loaded: !this.widget && !this.connecting });
    this.render();
    if (this.widget) return this.widget.load(track.url, { ...OPTIONS, callback: () => this.loaded(track) });
    if (this.connecting) return; // le lecteur arrive : il prendra la piste courante une fois prêt
    const pending = this.env.connect(track, (name, data) => this.event(name, data), this.view);
    this.connecting = pending;
    pending.then((widget) => {
      if (this.connecting !== pending) return;
      this.widget = widget;
      this.loaded(track);
      if (!this.enabled) {
        this.ownPause = true;
        widget.pause();
      } else if (this.current !== track) this.start(this.current); // une autre piste a été demandée entre-temps
    }, () => {
      if (this.connecting !== pending) return;
      // Pas de réseau, lecteur bloqué : on joue sans musique. Le bouton de Radio Manif réessaiera.
      this.connecting = null;
      this.cancelWatch();
      this.view.unmount();
      this.status = 'blocked';
      this.render();
    });
  }

  /** Reprend la piste chargée. */
  resume() {
    if (!this.widget) return this.start(this.current);
    this.status = 'loading';
    this.ownPause = false;
    this.watch(this.current);
    this.widget.play();
    this.render();
  }

  /** Arrête sans rien oublier : la piste reste chargée. */
  halt() {
    this.cancelWatch();
    if (!this.widget) return;
    this.ownPause = true;
    this.widget.pause();
  }

  /** Le lecteur a chargé la piste demandée. */
  loaded(track) {
    this.widget?.setVolume(VOLUME);
    if (this.attempt?.track === track) this.attempt.loaded = true;
  }

  watch(track, { retried = false, loaded = true } = {}) {
    this.cancelWatch();
    this.attempt = { track, refused: false, retried, loaded };
    this.timer = this.env.later(() => this.timeout(track), START_TIMEOUT);
  }

  cancelWatch() {
    if (this.timer !== null) this.env.cancel(this.timer);
    this.timer = null;
    this.attempt = null;
  }

  /** La piste n'a pas démarré à temps. */
  timeout(track) {
    this.timer = null;
    // Onglet caché : le navigateur peut retenir la lecture. On jugera au retour.
    if (this.attempt?.track !== track || this.hidden) return;
    // Refusée par le navigateur, ou personne n'a encore touché la page : on attend un geste.
    if (this.attempt.refused || !this.env.activated()) return this.block();
    this.fail(track);
  }

  /** Une piste qui ne joue pas (retirée, privée, chiffrée sans module de lecture) : on passe à une autre. */
  fail(track) {
    this.failed.add(track.id);
    const next = this.choose();
    if (next) this.start(next);
    else this.block();
  }

  block() {
    this.cancelWatch();
    this.status = 'blocked';
    this.render();
  }

  /** Un geste du joueur (toucher, clic, touche) : relance une lecture que le navigateur avait refusée. */
  unblock() {
    if (!this.enabled || this.status !== 'blocked') return;
    if (!this.choose()) this.failed.clear(); // plus rien ne marchait : on retente tout
    const track = this.current && !this.failed.has(this.current.id) ? this.current : this.choose();
    if (!track) return;
    if (!this.widget || track !== this.current) return this.start(track);
    this.status = 'loading';
    this.ownPause = false;
    this.watch(track, { retried: true });
    this.widget.play(); // pendant le geste, ou juste après : c'est ce qui l'autorise
    this.render();
  }

  /** Ce que le lecteur SoundCloud annonce. */
  event(name, data = {}) {
    if (!this.enabled) return;
    if (this.attempt && !this.attempt.loaded) return; // encore la piste d'avant
    // Une erreur pendant le chargement : la piste est morte. (Une fois la lecture partie, on la laisse jouer.)
    if (name === 'ERROR') return this.attempt && this.fail(this.attempt.track);
    if (name === 'FINISH') {
      const next = this.choose(this.current);
      return next ? this.start(next) : this.block();
    }
    if (name === 'PLAY') {
      this.ownPause = false;
      // Relancée d'ailleurs (le bouton du lecteur, le système) : on vérifie qu'elle avance.
      if (!this.attempt && this.current && this.status !== 'playing') this.watch(this.current, { retried: true });
    }
    // Une lecture demandée avance : elle joue vraiment. (Sans demande en cours, un reste d'avant une pause.)
    if (name === 'PLAY_PROGRESS' && data.currentPosition > 0 && this.attempt && !this.ownPause) {
      this.cancelWatch();
      this.status = 'playing';
      this.render();
    }
    if (name === 'PAUSE' && !this.ownPause) {
      if (!this.attempt) {
        // Pause après une vraie lecture : le joueur, ou le système (appel, autre application).
        if (this.status === 'playing') this.status = 'paused';
        return this.render();
      }
      this.attempt.refused = true; // le navigateur a refusé de jouer
      if (!this.attempt.retried && this.env.activated()) {
        this.attempt.retried = true;
        this.widget?.play();
      } else this.block();
    }
  }

  /**
   * Onglet caché : la musique continue, comme avant. Mais le système peut l'arrêter (téléphone
   * verrouillé, appel, autre application) : au retour, elle reprend.
   */
  setHidden(hidden) {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    if (!this.enabled) return;
    if (hidden) return void (this.wanted = this.status === 'playing' || this.status === 'loading');
    if (this.wanted && this.status !== 'playing' && this.current && !this.failed.has(this.current.id)) this.resume();
    this.wanted = false;
  }

  /** Pendant l'action, le lecteur continue de jouer mais quitte l'écran. */
  setVisible(on) {
    this.view.setVisible(on);
  }

  render(possible = this.tracks.length > 0 && this.env.online()) {
    this.view.show({ possible, enabled: this.enabled, status: this.status, track: this.current });
  }
}

/** Le panneau de Radio Manif : un bouton tant que rien n'est chargé, puis le lecteur et sa piste. */
class RadioPanel {
  constructor(box) {
    this.box = box;
    this.frame = null;
  }

  mount(frame) {
    this.frame = frame;
    this.caption = h('p', {});
    this.retry = h('button', { type: 'button', className: 'relance', hidden: true, onclick: () => this.onRetry() }, '▶ Relancer la musique');
    this.box.replaceChildren(h('strong', {}, 'Radio Manif'), frame, this.caption, this.retry);
  }

  unmount() {
    this.frame = null;
    this.box.replaceChildren();
  }

  show({ possible, enabled, status, track }) {
    this.enabled = enabled;
    this.box.hidden = !possible;
    if (!possible) return;
    const blocked = enabled && status === 'blocked';
    this.box.classList.toggle('bloquee', Boolean(this.frame) && blocked);
    if (!this.frame) {
      // Tant que le joueur n'a rien demandé, aucun lecteur n'est chargé : juste un bouton.
      // (Musique demandée mais lecteur injoignable : le même bouton réessaie.)
      if (this.box.querySelector('[data-radio]')) return;
      const ask = h('button', { type: 'button', onclick: () => (this.enabled ? this.onRetry() : this.onAsk()) }, '▶ Radio Manif');
      ask.dataset.radio = 'demande';
      this.box.replaceChildren(ask, h('p', {}, 'Musique par SoundCloud'));
      return;
    }
    this.retry.hidden = !blocked;
    const label = track ? `${track.titre} — ${track.artiste}` : '';
    if (this.caption.textContent !== label) this.caption.replaceChildren(track ? link(track.url, label) : '');
  }

  setVisible(on) {
    this.box.classList.toggle('cache', !on);
  }
}

/** Charge le lecteur SoundCloud dans le panneau, avec sa première piste. */
function connectWidget(track, onEvent, view) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({ url: track.url, color: '#e43b44', ...OPTIONS });
    // `encrypted-media` : certaines pistes sont chiffrées ; sans ce droit, le lecteur les charge mais reste muet.
    const frame = h('iframe', { title: 'Radio Manif — lecteur SoundCloud', allow: 'autoplay; encrypted-media', scrolling: 'no', src: `${PLAYER}?${params}` });
    view.mount(frame);
    const late = setTimeout(() => reject(new Error('lecteur SoundCloud muet')), CONNECT_TIMEOUT);
    const bind = () => {
      const widget = window.SC.Widget(frame);
      const names = window.SC.Widget.Events;
      for (const name of EVENTS) widget.bind(names[name], (data) => onEvent(name, data));
      widget.bind(names.READY, () => {
        clearTimeout(late);
        resolve(widget);
      });
    };
    if (window.SC?.Widget) return bind();
    const script = h('script', { src: API });
    script.onload = bind;
    script.onerror = () => {
      clearTimeout(late);
      script.remove();
      reject(new Error('lecteur SoundCloud injoignable'));
    };
    document.head.append(script);
  });
}
