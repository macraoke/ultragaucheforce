// Radio Manif : la musique de fond passe par le lecteur officiel de SoundCloud.
// Les pistes sont listées dans `content/musiques/` (une fiche par piste, avec son lien).
// Le lecteur se charge à l'ouverture de la page, même musique coupée (Valentin, 17 novembre 2026 :
// « Précharger le lecteur ») : le toucher qui la demande la lance aussitôt, dans son geste. Musique
// coupée, il reste muet et caché. Hors-ligne, le jeu tourne simplement sans musique.
//
// Le lecteur ne prévient pas toujours qu'une piste ne joue pas : une piste retirée envoie ERROR,
// une piste chiffrée sans module de lecture n'envoie rien, une lecture refusée faute de geste du
// joueur envoie PAUSE aussitôt. La Radio attend donc que la lecture avance vraiment. Une piste
// morte cède la place à une autre ; une lecture refusée montre le bouton de relance, et le
// prochain toucher la relance ; un réseau lent, on l'attend.

import { h, link } from './dom.js';
import { measure } from './mesure.js';

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
/** Ce que disent le panneau et le menu de pause quand le script de SoundCloud n'a pas pu se charger (bloqueur, réseau). */
export const BLOCKED_MESSAGE = 'Un bloqueur empêche SoundCloud de jouer. Autorise w.soundcloud.com pour écouter la Radio Manif.';
const EVENTS = ['READY', 'PLAY', 'PLAY_PROGRESS', 'PAUSE', 'FINISH', 'ERROR'];
/** Le temps laissé au lecteur pour dire son volume avant qu'un événement parte sans. */
const VOLUME_DELAY = 500;
/** Le lecteur envoie PAUSE juste avant FINISH en fin de piste : une pause au lecteur ne se compte qu'après ce délai. */
export const PAUSE_REPORT_DELAY = 1000;

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
 * Une piste au hasard dans la première liste qui en a une qui marche ; `avoid` (celle qui vient de finir, ou une
 * liste) en dernier. Une piste qui en suit une autre (clé `puis`) ne se tire pas au hasard : elle vient après celle-là.
 */
export function chooseTrack(tracks, { slot, named = null, failed = new Set(), avoid = null, random = Math.random }) {
  const following = new Set(tracks.map((t) => t.puis).filter(Boolean));
  const avoided = [avoid].flat();
  for (const pool of poolsFor(tracks, slot, named)) {
    const ok = pool.filter((t) => !failed.has(t.id));
    if (!ok.length) continue;
    const drawn = ok.filter((t) => !following.has(t.id) || t.id === named);
    const base = drawn.length ? drawn : ok;
    const fresh = base.filter((t) => !avoided.includes(t));
    const from = fresh.length ? fresh : base;
    return from[Math.floor(random() * from.length)];
  }
  return null;
}

/** Les moments hors des niveaux : ils tirent au hasard (`chooseTrack`), sans sac. Le boss peut nommer sa première piste. */
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
 * L'entrée dans un niveau. La piste que nomme sa clé `musique` ouvre chaque visite, tant qu'elle joue ; si on
 * l'entend déjà en y entrant, elle continue. Sans elle, sa piste à lui (`ou` : le niveau) : s'il en a plusieurs, une
 * autre que celle de la visite d'avant (`last`) quand c'est possible ; jamais celle qu'on entend déjà (`avoid`).
 * Sans piste à lui : rien, le sac commence.
 */
export function openingTrack(tracks, { slot, named = null, failed = new Set(), last = null, avoid = null, random = Math.random }) {
  const mine = levelTracks(tracks, slot, named, failed).own;
  const fixed = named && mine.find((t) => t.id === named);
  if (fixed) return fixed;
  const own = mine.filter((t) => t !== avoid);
  const fresh = own.filter((t) => t.id !== last);
  const from = fresh.length ? fresh : own;
  return from.length ? from[Math.floor(random() * from.length)] : null;
}

/**
 * La piste suivante d'un niveau : un sac. Toutes celles qu'il peut jouer (les siennes et celles de tous les
 * niveaux), au hasard, sans en rejouer une (`heard`) avant d'avoir entendu les autres ; jamais celle qu'on vient
 * d'entendre (`avoid`, ou une liste), s'il y en a une autre.
 */
export function nextLevelTrack(tracks, { slot, named = null, failed = new Set(), heard = new Set(), avoid = null, random = Math.random }) {
  const { all } = levelTracks(tracks, slot, named, failed);
  if (!all.length) return null;
  const avoided = [avoid].flat();
  const pick = (list) => list[Math.floor(random() * list.length)];
  const bag = all.filter((t) => !heard.has(t.id) && !avoided.includes(t));
  if (bag.length) return pick(bag);
  const others = all.filter((t) => !avoided.includes(t)); // le sac est vide : un nouveau tour
  return pick(others.length ? others : all);
}

/** Le cadre du lecteur SoundCloud pour une première piste ; préchargé musique coupée, il ne part pas de lui-même. */
export function frameAttributes(track, { autoPlay = true } = {}) {
  const params = new URLSearchParams({ url: track.url, color: '#e43b44', ...OPTIONS, auto_play: autoPlay });
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
      inGesture: () => navigator.userActivation?.isActive ?? false, // un toucher, un clic ou une touche, à l'instant
      connect: connectWidget,
      measure,
      ...env,
    };
    this.view = this.env.view || new RadioPanel(box);
    this.view.onAsk = () => this.onAsk();
    this.view.onRetry = () => this.retry();
    this.view.onNext = () => this.next();
    this.view.onPause = () => this.togglePause();
    this.enabled = false;
    this.status = 'off'; // off | loading | playing | paused | blocked (refusée, attend un geste) | unreachable (lecteur injoignable)
    this.widget = null;
    this.connecting = null;
    this.pending = null; // un chargement demandé au lecteur, qui n'a pas encore rappelé : { track, timer }
    this.current = null; // la piste chargée (ou en train de l'être)
    this.slot = 'menu';
    this.named = null;
    this.chosenFor = null; // le moment pour lequel `current` a été choisie
    this.visit = null; // la visite du niveau en cours : { key, track, queue }, la piste de niveau qu'on y entend, et celles qui la suivent
    // En partie, les pistes tournent : `heard`, celles du tour en cours (le sac) ; `opened`, la piste à lui par
    // laquelle chaque niveau a commencé la dernière fois.
    this.heard = new Set();
    this.opened = new Map();
    this.lastHeard = new Map(); // la dernière piste vraiment entendue, par moment (les niveaux partagent la leur)
    this.lastShared = null; // la dernière piste de tous les niveaux (`jeu`, `partout`) vraiment entendue
    this.failed = new Set(); // pistes qui n'ont pas voulu jouer ; le retour du réseau leur rend leur chance
    this.attempt = null; // une lecture demandée, pas encore confirmée : { track, loaded, refused, retried, waits }
    this.timer = null;
    this.ownPause = false; // la pause vient de nous (musique coupée) : son PAUSE n'est pas un refus
    this.hidden = false;
    this.wanted = false; // la musique jouait quand l'onglet a été caché
    this.held = false; // le joueur a mis Radio Manif en pause (⏸) : rien ne la relance avant qu'il la remette
    this.silenced = false; // en pause, le lecteur s'est bien tu : une lecture qui repart ensuite vient du joueur
    this.gesture = false; // un geste reçu pendant un chargement : la lecture part dès que le lecteur est prêt
    this.lazy = false; // ce navigateur refuse une piste chargée hors d'un geste, même après le premier (Safari)
    this.lost = false; // le lecteur n'a pas pu se charger (réseau coupé, script de SoundCloud bloqué)
    this.onAsk = () => {}; // le joueur demande la musique : à main.js d'enregistrer ce choix
    // L'écoute de la piste chargée, pour la mesure : { track, cause, started, position (ms), relative (0 à 1) }.
    // `cause` : pourquoi elle a été chargée (« auto », « suivante », « enchainee », « remplacement », « relance »).
    this.listen = null;
    this.why = 'auto'; // la cause de la prochaine piste chargée
    this.reportedBlocked = false; // le lecteur bloqué ne se compte qu'une fois par visite
    // Une pause au bouton du lecteur SoundCloud : `pending`, pas encore comptée (une fin de piste l'annule) ;
    // `counted`, comptée : la reprise au même bouton se compte aussi.
    this.playerPause = null; // { timer, counted }
  }

  /** Une pause au bouton du lecteur : comptée dans un instant, sauf si la piste finit (sa PAUSE de fin) ou repart. */
  deferPlayerPause() {
    this.dropPlayerPause();
    const properties = { ...this.about(), ...this.heardOf(this.current), via: 'lecteur' };
    const pause = { timer: null, counted: false };
    pause.timer = this.env.later(() => {
      pause.timer = null;
      if (this.playerPause !== pause) return;
      pause.counted = true;
      this.report('music_paused', properties, { volume: true });
    }, PAUSE_REPORT_DELAY);
    this.playerPause = pause;
  }

  dropPlayerPause() {
    if (this.playerPause?.timer) this.env.cancel(this.playerPause.timer);
    this.playerPause = null;
  }

  /** Les propriétés communes des événements de musique : la piste, le moment du jeu, et le niveau s'il y en a un. */
  about(track = this.current) {
    const properties = { track: track?.id ?? null, slot: this.moment() };
    if (properties.slot === 'niveau') properties.level = this.slot;
    return properties;
  }

  /** Où en était l'écoute de cette piste : secondes écoutées depuis son début, et pour cent de sa durée si connue. */
  heardOf(track) {
    const listen = this.listen?.track === track ? this.listen : null;
    const out = { seconds: Math.round((listen?.position ?? 0) / 1000) };
    if (listen?.relative != null) out.percent = Math.round(listen.relative * 100);
    return out;
  }

  /**
   * Compte un événement de musique ; avec `volume`, le volume du lecteur SoundCloud (0 à 100), s'il le dit à temps.
   * Le lecteur n'annonce pas ses changements de volume : on le lui demande au moment d'un ⏭, d'une pause, d'une fin.
   */
  report(event, properties, { volume = false } = {}) {
    const send = (level) => {
      if (level != null && Number.isFinite(Number(level))) properties.volume = Math.round(Number(level));
      this.env.measure(event, properties);
    };
    const widget = this.widget;
    if (!volume || typeof widget?.getVolume !== 'function') return send(null);
    let done = false;
    const once = (level) => {
      if (done) return;
      done = true;
      this.env.cancel(late);
      send(level);
    };
    const late = this.env.later(() => once(null), VOLUME_DELAY);
    try {
      widget.getVolume(once);
    } catch {
      once(null);
    }
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
    if (this.enabled && !was) {
      this.held = false; // remise par les options : elle repart
      this.tune();
    }
  }

  /**
   * Lance la musique d'un moment du jeu : « menu », « boss », ou l'identifiant d'un niveau, avec la piste que nomme
   * le niveau s'il en nomme une (sa clé `musique` ; au boss, sa clé `musique-boss`). Un niveau peut en nommer
   * plusieurs (`musique` répétée) : la première ouvre la visite, les autres suivent dans l'ordre, puis le sac.
   * @param {{ restart?: boolean }} [how]  `restart` : « Recommencer » ; la visite du niveau continue, sa musique avec.
   *   Sinon, chaque arrivée dans un niveau en commence une nouvelle visite (« Rejouer » après une victoire aussi).
   */
  play(slot, named = null, { restart = false } = {}) {
    const names = [named ?? []].flat().filter(Boolean);
    named = names[0] ?? null;
    const key = `${slot}|${named}`;
    const level = !NOT_A_LEVEL.has(slot);
    const back = level && restart && this.visit?.key === key;
    if (level && !back) this.visit = { key, track: null, queue: names.slice(1) };
    this.slot = slot;
    this.named = named;
    if (!this.enabled) return this.preload();
    if (this.held) return; // en pause : ni un niveau, ni le boss, ni « Recommencer » ne la relancent
    if (this.status === 'unreachable') return; // le bouton ou le retour du réseau réessaieront
    if (back) return this.comeBack();
    this.tune();
  }

  /**
   * La musique du moment présent. Une visite de niveau commence par sa piste à lui, s'il en a une ; ensuite (et sans
   * piste à lui), le sac. Le menu et le boss commencent par leur piste d'ouverture, puis tirent au hasard.
   */
  tune() {
    const key = `${this.slot}|${this.named}`;
    const level = !NOT_A_LEVEL.has(this.slot);
    const live = this.status === 'playing' || this.status === 'loading';
    if (!level && this.chosenFor === key && live) return; // toujours le même moment (le menu) : la musique continue
    // Toujours le même moment, rien ne joue (le lecteur préchargé, une musique remise) : la piste chargée part, dans ce geste.
    const same = !level && this.chosenFor === key && this.current && !this.failed.has(this.current.id);
    const track = same ? this.current : (level ? !this.visit?.track && this.open() : this.opener()) || this.choose(level ? this.current : null);
    if (!track) return this.unreachable(); // plus aucune piste ne joue
    this.chosenFor = key;
    if (level && this.visit && !this.visit.track) this.visit.track = track; // la piste nommée, qu'on entendait déjà
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

  /**
   * Ce qui guide un tirage. Au boss, la piste nommée n'ouvre que l'arrivée (`opener`) : la suite tire au hasard,
   * sans revenir à elle.
   */
  draw(avoid = null) {
    const named = NOT_A_LEVEL.has(this.slot) ? null : this.named;
    return { slot: this.slot, named, failed: this.failed, avoid, random: this.env.random };
  }

  choose(avoid = null) {
    const base = this.draw(avoid);
    if (NOT_A_LEVEL.has(this.slot)) return chooseTrack(this.tracks, base);
    // En partie : le sac des pistes du niveau ; s'il ne reste rien, n'importe laquelle plutôt que le silence.
    return nextLevelTrack(this.tracks, { ...base, heard: this.heard }) ?? chooseTrack(this.tracks, base);
  }

  /**
   * L'arrivée au menu ou au boss : la piste que nomme le niveau (`musique-boss`), si elle joue ; sinon sa piste
   * d'ouverture (`ouverture: oui`) ; sinon, le hasard. Sa suite (`puis`) vient à sa fin, comme pour toute piste.
   */
  opener() {
    const named = this.named && this.tracks.find((t) => t.id === this.named);
    if (named && !this.failed.has(named.id)) return named;
    const own = this.tracks.filter((t) => t.ou === this.slot && t.ouverture && !this.failed.has(t.id));
    return own.length ? own[Math.floor(this.env.random() * own.length)] : null;
  }

  /** L'entrée dans un niveau : sa piste à lui, une autre que la fois d'avant s'il en a plusieurs. */
  open() {
    // La première piste nommée a échoué : la suivante de la liste du niveau ouvre la visite.
    if (this.named && this.failed.has(this.named)) {
      const listed = this.listed();
      if (listed) return listed;
    }
    const track = openingTrack(this.tracks, {
      slot: this.slot, named: this.named, failed: this.failed, last: this.opened.get(this.slot), avoid: this.current, random: this.env.random,
    });
    if (track) this.opened.set(this.slot, track.id);
    return track;
  }

  /** La piste joue pour de bon : la première fois depuis son chargement, elle se compte. Une reprise après pause, non. */
  confirmed(track) {
    if (this.listen?.track !== track) this.listen = { track, cause: 'auto', started: false, position: 0, relative: null }; // préchargée
    if (this.listen.started) return;
    this.listen.started = true;
    this.report('music_started', { ...this.about(track), cause: this.listen.cause });
  }

  /** Une piste de niveau joue vraiment : elle sort du sac. */
  heardNow(track) {
    if (NOT_A_LEVEL.has(this.slot)) return;
    this.heard.add(track.id);
    if (track.ou === 'jeu' || track.ou === 'partout') this.lastShared = track;
    this.refill();
  }

  /**
   * Le sac du niveau est vide (tout entendu, ou la dernière piste a échoué) : un nouveau tour. Il garde, déjà
   * comptées, la dernière piste entendue, quel que soit son niveau, et la dernière des pistes de tous les niveaux
   * (`jeu`, `partout`) : des pistes à eux entendues entre-temps ne la font pas revenir en tête du tour.
   */
  refill() {
    const { all } = levelTracks(this.tracks, this.slot, this.named, this.failed);
    if (!all.every((t) => this.heard.has(t.id))) return;
    const keep = [this.lastHeard.get('niveau'), this.lastShared];
    for (const t of all) if (!keep.includes(t)) this.heard.delete(t.id);
  }

  /** Le moment du jeu, pour la dernière piste entendue : le menu, le boss, ou les niveaux (un seul sac). */
  moment() {
    return NOT_A_LEVEL.has(this.slot) ? this.slot : 'niveau';
  }

  /**
   * En niveau, la piste suivante de la liste que nomme sa clé `musique` (après la première), si elle peut jouer :
   * elle sort de la liste, qu'elle vienne à la fin d'une piste, d'un ⏭ ou d'un échec. Liste épuisée : rien, le sac.
   */
  listed() {
    const queue = !NOT_A_LEVEL.has(this.slot) && this.visit?.queue;
    while (queue?.length) {
      const track = this.tracks.find((t) => t.id === queue[0]);
      queue.shift();
      if (track && !this.failed.has(track.id)) return track;
    }
    return null;
  }

  /** La piste qui suit celle-ci (clé `puis`), si elle peut jouer. */
  following(track) {
    const next = track?.puis && this.tracks.find((t) => t.id === track.puis);
    return next && !this.failed.has(next.id) ? next : null;
  }

  /** Charge une piste ; le lecteur n'est créé qu'à la première. */
  start(track) {
    this.current = track;
    this.listen = { track, cause: this.why, started: false, position: 0, relative: null };
    this.why = 'auto';
    if (!NOT_A_LEVEL.has(this.slot) && this.visit) this.visit.track = track;
    this.status = 'loading';
    this.ownPause = false;
    // Tant que le lecteur n'a pas fini de charger cette piste, ce qu'il annonce vient de la précédente.
    this.watch(track, { loaded: false });
    this.render();
    if (this.widget) return this.load(track);
    if (this.connecting) return; // le lecteur arrive : il prendra la piste courante une fois prêt
    this.connect(track);
  }

  /**
   * Musique coupée : le lecteur se charge quand même, muet, avec la piste du moment. Le toucher qui demande la
   * musique n'a plus qu'à la lancer, dans son geste : Safari refuse une lecture lancée une seconde plus tard.
   */
  preload() {
    if (this.widget || this.connecting || !this.tracks.length || !this.env.online()) return;
    const track = this.opener() || this.choose();
    if (!track) return;
    this.current = track;
    this.chosenFor = `${this.slot}|${this.named}`;
    this.connect(track, { autoPlay: false });
    this.render();
  }

  /** Crée le lecteur avec sa première piste. Préchargé, il ne part pas de lui-même : on le lance s'il le faut. */
  connect(track, { autoPlay = true } = {}) {
    const pending = this.env.connect(track, (name, data) => this.event(name, data), this.view, { autoPlay });
    this.connecting = pending;
    this.lost = false;
    pending.then((widget) => {
      if (this.connecting !== pending) return;
      this.widget = widget;
      const played = this.loaded(track); // un geste reçu entre-temps : déjà lancée
      if (!this.enabled || this.held) {
        this.ownPause = true;
        widget.pause();
      } else if (this.current !== track) this.start(this.current); // une autre piste a été demandée entre-temps
      else if (!autoPlay && !played) this.send(); // préchargé, puis demandé avant d'être prêt
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
    if (!this.enabled || this.held) {
      // Musique coupée, ou mise en pause, pendant le chargement : la piste chargée partirait d'elle-même.
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
  /** @returns {boolean} la lecture vient d'être demandée au lecteur (un geste arrivé pendant le chargement) */
  loaded(track) {
    this.widget?.setVolume(VOLUME);
    if (this.attempt?.track !== track || this.attempt.loaded) return false;
    this.attempt.loaded = true;
    this.arm(START_TIMEOUT);
    if (this.gesture && this.widget) {
      // Un toucher arrivé avant que le lecteur soit prêt : on lui en fait part maintenant. Chrome l'accepte ;
      // Safari peut refuser hors du geste, et le toucher suivant la lancera.
      this.gesture = false;
      return this.send();
    }
    return false;
  }

  /**
   * Demande la lecture au lecteur, une seule fois par essai : un second play() pendant le démarrage fait répondre
   * PAUSE au lecteur, et la Radio y lirait un refus. (Après un refus annoncé, `event` et `timeout` relancent eux-mêmes.)
   * @returns {boolean} la demande est partie
   */
  send() {
    if (!this.widget || this.attempt?.played) return false;
    if (this.attempt) this.attempt.played = true;
    this.widget.play();
    return true;
  }

  /** Reprend la piste chargée. */
  resume() {
    if (!this.widget) return this.start(this.current);
    this.status = 'loading';
    this.ownPause = false;
    this.watch(this.current, { gesture: this.env.inGesture() });
    this.send();
    this.render();
  }

  /** Arrête sans rien oublier : la piste reste chargée. */
  halt() {
    this.cancelWatch();
    if (!this.widget) return;
    this.ownPause = true;
    this.widget.pause();
  }

  /** `gesture` : la lecture a été demandée au lecteur pendant un geste du joueur. */
  watch(track, { loaded = true, retried = false, gesture = false } = {}) {
    this.cancelWatch();
    this.attempt = { track, loaded, refused: false, retried, waits: 0, gesture, played: false };
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
      if (state === 'dead') return this.fail(attempt.track, 'absente');
      if (state === 'paused') {
        // Chargée mais arrêtée, sans refus annoncé : on la relance une fois, puis on passe à une autre.
        if (attempt.retried) return this.fail(attempt.track, 'arretee');
        attempt.retried = true;
        this.widget.play();
        return this.arm(RETRY_DELAY);
      }
      // Le lecteur dit qu'il joue, ou ne répond pas encore : réseau lent, on patiente.
      if (++attempt.waits > MAX_WAITS) return this.fail(attempt.track, 'muette');
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
  fail(track, reason = 'erreur') {
    this.failed.add(track.id);
    this.report('music_failed', { ...this.about(track), reason });
    this.why = 'remplacement';
    // Jamais la dernière piste entendue à ce moment-là, même quand la piste en échec était la dernière du sac.
    if (!NOT_A_LEVEL.has(this.slot)) this.refill(); // l'échec a pu finir le tour
    const next = this.listed() ?? this.following(track) ?? this.choose(this.lastHeard.get(this.moment()) ?? null);
    if (next) this.start(next);
    else {
      this.why = 'auto';
      this.unreachable();
    }
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
      this.lost = true;
      this.view.unmount();
      // Le message du bloqueur s'affiche (`BLOCKED_MESSAGE`) : compté une fois par visite.
      if (!this.reportedBlocked) {
        this.reportedBlocked = true;
        this.report('music_blocked', { online: this.env.online() });
      }
    }
    if (!this.enabled) return this.render(); // le préchargement a échoué : la musique demandée réessaiera
    this.status = 'unreachable';
    this.render();
    this.onUnreachable?.();
  }

  /** Un geste du joueur (toucher, clic, touche) : relance une lecture que le navigateur avait refusée. */
  unblock() {
    if (!this.enabled || this.held) return;
    if (this.status === 'loading') {
      // Déjà demandée (pendant ce geste, ou au lecteur préchargé dès qu'il est prêt) : pas de second play().
      if (this.attempt?.played || this.attempt?.gesture) return;
      // Chargée, pas encore partie : le geste passe au lecteur (Safari ne lance une piste que pendant un geste).
      if (this.attempt?.loaded && this.widget) return void this.send();
      this.gesture = true; // pas encore prête : on s'en souvient
      return;
    }
    if (this.status !== 'blocked') return;
    const track = this.current && !this.failed.has(this.current.id) ? this.current : this.choose();
    if (!track) return;
    if (!this.widget || track !== this.current) return this.start(track);
    this.status = 'loading';
    this.ownPause = false;
    this.watch(track, { retried: true, gesture: this.env.inGesture() });
    this.send(); // pendant le geste, ou juste après : c'est ce qui l'autorise
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
    this.why = 'relance';
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
    if (name === 'ERROR') return this.attempt && this.fail(this.attempt.track, 'erreur');
    if (this.held) {
      // En pause : notre propre pause, confirmée ; puis une lecture qui repart, c'est le joueur, au bouton du
      // lecteur SoundCloud : la pause est levée. (Avant la confirmation, un reste de la piste qui se chargeait.)
      // Seul PLAY compte : le lecteur envoie encore un « ça avance » juste après sa pause.
      if (name === 'PAUSE') this.silenced = true;
      if (name !== 'PLAY' || !this.silenced) return;
      this.report('music_resumed', { ...this.about(), ...this.heardOf(this.current), via: 'lecteur' });
      this.held = false;
      this.ownPause = false;
      this.watch(this.current, { retried: true });
      this.status = 'loading';
      this.render();
    }
    if (this.attempt && !this.attempt.loaded) return; // encore la piste d'avant
    if (name === 'FINISH') {
      this.dropPlayerPause(); // la PAUSE d'avant était celle de la fin de piste
      if (this.current) this.report('music_finished', this.about(), { volume: true });
      this.why = 'enchainee';
      const next = this.listed() ?? this.following(this.current) ?? this.choose(this.current);
      return next ? this.start(next) : this.unreachable();
    }
    if (name === 'PLAY') {
      this.ownPause = false;
      // Relancée au bouton du lecteur après une pause comptée : la reprise aussi.
      if (this.playerPause?.counted && this.status === 'paused' && this.current) {
        this.report('music_resumed', { ...this.about(), ...this.heardOf(this.current), via: 'lecteur' });
      }
      this.dropPlayerPause();
      // Relancée d'ailleurs (le bouton du lecteur, le système) : on vérifie qu'elle avance.
      if (!this.attempt && this.current && this.status !== 'playing') this.watch(this.current, { retried: true });
    }
    // Une lecture demandée avance : elle joue vraiment. (Sans demande en cours, un reste d'avant une pause.)
    // Où en est l'écoute : rien ne part ici, c'est lu au ⏭, à la pause, à la fin.
    if (name === 'PLAY_PROGRESS' && this.listen?.track === this.current && data.currentPosition > 0) {
      this.listen.position = data.currentPosition;
      if (Number.isFinite(data.relativePosition)) this.listen.relative = data.relativePosition;
    }
    if (name === 'PLAY_PROGRESS' && data.currentPosition > 0 && this.attempt && !this.ownPause) {
      this.confirmed(this.attempt.track);
      this.lastHeard.set(this.moment(), this.attempt.track);
      this.heardNow(this.attempt.track); // entendue pour de bon : elle sort du sac
      this.cancelWatch();
      this.status = 'playing';
      this.render();
    }
    if (name === 'PAUSE' && !this.ownPause) {
      if (!this.attempt) {
        // Pause après une vraie lecture : le joueur, ou le système (appel, autre application).
        // Page à l'écran : c'est le joueur, au bouton du lecteur SoundCloud.
        if (this.status === 'playing' && !this.hidden && this.current) this.deferPlayerPause();
        if (this.status === 'playing') this.status = 'paused';
        return this.render();
      }
      this.attempt.refused = true; // le navigateur a refusé de jouer
      if (this.env.activated()) this.lazy = true; // refusée après un premier geste : il en faut un à chaque piste
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

  /** « Suivant » a un sens : la musique joue, se charge, ou le joueur l'a mise en pause. Coupée ou refusée, non. */
  canSkip() {
    return this.enabled && Boolean(this.current) && ['playing', 'loading', 'paused'].includes(this.status);
  }

  /** ⏸ a un sens dès que la musique est voulue, même avant le premier geste (pour l'empêcher de partir). */
  canPause() {
    return this.canSkip() || (this.enabled && Boolean(this.current) && this.status === 'blocked');
  }

  /**
   * « Suivant » : la piste d'après, selon le moment. En niveau, la suivante du sac : la piste passée compte comme
   * entendue. Au menu et au boss, un autre tirage. Une piste passée n'appelle pas sa suite (`puis`) : passer
   * Monarch saute Ryukken. Passer une suite écarte aussi celle qu'elle suit : passer Ryukken ne la ramène pas
   * par Monarch. Pendant un chargement, la piste demandée se charge au rappel du précédent.
   */
  next() {
    if (!this.canSkip()) return;
    const skipped = this.current;
    this.lastHeard.set(this.moment(), skipped);
    this.heardNow(skipped);
    const leader = this.tracks.find((t) => t.puis === skipped.id);
    const avoid = leader ? [skipped, leader] : skipped;
    const base = this.draw(avoid);
    // Au hasard parmi les pistes du moment, sans le sac : « randomize the "Next" button ».
    // En niveau, la liste qu'il nomme (`musique`) d'abord, dans son ordre.
    const track = NOT_A_LEVEL.has(this.slot) ? chooseTrack(this.tracks, base) : this.listed() ?? nextLevelTrack(this.tracks, base) ?? chooseTrack(this.tracks, base);
    if (!track) return;
    this.report('music_skipped', { ...this.about(skipped), ...this.heardOf(skipped) }, { volume: true });
    this.held = false;
    this.chosenFor = `${this.slot}|${this.named}`;
    this.why = 'suivante';
    this.start(track);
  }

  /** ⏸ / ▶ : le joueur met Radio Manif en pause, ou la remet. */
  togglePause() {
    if (!this.enabled || !this.current) return;
    if (this.held || this.status === 'paused') return this.release();
    if (this.status === 'blocked') return this.unblock(); // ▶ : refusée, ce toucher la lance
    if (this.status === 'unreachable') return;
    this.report('music_paused', { ...this.about(), ...this.heardOf(this.current), via: 'radio' }, { volume: true });
    this.silenced = false;
    this.held = true;
    this.gesture = false;
    this.halt();
    this.status = 'paused';
    this.render();
  }

  /**
   * La musique remise : la piste en pause reprend, si c'est encore celle du moment ; sinon (un niveau, le boss,
   * le menu sont passés entre-temps), celle du moment, comme si on y arrivait.
   */
  release() {
    this.report('music_resumed', { ...this.about(), ...this.heardOf(this.current), via: 'radio' });
    this.held = false;
    const key = `${this.slot}|${this.named}`;
    const level = !NOT_A_LEVEL.has(this.slot);
    const same = this.chosenFor === key && (!level || this.visit?.track === this.current);
    const usable = this.widget && !this.failed.has(this.current.id);
    // Le son, dans ce geste-ci : la piste chargée reprend. Safari refuse une piste chargée hors d'un geste ; là, elle
    // continue, et la musique du moment vient à sa fin. Ailleurs, la musique du moment se charge aussitôt.
    if (usable && (same || this.lazy)) return this.resume();
    this.tune();
  }

  /** La ligne « ♪ piste ⏭ » du menu de pause (rien sans lecteur à l'écran, dans les tests). */
  controls() {
    return this.view.mini ?? null;
  }

  render(possible = this.tracks.length > 0 && this.env.online()) {
    this.view.show({
      possible, enabled: this.enabled, status: this.status, track: this.current, skip: this.canSkip(), lost: this.lost, message: this.lost ? BLOCKED_MESSAGE : null,
      // ▶ quand rien ne joue : en pause, ou refusée par le navigateur (un toucher, sur ▶ ou ailleurs, la lance).
      pause: this.canPause(), held: this.held || this.status === 'paused' || this.status === 'blocked',
    });
  }
}

// En pause, la place qu'il faut au lecteur dans la marge de l'écran de pause, et ce qui l'entoure (px).
const ROOM = 90;
const SHADOW = 8; // l'ombre de l'écran de pause
const GAP = 12;
const BUTTON = 8 + 27 + 4; // le bouton seul, à côté de la pause : sa hauteur et ses marges
const TOP = 52; // sous le bouton pause

/** Le panneau de Radio Manif : le lecteur et sa piste ; « ▶ Radio Manif » quand la musique est coupée, ou sans lecteur. */
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
    // « ♪ piste ⏭ » dans le menu de pause : ui.js l'y pose, elle se tient à jour d'ici.
    this.miniTitle = h('span', { className: 'titre' });
    this.pauses = []; // les boutons ⏸/▶ : au menu et dans le menu de pause
    this.miniPause = this.pauseButton();
    this.miniSkip = this.skipButton('Piste suivante (N)');
    this.mini = h('div', { className: 'radio-pause', hidden: true },
      h('span', { className: 'note' }, '♪'), this.miniTitle, this.miniPause, this.miniSkip, h('kbd', {}, 'N'));
  }

  /** ⏭ : la piste suivante. */
  skipButton(title = 'Piste suivante') {
    const button = h('button', { type: 'button', className: 'radio-bouton suivante', title, onclick: () => this.onNext() }, '⏭\uFE0E');
    button.setAttribute('aria-label', 'Piste suivante');
    return button;
  }

  /** ⏸ / ▶ : mettre Radio Manif en pause, ou la remettre. */
  pauseButton() {
    const button = h('button', { type: 'button', className: 'radio-bouton lecture', onclick: () => this.onPause() });
    this.pauses.push(button);
    this.paint(button, false);
    return button;
  }

  paint(button, held) {
    const label = held ? 'Remettre la musique' : 'Mettre la musique en pause';
    if (button.title === label) return;
    button.textContent = held ? '▶\uFE0E' : '⏸\uFE0E';
    button.title = label;
    button.setAttribute('aria-label', label);
  }

  mount(frame) {
    this.frame = frame;
    this.caption = h('p', {});
    this.skip = this.skipButton();
    this.pauses = this.pauses.filter((b) => b.isConnected || b === this.miniPause); // l'ancien bouton du menu, démonté
    this.pause = this.pauseButton();
    // Le texte se raccourcit selon la place : « ▶ Relancer la musique », « ▶ Relancer », ou « ▶♪ » sous le bouton pause.
    this.retry = h('button', { type: 'button', className: 'relance', hidden: true, title: 'Relancer la musique', onclick: () => this.onRetry() },
      '▶', h('span', { className: 'mot' }, ' Relancer'), h('span', { className: 'suite' }, ' la musique'), h('span', { className: 'note' }, '♪'));
    this.box.replaceChildren(this.askGroup(), h('strong', {}, 'Radio Manif'), frame, h('div', { className: 'piste' }, this.caption, this.pause, this.skip), this.retry);
    this.box.classList.add('monte');
  }

  /**
   * « ▶ Radio Manif » : la musique coupée, ou un lecteur qui n'a pas pu se charger. Lecteur préchargé, il est là,
   * muet et caché derrière ce bouton : le toucher qui la demande la lance.
   */
  askGroup() {
    if (this.ask) return this.ask;
    const button = h('button', { type: 'button', onclick: () => (this.enabled ? this.onRetry() : this.onAsk()) }, '▶ Radio Manif');
    button.dataset.radio = 'demande';
    this.askNote = h('p', {});
    this.ask = h('div', { className: 'demande' }, button, this.askNote);
    return this.ask;
  }

  unmount() {
    this.frame = null;
    this.box.classList.remove('monte', 'eteinte');
    this.box.replaceChildren();
    this.mini.hidden = true;
  }

  show({ possible, enabled, status, track, skip = false, pause = false, held = false, lost = false, message = null }) {
    this.enabled = enabled;
    this.box.hidden = !possible;
    // Lecteur bloqué : la ligne du menu de pause le dit aussi, sans bouton (rien à lancer).
    const blocked = Boolean(possible && lost && message);
    this.mini.hidden = !(blocked || (possible && this.frame && pause));
    this.mini.classList.toggle('injoignable', blocked);
    this.miniSkip.hidden = !skip || blocked;
    this.miniPause.hidden = blocked;
    for (const button of this.pauses) this.paint(button, held);
    const title = blocked ? message : (track?.titre ?? '');
    if (this.miniTitle.textContent !== title) this.miniTitle.textContent = title;
    this.mini.title = blocked ? message : track ? `Radio Manif : ${track.titre} — ${track.artiste}` : '';
    if (!possible) return;
    // Refusée par le navigateur : pas de « Relancer », n'importe quel toucher (▶ compris) la lance. Seul un lecteur
    // injoignable garde son bouton : un geste ne le recharge pas.
    const stuck = enabled && status === 'unreachable';
    this.box.classList.toggle('bloquee', Boolean(this.frame) && stuck);
    // Un lecteur qui n'a pas pu se charger le dit, au lieu d'apparaître et de disparaître sans un son.
    const note = lost && message ? message : 'Musique par SoundCloud';
    const ask = this.askGroup();
    if (this.askNote.textContent !== note) this.askNote.textContent = note;
    this.askNote.classList.toggle('injoignable', lost);
    if (!this.frame) {
      // Pas de lecteur (hors ligne, ou SoundCloud injoignable) : juste ce bouton, qui réessaie.
      if (ask.parentNode !== this.box) this.box.replaceChildren(ask);
      return;
    }
    this.box.classList.toggle('eteinte', !enabled); // musique coupée : le lecteur préchargé reste caché derrière le bouton
    this.retry.hidden = !stuck;
    this.skip.hidden = !skip;
    this.pause.hidden = !pause;
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
function connectWidget(track, onEvent, view, { autoPlay = true } = {}) {
  return new Promise((resolve, reject) => {
    const frame = h('iframe', frameAttributes(track, { autoPlay }));
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
