// Radio Manif : la musique de fond passe par le lecteur officiel de SoundCloud.
// Les pistes sont listées dans `content/musiques/` (une fiche par piste, avec son lien).
// Rien n'est chargé depuis SoundCloud tant que la musique n'est pas activée ; hors-ligne,
// le jeu tourne simplement sans musique.
//
// Le lecteur ne prévient pas toujours qu'une piste ne joue pas : une piste retirée envoie ERROR,
// une piste chiffrée sans module de lecture n'envoie rien, une lecture refusée faute de geste du
// joueur envoie PAUSE aussitôt. La Radio attend donc que la lecture avance vraiment. Une piste
// morte cède la place à une autre ; une lecture refusée montre le bouton de relance, et le
// prochain toucher la relance ; un réseau lent, on l'attend.

import { h, link } from './dom.js';

const API = 'https://w.soundcloud.com/player/api.js';
const PLAYER = 'https://w.soundcloud.com/player/';
// Options du lecteur. `widget.load()` les réécrit en « true » ou « false » : la couleur n'y figure pas.
const OPTIONS = { auto_play: true, hide_related: true, show_comments: false, show_reposts: false, show_teaser: false };
const VOLUME = 45;
/** Le temps laissé au lecteur pour charger une piste (et lui-même, la première fois), réseau lent compris. */
export const LOAD_TIMEOUT = 45000;
/** Une fois la piste chargée, le temps laissé à la lecture pour partir avant qu'on demande au lecteur où il en est. */
export const START_TIMEOUT = 10000;
const RETRY_DELAY = 4000;
const PROBE_DELAY = 3000;
const MAX_WAITS = 6; // le lecteur dit « je joue » mais rien n'avance : six délais, une minute
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

/**
 * Une piste au hasard dans la première liste qui en a une qui marche ; `avoid` (celle qui vient de finir) en dernier.
 * Une piste qui en suit une autre (clé `puis`) ne se tire pas au hasard : elle vient après celle-là.
 */
export function chooseTrack(tracks, { slot, named = null, failed = new Set(), avoid = null, random = Math.random }) {
  const following = new Set(tracks.map((t) => t.puis).filter(Boolean));
  for (const pool of poolsFor(tracks, slot, named)) {
    const ok = pool.filter((t) => !failed.has(t.id));
    if (!ok.length) continue;
    const drawn = ok.filter((t) => !following.has(t.id) || t.id === named);
    const base = drawn.length ? drawn : ok;
    const fresh = base.filter((t) => t !== avoid);
    const from = fresh.length ? fresh : base;
    return from[Math.floor(random() * from.length)];
  }
  return null;
}

/** Les moments hors des niveaux : ils tirent au hasard (`chooseTrack`), sans sac. */
const NOT_A_LEVEL = new Set(['menu', 'boss']);

/**
 * Les pistes qu'un niveau peut jouer : les siennes (`ou` : le niveau, ou celle que nomme sa clé `musique`),
 * puis celles de tous les niveaux (`jeu`) et de partout. Une piste qui en suit une autre (`puis`) n'en est pas.
 */
export function levelTracks(tracks, slot, named = null, failed = new Set()) {
  const following = new Set(tracks.map((t) => t.puis).filter(Boolean));
  const usable = tracks.filter((t) => !failed.has(t.id) && !following.has(t.id));
  const own = usable.filter((t) => t.ou === slot || t.id === named);
  return { own, all: [...own, ...usable.filter((t) => !own.includes(t) && (t.ou === 'jeu' || t.ou === 'partout'))] };
}

/**
 * L'entrée dans un niveau : sa piste à lui (`ou` : le niveau, ou celle que nomme sa clé `musique`). S'il en a
 * plusieurs, une autre que celle de la visite d'avant (`last`) quand c'est possible ; jamais celle qu'on entend déjà
 * (`avoid`). Sans piste à lui : rien, le sac commence.
 */
export function openingTrack(tracks, { slot, named = null, failed = new Set(), last = null, avoid = null, random = Math.random }) {
  const own = levelTracks(tracks, slot, named, failed).own.filter((t) => t !== avoid);
  const fresh = own.filter((t) => t.id !== last);
  const from = fresh.length ? fresh : own;
  return from.length ? from[Math.floor(random() * from.length)] : null;
}

/**
 * La piste suivante d'un niveau : un sac. Toutes celles qu'il peut jouer (les siennes et celles de tous les
 * niveaux), au hasard, sans en rejouer une (`heard`) avant d'avoir entendu les autres ; jamais celle qu'on vient
 * d'entendre (`avoid`), s'il y en a une autre.
 */
export function nextLevelTrack(tracks, { slot, named = null, failed = new Set(), heard = new Set(), avoid = null, random = Math.random }) {
  const { all } = levelTracks(tracks, slot, named, failed);
  if (!all.length) return null;
  const pick = (list) => list[Math.floor(random() * list.length)];
  const bag = all.filter((t) => !heard.has(t.id) && t !== avoid);
  if (bag.length) return pick(bag);
  const others = all.filter((t) => t !== avoid); // le sac est vide : un nouveau tour
  return pick(others.length ? others : all);
}

/** Le cadre du lecteur SoundCloud pour une première piste. */
export function frameAttributes(track) {
  const params = new URLSearchParams({ url: track.url, color: '#e43b44', ...OPTIONS });
  return {
    title: 'Radio Manif — lecteur SoundCloud',
    // `encrypted-media` : certaines pistes sont chiffrées ; sans ce droit, le lecteur les charge mais reste muet.
    allow: 'autoplay; encrypted-media',
    scrolling: 'no',
    src: `${PLAYER}?${params}`,
  };
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
    this.view.onRetry = () => this.retry();
    this.enabled = false;
    this.status = 'off'; // off | loading | playing | paused | blocked (refusée, attend un geste) | unreachable (lecteur injoignable)
    this.widget = null;
    this.connecting = null;
    this.pending = null; // un chargement demandé au lecteur, qui n'a pas encore rappelé : { track, timer }
    this.current = null; // la piste chargée (ou en train de l'être)
    this.slot = 'menu';
    this.named = null;
    this.chosenFor = null; // le moment pour lequel `current` a été choisie
    this.visit = null; // la visite du niveau en cours : { key, track }, la piste de niveau qu'on y entend
    // En partie, les pistes tournent : `heard`, celles du tour en cours (le sac) ; `opened`, la piste à lui par
    // laquelle chaque niveau a commencé la dernière fois.
    this.heard = new Set();
    this.opened = new Map();
    this.lastHeard = new Map(); // la dernière piste vraiment entendue, par moment (les niveaux partagent la leur)
    this.failed = new Set(); // pistes qui n'ont pas voulu jouer ; le retour du réseau leur rend leur chance
    this.attempt = null; // une lecture demandée, pas encore confirmée : { track, loaded, refused, retried, waits }
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
    if (this.enabled && !was) this.tune();
  }

  /**
   * Lance la musique d'un moment du jeu : « menu », « boss », ou l'identifiant d'un niveau,
   * avec la piste que nomme le niveau s'il en nomme une.
   * @param {{ restart?: boolean }} [how]  `restart` : « Recommencer » ; la visite du niveau continue, sa musique avec.
   *   Sinon, chaque arrivée dans un niveau en commence une nouvelle visite (« Rejouer » après une victoire aussi).
   */
  play(slot, named = null, { restart = false } = {}) {
    const key = `${slot}|${named}`;
    const level = !NOT_A_LEVEL.has(slot);
    const back = level && restart && this.visit?.key === key;
    if (level && !back) this.visit = { key, track: null };
    this.slot = slot;
    this.named = named;
    if (!this.enabled) return;
    if (this.status === 'unreachable') return; // le bouton ou le retour du réseau réessaieront
    if (back) return this.comeBack();
    this.tune();
  }

  /**
   * La musique du moment présent. Une visite de niveau commence par sa piste à lui, s'il en a une ; ensuite (et sans
   * piste à lui), le sac ; jamais celle qu'on entend déjà en y entrant. Le menu et le boss tirent au hasard.
   */
  tune() {
    const key = `${this.slot}|${this.named}`;
    const level = !NOT_A_LEVEL.has(this.slot);
    const live = this.status === 'playing' || this.status === 'loading';
    if (!level && this.chosenFor === key && live) return; // toujours le même moment (le menu) : la musique continue
    const track = (level && !this.visit?.track && this.open()) || this.choose(level ? this.current : null);
    if (!track) return this.unreachable(); // plus aucune piste ne joue
    this.chosenFor = key;
    if (track !== this.current) return this.start(track);
    if (!live) this.resume();
  }

  /**
   * « Recommencer » : la piste de niveau de cette visite continue, ou revient après une mort au boss.
   * Une musique mise en pause, ou refusée par le navigateur, le reste, sur la même piste.
   */
  comeBack() {
    this.chosenFor = `${this.slot}|${this.named}`;
    if (this.status !== 'playing' && this.status !== 'loading') return;
    const track = this.visit.track;
    if (!track || this.failed.has(track.id)) return this.tune();
    if (track !== this.current) this.start(track);
  }

  choose(avoid = null) {
    const base = { slot: this.slot, named: this.named, failed: this.failed, avoid, random: this.env.random };
    if (NOT_A_LEVEL.has(this.slot)) return chooseTrack(this.tracks, base);
    // En partie : le sac des pistes du niveau ; s'il ne reste rien, n'importe laquelle plutôt que le silence.
    return nextLevelTrack(this.tracks, { ...base, heard: this.heard }) ?? chooseTrack(this.tracks, base);
  }

  /** L'entrée dans un niveau : sa piste à lui, une autre que la fois d'avant s'il en a plusieurs. */
  open() {
    const track = openingTrack(this.tracks, {
      slot: this.slot, named: this.named, failed: this.failed, last: this.opened.get(this.slot), avoid: this.current, random: this.env.random,
    });
    if (track) this.opened.set(this.slot, track.id);
    return track;
  }

  /** Une piste de niveau joue vraiment : elle sort du sac. Quand il est vide, un nouveau tour commence (sans elle). */
  heardNow(track) {
    if (NOT_A_LEVEL.has(this.slot)) return;
    this.heard.add(track.id);
    const { all } = levelTracks(this.tracks, this.slot, this.named, this.failed);
    if (all.every((t) => this.heard.has(t.id))) for (const t of all) if (t !== track) this.heard.delete(t.id);
  }

  /** Le moment du jeu, pour la dernière piste entendue : le menu, le boss, ou les niveaux (un seul sac). */
  moment() {
    return NOT_A_LEVEL.has(this.slot) ? this.slot : 'niveau';
  }

  /** La piste qui suit celle-ci (clé `puis`), si elle peut jouer. */
  following(track) {
    const next = track?.puis && this.tracks.find((t) => t.id === track.puis);
    return next && !this.failed.has(next.id) ? next : null;
  }

  /** Charge une piste ; le lecteur n'est créé qu'à la première. */
  start(track) {
    this.current = track;
    if (!NOT_A_LEVEL.has(this.slot) && this.visit) this.visit.track = track;
    this.status = 'loading';
    this.ownPause = false;
    // Tant que le lecteur n'a pas fini de charger cette piste, ce qu'il annonce vient de la précédente.
    this.watch(track, { loaded: false });
    this.render();
    if (this.widget) return this.load(track);
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
      if (this.connecting === pending) this.unreachable();
    });
  }

  /**
   * Demande une piste au lecteur, jamais par-dessus un chargement en cours : `widget.load()` remet le lecteur à zéro
   * et remplace l'attente du précédent. Si le « prêt » de l'ancien arrive entre les deux, le rappel part trop tôt et
   * le nouveau lecteur n'envoie plus rien. La piste demandée entre-temps (`current`) se charge au rappel.
   */
  load(track) {
    if (this.pending) return;
    const request = { track, timer: null };
    this.pending = request;
    this.widget.load(track.url, { ...OPTIONS, callback: () => this.called(request) });
  }

  /** Un chargement a rappelé. Une autre piste a été demandée entre-temps : c'est son tour. */
  called(request) {
    if (this.pending !== request) return; // oublié : le lecteur a été déclaré injoignable entre-temps
    this.forget();
    if (!this.enabled) {
      // Musique coupée pendant le chargement : la piste chargée partirait d'elle-même.
      this.ownPause = true;
      return this.widget.pause();
    }
    if (this.current !== request.track) return this.load(this.current);
    this.loaded(request.track);
  }

  forget() {
    if (this.pending?.timer) this.env.cancel(this.pending.timer);
    this.pending = null;
  }

  /** Le lecteur a chargé la piste demandée : à partir de maintenant, on attend qu'elle parte. */
  loaded(track) {
    this.widget?.setVolume(VOLUME);
    if (this.attempt?.track !== track || this.attempt.loaded) return;
    this.attempt.loaded = true;
    this.arm(START_TIMEOUT);
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

  watch(track, { loaded = true, retried = false } = {}) {
    this.cancelWatch();
    this.attempt = { track, loaded, refused: false, retried, waits: 0 };
    this.arm(loaded ? START_TIMEOUT : LOAD_TIMEOUT);
  }

  arm(ms) {
    if (this.timer !== null) this.env.cancel(this.timer);
    const attempt = this.attempt;
    this.timer = this.env.later(() => this.timeout(attempt), ms);
  }

  cancelWatch() {
    if (this.timer !== null) this.env.cancel(this.timer);
    this.timer = null;
    this.attempt = null;
  }

  /** Le délai est écoulé sans que la lecture avance : on demande au lecteur où il en est. */
  timeout(attempt) {
    this.timer = null;
    // Onglet caché : le navigateur peut retenir la lecture. Le délai repartira au retour.
    if (this.attempt !== attempt || this.hidden) return;
    // Ni le lecteur ni la piste n'ont répondu : réseau coupé, SoundCloud bloqué.
    if (!attempt.loaded) return this.unreachable();
    // Refusée par le navigateur, ou personne n'a encore touché la page : on attend un geste.
    if (attempt.refused || !this.env.activated()) return this.block();
    this.probe((state) => {
      if (this.attempt !== attempt) return;
      if (state === 'dead') return this.fail(attempt.track);
      if (state === 'paused') {
        // Chargée mais arrêtée, sans refus annoncé : on la relance une fois, puis on passe à une autre.
        if (attempt.retried) return this.fail(attempt.track);
        attempt.retried = true;
        this.widget.play();
        return this.arm(RETRY_DELAY);
      }
      // Le lecteur dit qu'il joue, ou ne répond pas encore : réseau lent, on patiente.
      if (++attempt.waits > MAX_WAITS) return this.fail(attempt.track);
      this.arm(START_TIMEOUT);
    });
  }

  /** Où en est le lecteur : « dead » (pas de piste), « paused », ou « busy » (il joue, ou ne répond pas). */
  probe(done) {
    const widget = this.widget;
    let answered = false;
    const answer = (state) => {
      if (answered) return;
      answered = true;
      done(state);
    };
    const late = this.env.later(() => answer('busy'), PROBE_DELAY);
    widget.getCurrentSound((sound) => widget.isPaused((paused) => {
      this.env.cancel(late);
      answer(!sound ? 'dead' : paused ? 'paused' : 'busy');
    }));
  }

  /**
   * Une piste qui ne joue pas (retirée, privée, chiffrée sans module de lecture) : on passe à une autre.
   * Toutes ont échoué (l'API de SoundCloud en panne, par exemple) : le lecteur est injoignable,
   * et seuls le bouton ou le retour du réseau réessaient ; un geste ne relance pas tout un tour.
   */
  fail(track) {
    this.failed.add(track.id);
    // Jamais la dernière piste entendue à ce moment-là, même quand la piste en échec était la dernière du sac.
    const last = this.lastHeard.get(this.moment()) ?? null;
    if (!NOT_A_LEVEL.has(this.slot)) {
      // L'échec a pu finir le tour : le suivant commence, la dernière entendue déjà comptée.
      const { all } = levelTracks(this.tracks, this.slot, this.named, this.failed);
      if (all.every((t) => this.heard.has(t.id))) for (const t of all) if (t !== last) this.heard.delete(t.id);
    }
    const next = this.following(track) ?? this.choose(last);
    if (next) this.start(next);
    else this.unreachable();
  }

  block() {
    this.cancelWatch();
    this.status = 'blocked';
    this.render();
  }

  /** Le lecteur ne répond pas, ou plus aucune piste ne joue : on joue sans musique. Le bouton, ou le retour du réseau, réessaieront. */
  unreachable() {
    this.cancelWatch();
    this.forget(); // un chargement qui n'a jamais rappelé ne bloque pas le prochain essai
    if (!this.widget) {
      this.connecting = null;
      this.view.unmount();
    }
    this.status = 'unreachable';
    this.render();
  }

  /** Un geste du joueur (toucher, clic, touche) : relance une lecture que le navigateur avait refusée. */
  unblock() {
    if (!this.enabled || this.status !== 'blocked') return;
    const track = this.current && !this.failed.has(this.current.id) ? this.current : this.choose();
    if (!track) return;
    if (!this.widget || track !== this.current) return this.start(track);
    this.status = 'loading';
    this.ownPause = false;
    this.watch(track, { retried: true });
    this.widget.play(); // pendant le geste, ou juste après : c'est ce qui l'autorise
    this.render();
  }

  /** Le bouton de Radio Manif : relance une lecture refusée, ou retente un lecteur injoignable. */
  retry() {
    if (!this.enabled) return;
    if (this.status === 'blocked') return this.unblock();
    if (this.status !== 'unreachable') return;
    if (!this.choose()) this.failed.clear(); // plus rien ne jouait : on retente tout
    // La musique du moment présent (le jeu a pu avancer entre-temps), chargée à neuf.
    const track = this.choose();
    if (!track) return;
    this.chosenFor = `${this.slot}|${this.named}`;
    this.start(track);
  }

  /**
   * Le réseau revient : les pistes écartées retrouvent leur chance, et un chargement resté en plan repart.
   * Pas par-dessus celui en cours : il a encore le temps de rappeler ; sinon, on recharge.
   */
  reconnected() {
    this.failed.clear();
    if (!this.enabled) return;
    if (this.status === 'unreachable') return this.retry();
    if (this.status !== 'loading' || !this.widget || this.attempt?.loaded) return;
    const request = this.pending;
    if (!request) return this.start(this.current);
    if (request.timer) this.env.cancel(request.timer);
    request.timer = this.env.later(() => {
      request.timer = null;
      if (this.pending !== request || !this.enabled) return;
      this.forget();
      this.start(this.current);
    }, START_TIMEOUT);
  }

  /** Ce que le lecteur SoundCloud annonce. */
  event(name, data = {}) {
    if (!this.enabled) return;
    // Une erreur après une demande de piste : elle est morte, une autre tout de suite.
    // (Le lecteur l'annonce avant même d'avoir fini de charger.)
    if (name === 'ERROR') return this.attempt && this.fail(this.attempt.track);
    if (this.attempt && !this.attempt.loaded) return; // encore la piste d'avant
    if (name === 'FINISH') {
      const next = this.following(this.current) ?? this.choose(this.current);
      return next ? this.start(next) : this.unreachable();
    }
    if (name === 'PLAY') {
      this.ownPause = false;
      // Relancée d'ailleurs (le bouton du lecteur, le système) : on vérifie qu'elle avance.
      if (!this.attempt && this.current && this.status !== 'playing') this.watch(this.current, { retried: true });
    }
    // Une lecture demandée avance : elle joue vraiment. (Sans demande en cours, un reste d'avant une pause.)
    if (name === 'PLAY_PROGRESS' && data.currentPosition > 0 && this.attempt && !this.ownPause) {
      this.heardNow(this.attempt.track); // entendue pour de bon : elle sort du sac
      this.lastHeard.set(this.moment(), this.attempt.track);
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
    if (this.attempt && this.timer === null) this.arm(this.attempt.loaded ? START_TIMEOUT : LOAD_TIMEOUT); // délai tombé onglet caché
    const stopped = this.status === 'paused' || this.status === 'blocked';
    if (this.wanted && stopped && this.current && !this.failed.has(this.current.id)) this.resume();
    this.wanted = false;
  }

  /**
   * Pendant l'action, le lecteur continue de jouer mais quitte l'écran.
   * @param {boolean} on  le panneau peut se montrer (menus, pause)
   * @param {boolean} inGame  une partie est en cours (le bouton pause est à l'écran)
   */
  setVisible(on, inGame = false) {
    this.view.setVisible(on, inGame);
  }

  render(possible = this.tracks.length > 0 && this.env.online()) {
    this.view.show({ possible, enabled: this.enabled, status: this.status, track: this.current });
  }
}

// En pause, la place qu'il faut au lecteur dans la marge de l'écran de pause, et ce qui l'entoure (px).
const ROOM = 90;
const SHADOW = 8; // l'ombre de l'écran de pause
const GAP = 12;
const BUTTON = 8 + 27 + 4; // le bouton seul, à côté de la pause : sa hauteur et ses marges
const TOP = 52; // sous le bouton pause

/** Le panneau de Radio Manif : un bouton tant que rien n'est chargé, puis le lecteur et sa piste. */
class RadioPanel {
  constructor(box) {
    this.box = box;
    this.frame = null;
    // Les marges de sécurité de l'écran (encoche, barre d'accueil), lues par la feuille de style.
    this.probe = h('i', { className: 'radio-marges' });
    document.body.append(this.probe);
    const screen = document.getElementById('ecran');
    if (screen) new MutationObserver(() => this.fit()).observe(screen, { childList: true });
    addEventListener('resize', () => requestAnimationFrame(() => this.fit()));
  }

  mount(frame) {
    this.frame = frame;
    this.caption = h('p', {});
    // Le texte se raccourcit selon la place : « ▶ Relancer la musique », « ▶ Relancer », ou « ▶♪ » sous le bouton pause.
    this.retry = h('button', { type: 'button', className: 'relance', hidden: true, title: 'Relancer la musique', onclick: () => this.onRetry() },
      '▶', h('span', { className: 'mot' }, ' Relancer'), h('span', { className: 'suite' }, ' la musique'), h('span', { className: 'note' }, '♪'));
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
    const stuck = enabled && (status === 'blocked' || status === 'unreachable');
    this.box.classList.toggle('bloquee', Boolean(this.frame) && stuck);
    if (!this.frame) {
      // Tant que le joueur n'a rien demandé, aucun lecteur n'est chargé : juste un bouton.
      // (Musique demandée mais lecteur injoignable : le même bouton réessaie.)
      if (this.box.querySelector('[data-radio]')) return;
      const ask = h('button', { type: 'button', onclick: () => (this.enabled ? this.onRetry() : this.onAsk()) }, '▶ Radio Manif');
      ask.dataset.radio = 'demande';
      this.box.replaceChildren(ask, h('p', {}, 'Musique par SoundCloud'));
      return;
    }
    this.retry.hidden = !stuck;
    const label = track ? `${track.titre} — ${track.artiste}` : '';
    if (this.caption.textContent !== label) this.caption.replaceChildren(track ? link(track.url, label) : '');
    this.fit();
  }

  /**
   * Où poser le lecteur bloqué sans rien recouvrir.
   * En pause : dans la marge à droite de l'écran de pause s'il y tient ; sinon (au clavier) son seul
   * bouton à côté de la pause, s'il reste de la place au-dessus ; sinon nulle part (le prochain toucher
   * relance la musique quand même). En partie, au pouce : sous le bouton pause, à sa taille.
   * Tout se mesure dans le sens du jeu : pivoté, le haut du jeu est à droite du téléphone, et sa droite en bas.
   */
  fit() {
    const pivoted = document.documentElement.classList.contains('pivote');
    const thumbs = document.body.classList.contains('tactile');
    const game = (r) => (pivoted
      ? { top: innerWidth - r.right, bottom: innerWidth - r.left, right: innerHeight - r.bottom }
      : { top: r.top, bottom: r.bottom, right: innerWidth - r.right });
    const shown = (el) => (el && !el.hidden && el.getClientRects().length ? el.getBoundingClientRect() : null);
    const pauseRect = shown(document.getElementById('pause'));
    const pause = pauseRect && pauseRect.width ? game(pauseRect) : null;
    const bandRect = shown(document.getElementById('bandeau'));
    const gameHeight = pivoted ? innerWidth : innerHeight;
    const band = bandRect && game(bandRect).bottom < gameHeight / 2 ? game(bandRect).bottom : 0; // au pouce, le bandeau est en haut
    const panel = document.querySelector('#ecran > .pause');
    let place = '';
    let width = 0;
    let top = TOP;
    if (panel) {
      const p = game(panel.getBoundingClientRect());
      const inset = getComputedStyle(this.probe);
      const safe = parseFloat(pivoted ? inset.paddingBottom : inset.paddingRight) || 0;
      width = p.right - SHADOW - GAP - Math.max(10, safe);
      if (width >= ROOM) place = 'en-marge';
      else if (!thumbs && p.top >= BUTTON) place = 'en-haut';
      top = Math.ceil(Math.max(TOP, band ? band + 6 : 0, pause ? pause.bottom + 6 : 0));
    }
    this.box.classList.toggle('en-marge', place === 'en-marge');
    this.box.classList.toggle('en-haut', place === 'en-haut');
    this.box.classList.toggle('serre', place === 'en-marge' && width < 170); // « ▶ Relancer », sans « la musique »
    this.box.style.setProperty('--radio-place', `${Math.floor(Math.min(320, Math.max(width, 0)))}px`);
    this.box.style.setProperty('--radio-haut', `${top}px`);
    if (pause) {
      this.box.style.setProperty('--radio-sous-pause', `${Math.ceil(pause.bottom + 6)}px`);
      this.box.style.setProperty('--radio-droite', `${Math.floor(pause.right)}px`);
      this.box.style.setProperty('--radio-police', getComputedStyle(document.getElementById('pause')).fontSize);
    }
  }

  setVisible(on, inGame) {
    this.box.classList.toggle('cache', !on);
    this.box.classList.toggle('partie', inGame);
  }
}

/** Charge le lecteur SoundCloud dans le panneau, avec sa première piste. */
function connectWidget(track, onEvent, view) {
  return new Promise((resolve, reject) => {
    const frame = h('iframe', frameAttributes(track));
    view.mount(frame);
    const bind = () => {
      // Un portail captif peut servir une page à la place du script : pas de lecteur, pas d'erreur de chargement.
      if (!window.SC?.Widget) return reject(new Error('lecteur SoundCloud introuvable'));
      const widget = window.SC.Widget(frame);
      const names = window.SC.Widget.Events;
      for (const name of EVENTS) widget.bind(names[name], (data) => onEvent(name, data));
      widget.bind(names.READY, () => resolve(widget));
    };
    if (window.SC?.Widget) return bind();
    const script = h('script', { src: API });
    script.onload = bind;
    script.onerror = () => {
      script.remove();
      reject(new Error('lecteur SoundCloud injoignable'));
    };
    document.head.append(script);
  });
}
