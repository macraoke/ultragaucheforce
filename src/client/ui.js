// Les écrans du jeu, en HTML : texte net à toute taille, liens cliquables vers les sources.
// Chaque fonction remplit `#ecran` ; `close()` le vide et rend la main au jeu.

import { h, link, quoted, signature } from './dom.js';
import { spriteElement } from './sprites.js';
import { REPO, REFERENCES, ANALYTICS } from './config.js';
import { storeSave, eraseProgress, isFound, isReadOnly, asksMusic } from './save.js';
import { SHELVES, VOTE_FICHES, allCards, collectionCount, isFresh, levelOrder, markSeen, openCard, progress, rarityCounts, shelfGrid, wonCards } from './collection.js';
import { livesStack } from './lives.js';
import { KEY_NAMES, CONTROLS, brief, mentions } from './input.js';
import { CRS_OCTOBRE_2026, injuryReport } from './blesses.js';
import { PANIC_STEPS } from '../sim/game.js';
import { makeRng } from '../sim/rng.js';
import { SIGN_LINGER } from './render.js';

const MENTION = 'Satire citoyenne, libre et collaborative.';
const PANIC_NAMES = ['calme', 'alerte', 'hystérie']; // les trois crans de la chaîne
const AIRTIME = 15; // secondes d'antenne d'une citation qui tient sur le fil
const SCROLL = 3; // vitesse de défilement d'une ligne trop longue, en hauteurs de lettre par seconde
const SCROLL_BEFORE = 1.2; // secondes de pause avant qu'une ligne trop longue défile (le délai de `defile`, style.css)
const SCROLL_AFTER = 2.4; // secondes de pause sur son dernier mot, avant la ligne suivante
const HYSTERIA = 2; // le cran où la chaîne ne lâche plus sa citation : plus de rotation
// Une rafale de notes du même genre se replie en une seule : « 3 pancartes débloquées ».
const FOLDS = { pancartes: 'pancartes débloquées', cartes: 'cartes débloquées' };
const LINE_BAR_X = 260; // la barre de vie d'une ligne s'affiche quand le héros arrive à cette distance d'elle…
const LINE_BAR_Y = 112; // …et à peu près à sa hauteur (distances fixes : la même sur tous les écrans)
const LINE_BAR_EMPTY = 0.8; // secondes de jeu pendant lesquelles la barre d'une ligne qui vient de céder reste, vide

/** La ligne qui tient (`ligne.vie`) la plus proche du héros, s'il arrive devant elle. */
export function lineAhead(game) {
  const { hero } = game;
  if (!hero || hero.dead) return null;
  const hx = hero.x + hero.w / 2;
  const near = (e) => Math.abs(e.x + e.w / 2 - hx) < LINE_BAR_X && Math.abs(e.y + e.h - (hero.y + hero.h)) < LINE_BAR_Y;
  return game.enemies
    .filter((e) => e.def.ligne?.vie > 0 && e.blocking && e.state !== 'done' && near(e))
    .sort((a, b) => Math.abs(a.x + a.w / 2 - hx) - Math.abs(b.x + b.w / 2 - hx))[0] ?? null;
}

/**
 * La barre de vie d'une ligne, à la place de celle du boss : `{ nom, part }` (part entre 0 et 1), ou null.
 * Une ligne qui vient de céder garde sa barre, vide, LINE_BAR_EMPTY secondes. `memo` retient la dernière montrée.
 */
export function lineBar(game, memo) {
  if (memo.game !== game) Object.assign(memo, { game, line: null, gone: null }); // une autre partie : on oublie l'ancienne
  const line = lineAhead(game);
  if (line) {
    Object.assign(memo, { line, gone: null });
    return { nom: line.def.nom, part: Math.max(0, line.hp / line.def.ligne.vie) };
  }
  if (memo.line?.state === 'done') {
    memo.gone ??= game.time;
    if (game.time - memo.gone < LINE_BAR_EMPTY) return { nom: memo.line.def.nom, part: 0 };
  }
  memo.line = null;
  return null;
}

/**
 * Une ligne trop longue pour le fil de PANIQUE TV, de `over` pixels de trop, en lettres de `em` pixels : jusqu'où elle
 * défile (son dernier mot, avec un peu d'air), en combien de secondes, et son temps d'antenne : une pause avant, le
 * défilement, une pause sur son dernier mot ; `seconds` au moins.
 */
export function scrollTiming(over, em, seconds = AIRTIME) {
  const travel = over + em;
  const time = travel / (em * SCROLL);
  return { travel, time, airtime: Math.max(seconds, SCROLL_BEFORE + time + SCROLL_AFTER) };
}

/**
 * Secondes de jeu à l'écran pour une note : le temps de la lire, et un peu plus, d'autant plus long que le texte :
 * de 3,75 à 6 secondes.
 */
export const readTime = (text) => Math.min(6, Math.max(3.75, 2.25 + text.length * 0.0525));

/**
 * Range une note dans la file d'attente. Si une note du même genre (`group`) attend déjà, elles se replient
 * en une seule, « 2 pancartes débloquées », quelle que soit leur rareté ; le bord prend la couleur de la plus rare.
 */
export function queueNote(notes, { text, tone = '', group = '' }) {
  const waiting = group && notes.find((n) => n.group === group);
  if (!waiting) {
    notes.push({ text, tone, group, count: 1 });
    return notes;
  }
  waiting.count++;
  waiting.text = `${waiting.count} ${FOLDS[group]}`;
  const rank = (t) => Number(/rarete-(\d)/.exec(t)?.[1] ?? -1);
  if (rank(tone) > rank(waiting.tone)) waiting.tone = tone;
  return notes;
}

/** « CC-BY-SA-3.0 » → « CC BY-SA 3.0 » : à l'écran, toutes les licences s'écrivent de la même façon. */
export const licenceName = (id) => id.replace(/^CC-/, 'CC ').replace(/-(\d+(?:\.\d+)*)$/, ' $1');

export class Screens {
  /**
   * @param {HTMLElement} root
   * @param {{bundle: object, save: object, audio: object, go: Record<string, Function>}} ctx
   *        `go` : les actions que les écrans déclenchent (play, resume, restart, checkpoint, quit, atelier, options…)
   */
  constructor(root, ctx) {
    this.root = root;
    Object.assign(this, ctx);
    this.open = false;
    this.escape = null; // ce que fait Échap sur l'écran ouvert : revenir à l'écran d'avant (null : rien)
  }

  /** Ouvre un écran. Échap n'y fait rien, sauf si l'écran le dit juste après (`this.escape`). */
  show(className, ...children) {
    this.root.replaceChildren(h('section', { className: `panneau ${className}` }, ...children));
    document.body.dataset.ecran = className.split(' ')[0]; // la feuille de style sait quel écran est ouvert
    this.root.hidden = false;
    this.open = true;
    this.escape = null;
    // Le bouton principal prend la main (Entrée, manette) ; sinon le premier.
    (this.root.querySelector('button.gros') || this.root.querySelector('button, a'))?.focus({ preventScroll: true });
  }

  close() {
    this.root.replaceChildren();
    delete document.body.dataset.ecran;
    this.root.hidden = true;
    this.open = false;
    this.escape = null;
  }

  button(label, action, className = '') {
    return h('button', { type: 'button', className, onclick: () => { this.audio.play('clic'); action(); } }, label);
  }

  back(action = () => this.menu()) {
    return this.button('← Retour', action, 'discret');
  }

  /** En essai depuis l'Atelier : revenir à l'édition du même niveau. Hors essai : rien. */
  editButton(className = '') {
    return this.go.testing?.() ? this.button('← Retour à l’édition', () => this.go.edit(), className) : null;
  }

  /** L'Atelier est en bêta : le bouton qui l'ouvre le dit. */
  /** Le bouton qui ouvre l'Atelier, avec son étiquette « bêta » ; il dit, sur lui, que l'Atelier se charge. */
  atelierButton(label) {
    const button = this.button([label, ' ', h('small', { className: 'beta' }, 'bêta')], () => this.go.atelier(button));
    return button;
  }

  /** L'appareil dont on montre les touches : clavier, manette ou pouce. */
  get device() {
    return this.go.device?.() || 'clavier';
  }

  /** Les commandes de l'appareil en cours, en une ligne. */
  keys() {
    return h('p', { className: 'touches' }, brief(this.device).map(([key, verb]) => h('span', {}, h('kbd', {}, key), ` ${verb}`)));
  }

  /** Le joueur a changé d'appareil : les lignes de commandes à l'écran suivent. */
  refreshKeys() {
    for (const line of this.root.querySelectorAll('.touches')) line.replaceWith(this.keys());
    if (this.root.querySelector('.commandes')) this.controls();
  }

  // ------------------------------------------------------------------ menu

  menu() {
    const heroes = Object.values(this.bundle.heros).filter((x) => x.statut === 'jouable');
    // Premier lancement : « Radio Manif ? ». Rien de SoundCloud ne se charge avant la réponse.
    // Un consentement : Oui et Non pareils, et le focus reste sur « Jouer » (Entrée ou A ne valent pas oui).
    // Échap (ou B) : non, pour cette fois ; la question revient au prochain lancement.
    const asking = !this.musicLater && asksMusic(this.save) && Object.keys(this.bundle.musiques || {}).length > 0;
    let question = null;
    if (asking) {
      question = h('div', { className: 'question-radio' },
        h('b', {}, 'Radio Manif ?'), this.button('Oui', () => this.go.music(true)), this.button('Non', () => this.go.music(false)),
        h('small', {}, 'Musique par SoundCloud'));
      question.setAttribute('role', 'group');
      question.setAttribute('aria-label', 'Radio Manif ?');
    }
    this.show('menu',
      h('div', { className: 'logo' }, h('span', {}, 'UltraGauche'), h('span', {}, 'Force')),
      h('p', { className: 'devise' }, 'Taxez les riches. Abattez la Citadelle.'),
      h('div', { className: 'troupe' }, heroes.map((x) => spriteElement(x.sprites.repos, this.bundle.palette, 4))),
      h('nav', {},
        this.button('Jouer', () => this.go.play(this.nextLevel()), 'gros'),
        this.button('Campagne', () => this.levels()),
        this.button(`Collection ${collectionCount(this.bundle, this.save).found}/${collectionCount(this.bundle).total}`, () => this.collection()),
        this.atelierButton('Atelier'),
        this.button('Commandes', () => this.controls()),
        this.button('Options', () => this.options()),
        this.button('À propos', () => this.about()),
        this.update && this.button('Mettre à jour', this.update)),
      question,
      isReadOnly(this.save) && h('p', { className: 'mention' }, 'Cette sauvegarde vient d’une version plus récente du jeu. Mets le jeu à jour : d’ici là, rien n’est enregistré.'),
      h('p', { className: 'mention' }, MENTION, ' ', link(REPO, 'Open source.')));
    if (!asking) return;
    this.escape = () => {
      this.musicLater = true;
      this.menu();
    };
  }

  nextLevel() {
    const order = levelOrder(this.bundle);
    return order.find((id) => !this.save.termines[id]) || order[0];
  }

  /**
   * Le plan de campagne : toutes les étapes, l'une après l'autre. Le clavier attend sur la prochaine à jouer.
   * Une étape terminée porte sa coche verte et, à côté de « Jouer », son record : la plus grande manif à l'arrivée.
   */
  levels() {
    const { niveaux } = this.bundle;
    const next = this.nextLevel();
    let ahead = null;
    const stop = (id, i) => {
      const lv = niveaux[id];
      const best = this.save.records[id];
      const done = this.save.termines[id];
      // L'accroche dit le lieu ; sans elle (un niveau dessiné dans l'Atelier), l'étape crédite son auteur.
      const line = lv.accroche || (lv.auteur && `par ${lv.auteur}`);
      const play = this.button('Jouer', () => this.go.play(id));
      if (id === next) ahead = play;
      return h('li', { className: done ? 'faite' : '' },
        h('span', { className: 'numero' }, String(i + 1)),
        h('div', {}, h('h3', {}, lv.titre, done && [' ', h('span', { className: 'coche' }, '✔︎')]), line && h('p', {}, line)),
        best ? h('div', { className: 'record' }, h('small', {}, 'Record'), h('b', {}, `✊ ${best.toLocaleString('fr-FR')}`)) : null,
        play);
    };
    this.show('liste plan',
      h('h2', {}, 'Plan de campagne'),
      h('ol', { className: 'etapes' }, levelOrder(this.bundle).map(stop)),
      h('div', { className: 'pied' }, this.back(), this.atelierButton('Dessiner une étape')));
    this.escape = () => this.menu();
    ahead?.focus({ preventScroll: true });
    ahead?.closest('li').scrollIntoView({ block: 'center' }); // un écran bas défile jusqu'à elle
  }

  // ------------------------------------------------------------------ Collection

  /**
   * L'album : un rayon par onglet, des cartes compactes qu'on ouvre d'un toucher.
   * Ce qui n'a pas encore été croisé en jouant reste en silhouette.
   * @param {{rarity?: number | null, keep?: number | null, back?: (() => void) | null}} o
   *        `rarity` : le filtre ; `keep` : le filtre qui garde le clavier ; `back` : l'écran d'où l'on vient
   *        (par défaut le menu, ou la pause en pleine partie)
   */
  collection(tab = SHELVES[0].id, { rarity = null, keep = null, back = null } = {}) {
    const { bundle, save } = this;
    const leave = back || (() => this.go.back());
    const all = collectionCount(bundle, save);
    const fresh = new Set(allCards(bundle).filter((c) => isFound(save, c.kind, c.item.id) && isFresh(save, c)).map((c) => c.shelf));
    // Un héros déjà rencontré se joue depuis sa carte ; pas en pleine partie, où ce serait l'abandonner.
    const actionsFor = (card) => (card.kind === 'heros' && !this.go.playing() ? [this.button('Jouer avec', () => this.playAs(card.item.id), 'gros')] : []);
    let shown = null;
    this.show('biblio',
      h('h2', {}, 'Collection ', h('small', {}, `${all.found} / ${all.total}`)),
      progress(all.found, all.total),
      h('div', { className: 'onglets' }, SHELVES.map((shelf) => {
        const { found, total } = collectionCount(bundle, save, shelf.id);
        if (!total) return null;
        const label = [shelf.titre, ' ', h('small', {}, `${found}/${total}`), fresh.has(shelf.id) && shelf.id !== tab && h('i', { className: 'pastille' }), progress(found, total)];
        const button = this.button(label, () => this.collection(shelf.id, { back }), shelf.id === tab ? '' : 'discret');
        if (shelf.id === tab) shown = button;
        return button;
      })),
      // « Retour » ouvre la rangée des filtres : elle garde sa hauteur sur les rayons sans rareté, la grille ne saute pas.
      h('div', { className: 'barre' }, this.back(leave),
        h('div', { className: 'raretes' }, rarityCounts(bundle, save, tab).reverse().map((r) => Object.assign(this.button(
          [`${r.name}s `, h('small', {}, `${r.found}/${r.total}`)],
          () => this.collection(tab, { rarity: rarity === r.rarity ? null : r.rarity, keep: r.rarity, back }), `rarete-${r.rarity}${rarity === r.rarity ? '' : ' discret'}`),
        { ariaPressed: String(rarity === r.rarity) })))),
      h('div', { className: 'contenu album' }, shelfGrid(bundle, tab, save, actionsFor, rarity)));
    this.escape = leave;
    this.fitShelf();
    // Le clavier reste où il était : sur le filtre qu'on vient de toucher, sinon sur le rayon ouvert.
    const keyboard = keep === null ? shown : this.root.querySelector(`.raretes .rarete-${keep}`);
    keyboard?.focus({ preventScroll: true });
    markSeen(save, tab); // affichées avec leur badge « Nouveau » cette fois-ci, plus la prochaine
    storeSave(save);
  }

  /**
   * Une rangée entière de cartes doit rester en vue sous les rayons. Sur un écran trop bas pour cela (téléphone en
   * paysage, barre du navigateur visible), le titre se replie ; plus bas encore, tout le panneau défile et les rayons
   * restent collés en haut. La mesure ne dépend pas du rayon ouvert : d'un rayon à l'autre, rien ne bouge.
   * Refaite quand la fenêtre change de taille.
   */
  fitShelf() {
    const panel = this.root.querySelector('.panneau.biblio');
    if (!panel) return;
    panel.classList.remove('serre', 'tout-defile');
    panel.style.scrollPaddingTop = '';
    const grid = panel.querySelector('.contenu');
    // La hauteur d'une carte : mesurée, gardée pour un filtre de rareté sans aucune carte (128 : `button.carte-mini`).
    this.cardHeight = grid.querySelector('.carte-mini')?.offsetHeight || this.cardHeight || 128;
    const fits = () => grid.clientHeight >= this.cardHeight + parseFloat(getComputedStyle(grid).paddingTop);
    if (fits()) return;
    panel.classList.add('serre');
    if (fits()) return;
    panel.classList.replace('serre', 'tout-defile');
    // Une carte atteinte au clavier ou à la manette ne passe pas sous les rayons collés.
    const tabs = panel.querySelector('.onglets');
    panel.style.scrollPaddingTop = `${tabs.offsetHeight + 8}px`;
  }

  /** Lance le prochain niveau avec ce héros au départ. */
  playAs(hero) {
    this.save.heros = hero;
    storeSave(this.save);
    this.go.play(this.nextLevel());
  }

  // ------------------------------------------------------------------ commandes, options, à propos

  /** Toutes les commandes, depuis le menu ou la pause. La colonne de l'appareil en cours ressort. */
  controls() {
    const here = ['clavier', 'manette', 'pouce'].indexOf(this.device) + 1;
    const cell = (tag, text, i) => h(tag, { className: i === here ? 'ici' : '' }, text);
    this.show('liste commandes',
      h('h2', {}, 'Commandes'),
      h('table', {},
        h('tr', {}, ['', 'Clavier', 'Manette', 'Tactile'].map((c, i) => cell('th', c, i))),
        CONTROLS.map((row) => h('tr', {}, row.map((c, i) => cell('td', c, i))))),
      h('div', { className: 'pied' }, this.back(() => this.go.back())));
    this.escape = () => this.go.back();
  }

  /** Les réglages. Effacer sa progression ne se fait que depuis le menu, jamais en pleine partie. */
  options(note = '') {
    const toggle = (key, label) => {
      const box = h('input', { type: 'checkbox', checked: this.save.options[key] });
      box.onchange = () => {
        this.save.options[key] = box.checked;
        if (key === 'musique') this.save.options.musiqueChoisie = true;
        storeSave(this.save);
        this.go.options();
      };
      return h('label', { className: 'case' }, box, ' ', label);
    };
    const inGame = this.go.playing();
    this.show('liste',
      h('h2', {}, 'Options'),
      toggle('son', 'Bruitages'),
      toggle('musique', 'Radio Manif (musique, par SoundCloud)'),
      toggle('sobre', 'Effets réduits'),
      note && h('p', { className: 'mention' }, note),
      h('div', { className: 'pied' }, this.back(() => this.go.back()),
        !inGame && this.button('Effacer ma progression', () => this.confirmErase(), 'discret effacer')));
    this.escape = () => this.go.back();
  }

  /** Effacer demande confirmation, et dit ce qui sera perdu. « Annuler » a la main. */
  confirmErase() {
    this.show('liste etroit',
      h('h2', {}, 'Effacer ma progression ?'),
      h('p', {}, 'Tout ce que tu as débloqué et tes records seront perdus, et la campagne repartira du premier niveau.'),
      this.button('Annuler', () => this.options(), 'gros'),
      this.button('Effacer', () => {
        eraseProgress(this.save);
        this.options('Progression effacée.');
      }, 'discret effacer'));
    this.escape = () => this.options(); // Échap, c'est Annuler
  }

  about() {
    const fold = (title, ...body) => h('details', {}, h('summary', {}, title), ...body);
    this.show('liste apropos',
      h('h2', {}, 'À propos'),
      h('p', {}, MENTION),
      h('p', {}, link(REPO, 'Le dépôt'), ' · ', link(`${REPO}/blob/main/CONTRIBUTING.md`, 'Contribuer'), ' · ',
        link(`${REPO}/blob/main/CHARTE.md`, 'La charte'), ' · ', h('a', { href: 'galerie.html' }, 'La Galerie')),
      ANALYTICS.token && fold('Ce que le jeu compte',
        h('p', {}, 'Par niveau : les parties lancées, terminées ou perdues, la taille de la manif, la durée, les personnages perdus, le boss, et les images partagées. Un numéro tiré au hasard relie les compteurs d’une même visite ; il est oublié à la fermeture de la page. Aucun cookie : rien n’est écrit sur ton appareil pour cela. La progression, elle, ne le quitte pas.')),
      fold('Références', h('ul', {}, REFERENCES.map((r) => h('li', {}, link(r.url, r.titre), ` — ${r.note}`)))),
      fold('Crédits et licences',
        h('p', {}, 'Code : MIT. Contenus : CC BY-SA 4.0. Bruitages synthétisés avec ZzFX de Frank Force (MIT).'),
        h('ul', {}, Object.values(this.bundle.sons).filter((x) => x.fichier).map((x) =>
          h('li', {}, link(x.source, x.nom), ` — ${x.auteur}, ${licenceName(x.licence)}`))),
        h('p', {}, h('b', {}, 'Radio Manif : '), Object.values(this.bundle.musiques).map((m, i) => [i ? ' · ' : '', link(m.url, m.titre), ` — ${m.artiste}`]))),
      h('div', { className: 'pied' }, this.back()));
    this.escape = () => this.menu();
  }

  // ------------------------------------------------------------------ en partie

  pause() {
    this.show('liste etroit pause',
      h('h2', {}, 'Pause'),
      this.keys(),
      this.button('Reprendre', () => this.go.resume(), 'gros'),
      this.editButton(),
      this.button('Retour au piquet', () => this.go.checkpoint()),
      this.button('Recommencer', () => this.go.restart()),
      this.button('Commandes', () => this.controls()),
      this.button('Collection', () => this.collection()),
      this.button('Options', () => this.options()),
      this.button('Quitter', () => this.go.quit(), 'discret'));
    this.escape = () => this.go.resume(); // Échap met en pause, et en sort
  }

  /**
   * Carton d'ouverture : PANIQUE TV ouvre sur une vraie déclaration, signée, datée et sourcée.
   * On y choisit aussi son héros de départ, parmi ceux déjà rencontrés.
   * @param {string} hero  identifiant du héros avec lequel la partie démarre
   * @param {boolean} choose  faux dans l'Atelier : on essaie le niveau avec le héros de sa fiche
   */
  intro(level, done, hero = '', choose = true) {
    const quote = this.bundle.citations[level.citation];
    const go = this.button('C’est parti', done, 'gros');
    const heroes = Object.values(this.bundle.heros).filter((x) => x.statut !== 'test');
    const mine = heroes.filter((x) => x.id === hero || isFound(this.save, 'heros', x.id)).map((x) => x.id);
    const pick = (id) => {
      if (id === hero) return;
      this.audio.play('clic');
      this.save.heros = id;
      storeSave(this.save);
      this.go.restart(); // la partie repart avec ce héros, et ce carton se réaffiche
    };
    // « ← Retour », comme Échap, ne lance pas le niveau : il ramène là d'où l'on vient, le plan ou le menu ;
    // en essai depuis l'Atelier, à l'édition (le bouton dit alors « ← Retour à l'édition »).
    // Un changement de héros réaffiche ce carton : l'écran d'avant reste le même.
    const before = this.root.firstElementChild?.classList;
    if (!before?.contains('intro')) {
      const from = before?.contains('plan') ? 'plan' : '';
      this.introBack = () => {
        if (this.go.testing?.()) return this.go.edit();
        this.go.quit();
        if (from === 'plan') this.levels();
        return undefined;
      };
    }
    this.show('intro',
      h('div', { className: 'tv' }, h('strong', {}, 'PANIQUE TV'), h('em', {}, quote ? 'ILS L’ONT DIT' : 'ÉDITION SPÉCIALE')),
      quote ? h('p', { className: 'manchette' }, quoted(quote.texte)) : level.intro && h('p', { className: 'manchette' }, level.intro),
      quote && h('p', { className: 'signature' }, signature(quote)),
      h('h2', {}, level.titre),
      level.accroche && h('p', { className: 'accroche' }, level.accroche),
      choose && heroes.length > 1 && this.heroRow(heroes, mine, hero, pick),
      // Écran bas : les commandes à côté des boutons, pas au-dessus. « C'est parti » reste le bouton principal.
      // En essai, un seul retour : celui qui ramène à l'édition.
      h('div', { className: 'depart' }, this.keys(), h('div', { className: 'boutons' }, this.editButton() || this.back(() => this.introBack()), go)));
    this.escape = this.introBack;
    this.fitHeroNames();
    // Une longue déclaration sur un écran bas : la manchette rapetisse jusqu'à ce que le carton tienne sans défiler.
    const panel = this.root.firstChild;
    const headline = panel.querySelector('.manchette');
    for (let size = headline && parseFloat(getComputedStyle(headline).fontSize); headline && panel.scrollHeight > panel.clientHeight && size > 12; size -= 1) {
      headline.style.fontSize = `${size - 1}px`;
    }
    go.focus({ preventScroll: true }); // Entrée lance le niveau…
    this.root.firstChild.onkeydown = (e) => { // … ← et → changent de héros
      const turn = { ArrowLeft: -1, ArrowRight: 1 }[e.key];
      if (!turn || mine.length < 2) return;
      e.preventDefault();
      pick(mine[(mine.indexOf(hero) + turn + mine.length) % mine.length]);
    };
  }

  /** La rangée des héros : ceux de la Collection se choisissent, les autres restent en silhouette. */
  heroRow(heroes, mine, current, pick) {
    const face = (x) => spriteElement(x.sprites.portrait || x.sprites.repos, this.bundle.palette, 2);
    return h('div', { className: 'choix-heros' }, heroes.map((x) => (mine.includes(x.id)
      ? h('button', { type: 'button', className: x.id === current ? 'choisi' : 'discret', onclick: () => pick(x.id) }, face(x), h('span', { className: 'nom' }, x.nom))
      : h('span', { className: 'inconnu' }, face(x), h('span', {}, '???')))));
  }

  /** Un nom de héros tient dans sa case : un mot trop long (« TYRANNOGAUCHISTE ») fait réduire la lettre. */
  fitHeroNames() {
    for (const name of this.root.querySelectorAll('.choix-heros .nom')) {
      const box = name.parentElement;
      const room = box.clientWidth - parseFloat(getComputedStyle(box).paddingLeft) - parseFloat(getComputedStyle(box).paddingRight);
      for (let size = parseFloat(getComputedStyle(name).fontSize); name.scrollWidth > room && size > 7; size -= 0.5) name.style.fontSize = `${size - 0.5}px`;
    }
  }

  lost() {
    this.show('liste etroit',
      h('h2', {}, 'Game over'),
      h('p', {}, 'La lutte continue : on recommence.'),
      h('p', { className: 'convaincre' }, 'Qui sont les 3 personnes que tu vas convaincre d’ici avril 2027\u00a0?'),
      this.button('Recommencer', () => this.go.restart(), 'gros'),
      this.editButton(),
      this.button('Menu', () => this.go.quit(), 'discret'));
  }

  /**
   * Fin de niveau, en un écran : la manif, le bilan des blessés tel qu'on l'annonce côté forces de l'ordre, réparti
   * comme les CRS blessés en octobre 2026 avec une ou deux blessures de leur fichier, des faits réels à ouvrir
   * (« Et en vrai ? »), ce qui a été débloqué.
   * @param {number} hurt      les blessés annoncés côté forces de l'ordre pendant la partie
   * @param {number} seed      la graine de la partie : ce que l'écran dit des blessés s'en tire
   * @param {string[]} facts   les fiches de « Et en vrai ? »
   */
  end({ level, hurt = 0, seed = 1, facts = [], time, crowd, next, last, won = [], best = 0, share = null }) {
    const cards = allCards(this.bundle).filter((c) => c.kind === 'fiches');
    const truths = facts.map((id) => cards.find((c) => c.item.id === id)).filter(Boolean);
    const minutes = `${Math.floor(time / 60)} min ${String(Math.floor(time % 60)).padStart(2, '0')} s`;
    const n = (x) => x.toLocaleString('fr-FR');
    const { parts, file } = injuryReport(hurt, makeRng(seed));
    const crs = CRS_OCTOBRE_2026;
    this.show('fin',
      h('h2', {}, 'Niveau terminé ', h('small', {}, `${level.titre} · ${minutes}`)),
      h('div', { className: 'bilans' },
        h('article', { className: 'manif' },
          h('p', { className: 'chiffre' }, `✊ ${n(crowd)}`),
          h('p', {}, 'dans la manif'),
          best === null ? null : h('p', { className: 'dont' }, crowd > best ? (best ? `Record battu (${n(best)})` : 'Premier record') : `Record : ${n(best)}`)),
        h('article', { className: 'annonce' },
          h('p', { className: 'chiffre' }, n(hurt)),
          h('p', {}, hurt > 1 ? 'blessés annoncés côté forces de l’ordre' : 'blessé annoncé côté forces de l’ordre'),
          parts.length ? h('p', { className: 'dont' },
            `${hurt > 1 ? 'Répartis' : 'Réparti'} comme les ${n(crs.blesses)}\u00a0CRS blessés en octobre 2026 : ${parts.join(', ')}.`) : null,
          // Espaces insécables : « ne reste pas seul en fin de ligne, » et ; ne commencent pas la suivante.
          file.length ? h('p', { className: 'fichier' }, h('span', {}, 'Dans leur fichier : '),
            `${file.join('\u00a0; ').replace(/« /g, '«\u00a0').replace(/ »/g, '\u00a0»')}.`) : null)),
      // « Et en vrai ? » sur toute la largeur : les titres entiers, chacun ouvre sa carte.
      truths.length ? h('div', { className: 'vrai' }, h('span', {}, 'Et en vrai ?'),
        truths.map((card) => h('button', { type: 'button', onclick: () => openCard(this.bundle, card) }, card.item.titre))) : null,
      won.length ? wonCards(this.bundle, won) : null,
      h('div', { className: 'pied' },
        this.editButton('gros'), // en essai, la suite, c'est l'édition
        next && this.button('Niveau suivant', () => this.go.play(next), 'gros'),
        last && this.button('La suite', () => this.final(), 'gros'),
        share && this.button('Partager', share, 'discret'),
        this.button('Rejouer', () => this.go.restart(), 'discret'),
        this.button('Menu', () => this.go.quit(), 'discret')));
  }

  /** Dernier écran : un appel au vote citoyen. Les dates, deux démarches, le programme ; pas de consigne. */
  final() {
    const f = this.bundle.fiches;
    const [dates, ...steps] = VOTE_FICHES.map((id) => f[id]).filter(Boolean);
    const programme = Object.values(f).filter((x) => x.theme === 'programme');
    this.go.learn([dates, ...steps, ...programme].filter(Boolean).map((x) => x.id)); // ce qu'on lit ici entre dans la Collection
    this.show('vote',
      h('h2', { className: 'appel' }, 'Allez voter.'),
      h('p', { className: 'dates' }, dates ? link(dates.source.url, 'Dimanche 18 avril et dimanche 2 mai 2027') : 'Dimanche 18 avril et dimanche 2 mai 2027'),
      h('nav', {},
        steps.map((x) => h('a', { className: 'bouton', href: x.source.url, target: '_blank', rel: 'noopener' }, x.titre)),
        programme.length ? this.button('Le programme', () => this.collection('propositions', { back: () => this.final() })) : null),
      h('div', { className: 'pied' },
        this.button('Menu', () => this.go.quit(), 'gros'),
        h('a', { className: 'bouton discret', href: REPO, target: '_blank', rel: 'noopener' }, 'Contribuer au jeu')));
  }
}

// ---------------------------------------------------------------------- HUD et bandeau

const ASK_TIME = 8; // secondes de jeu, au plus, pendant lesquelles la spéciale clignote

/**
 * Un panneau qui dit `[spéciale]` fait clignoter la spéciale. La demande s'arme une fois par partie, au premier
 * panneau qui la nomme ; elle tombe au premier usage (une charge de moins), au changement de personnage, ou au bout
 * de huit secondes de jeu ; elle ne clignote jamais quand la partie est arrêtée (`live` faux : pause, carton).
 * @param {{hero: string, charges: number, until: number} | null} ask  la demande en cours (null : pas encore armée)
 * @returns {{ask: object | null, on: boolean}} la demande, et si elle clignote à cette image
 */
export function askSpecial(ask, game, live) {
  const { hero } = game;
  const next = ask || (hero.def.speciale && hero.charges > 0 && mentions(game.sign, 'speciale')
    ? { hero: hero.def.id, charges: hero.charges, until: game.time + ASK_TIME } : null);
  const on = Boolean(live && next && next.hero === hero.def.id && next.charges === hero.charges && game.time < next.until);
  return { ask: next, on };
}

export class Hud {
  constructor(bundle) {
    this.bundle = bundle;
    this.el = document.getElementById('hud');
    this.q = (id) => document.getElementById(id);
    this.last = '';
    this.bannerTimer = 0;
    this.rotation = 0; // minuterie de la prochaine citation
    this.airtime = AIRTIME; // secondes d'antenne de la ligne affichée
    this.turn = 0;
    this.level = 0; // le cran de panique de la chaîne
    this.notes = []; // notes en attente : une seule à l'écran à la fois
    this.note = null; // { el, until } : la note affichée, et jusqu'à quand (temps de jeu)
    this.onQuote = () => {}; // une vraie citation passe à l'antenne : la Collection la note
    this.device = 'clavier'; // l'appareil dont la puce de la spéciale montre la touche
    this.ask = null; // un panneau a demandé la spéciale (voir `askSpecial`)
    this.live = false; // la partie tourne : hors pause et hors carton, rien ne clignote
    // Le fil permanent de PANIQUE TV : de vraies déclarations, datées et signées.
    this.quotes = Object.values(bundle.citations).filter((c) => c.categorie !== 'gauche');
  }

  /** Nouvelle partie : le fil repart, sans alerte ni notification de la précédente. */
  reset() {
    this.last = '';
    this.shape = '';
    this.pile = '';
    this.crowd = 0;
    this.ask = null;
    this.level = 0;
    clearTimeout(this.bannerTimer);
    delete this.q('bandeau').dataset.alerte; // une alerte interrompue ne fige pas le fil de la partie suivante
    this.notes = [];
    this.note = null;
    this.now = undefined;
    this.signUntil = -1;
    this.q('toasts').replaceChildren();
    this.nextQuote();
  }

  /** Le bandeau reste à l'antenne pendant toute la partie ; le fil tourne tant qu'aucune alerte ne l'interrompt. */
  setVisible(on) {
    const el = this.q('bandeau');
    const shown = !el.hidden;
    this.marks = null; // affiché ou masqué : à remesurer
    this.el.hidden = !on;
    el.hidden = !on;
    clearTimeout(this.rotation);
    if (!on) return;
    if (!shown) this.fit(); // on ne mesure une ligne que lorsqu'elle est à l'écran
    if (!el.dataset.alerte) this.schedule();
  }

  /** La prochaine citation, dans `airtime` secondes ; en hystérie, la chaîne garde celle qu'elle a. */
  schedule() {
    clearTimeout(this.rotation);
    if (!this.q('bandeau').hidden && this.level < HYSTERIA) this.rotation = setTimeout(() => this.nextQuote(), this.airtime * 1000);
  }

  nextQuote() {
    const quote = this.quotes[this.turn++ % Math.max(1, this.quotes.length)];
    if (!quote) return;
    this.show(`« ${quote.texte} » — ${quote.auteur}, ${quote.date.slice(0, 4)}`, 'Ils l’ont dit', AIRTIME);
    this.onQuote(quote.id);
    this.schedule();
  }

  update(game) {
    this.pump(game.time, Boolean(game.sign));
    const { hero, boss } = game;
    const special = hero.def.speciale;
    // Un panneau demande la spéciale : la puce et le bouton SPÉ clignotent jusqu'à ce qu'elle serve.
    const { ask, on: asking } = askSpecial(this.ask, game, this.live);
    this.ask = ask;
    const fighting = Boolean(boss?.active && boss.state !== 'gone');
    const line = fighting ? null : lineBar(game, (this.lineMemo ??= {})); // la ligne devant laquelle on arrive
    const state = [hero.def.id, hero.hp, game.stack.join(), hero.charges, game.panicLevel, Math.round(game.panic), game.crowd,
      fighting ? boss.hp : -1, line ? `${line.nom}:${Math.round(line.part * 1000)}` : '', this.device, asking].join('|');
    if (state === this.last) return; // on ne touche au DOM que si quelque chose a changé
    this.last = state;
    this.q('hud-heros').textContent = hero.def.nom;
    // La pile ne se redessine que si elle change : un coup reçu la fait sursauter, sans qu'une autre mise à jour l'interrompe.
    const pile = [hero.def.id, hero.hp, game.stack.join()].join('|');
    if (pile !== this.pile) {
      const hurt = this.pile && hero.def.id === this.hero && (hero.hp < this.hp || game.stack.length < this.height);
      const stack = livesStack(this.bundle, game);
      if (hurt) stack.classList.add('touche');
      this.q('hud-vies').replaceChildren(stack);
      Object.assign(this, { pile, hero: hero.def.id, hp: hero.hp, height: game.stack.length });
    }
    // L'attaque spéciale : sa touche sur cet appareil, son nom, et combien il en reste.
    const charges = this.q('hud-charges');
    if (special) charges.replaceChildren(h('kbd', {}, KEY_NAMES[this.device].speciale), ` ${(special.nom || 'Spéciale').replace(/\s*!$/, '')} × ${hero.charges}`);
    else charges.replaceChildren();
    charges.classList.toggle('vide', Boolean(special) && hero.charges === 0);
    charges.classList.toggle('demande', asking);
    // Au pouce, le bouton SPÉ porte le même nombre, et clignote avec la puce.
    const button = document.querySelector('#tactile [data-action="special"]');
    if (button) {
      button.dataset.nombre = special ? `× ${hero.charges}` : '';
      button.classList.toggle('vide', Boolean(special) && hero.charges === 0);
      button.classList.toggle('demande', asking);
    }
    // La manif : combien on est. Le compteur sursaute quand elle grossit.
    const march = this.q('hud-manif');
    march.hidden = !game.crowd;
    if (game.crowd !== this.crowd) {
      march.textContent = `✊ ${game.crowd.toLocaleString('fr-FR')}`;
      // Il sursaute quand elle grossit, il rougit quand elle perd du monde.
      const move = game.crowd > this.crowd ? 'grossit' : 'baisse';
      march.classList.remove('grossit', 'baisse');
      void march.offsetWidth; // relance l'animation
      march.classList.add(move);
      this.crowd = game.crowd;
    }
    // La panique est celle de la chaîne : trois crans dans le bandeau, celui en cours se remplit,
    // et tout le bandeau change de couleur avec lui.
    const level = game.panicLevel;
    if (level !== this.level) {
      this.level = level;
      if (level >= HYSTERIA) clearTimeout(this.rotation); // en hystérie, la citation reste à l'antenne
    }
    const gauge = this.q('hud-panique');
    const [from, to] = [[0, ...PANIC_STEPS][level], [...PANIC_STEPS, 100][level]];
    this.q('bandeau').dataset.niveau = level;
    gauge.dataset.niveau = level;
    gauge.style.setProperty('--part', `${Math.round(((Math.min(100, game.panic) - from) / (to - from)) * 100)}%`);
    gauge.setAttribute('aria-label', `Panique de la chaîne : ${PANIC_NAMES[level]}`);
    // La barre de vie du haut : celle du boss pendant le combat, sinon celle de la ligne devant laquelle on arrive.
    const bar = this.q('hud-boss');
    bar.hidden = !fighting && !line;
    if (fighting) {
      bar.querySelector('b').textContent = boss.def.nom;
      bar.querySelector('i').style.width = `${Math.max(0, (boss.hp / boss.hpMax) * 100)}%`;
    } else if (line) {
      bar.querySelector('b').textContent = line.nom;
      bar.querySelector('i').style.width = `${line.part * 100}%`;
    }
    // Ce qui change la hauteur du HUD (la pile, la puce et son nom, le compteur affiché ou non, la barre de vie du boss
    // ou d'une ligne, et son nom) : ses mesures sont à refaire (`measures`).
    const shape = [pile, charges.textContent, march.hidden, bar.hidden || bar.querySelector('b').textContent].join('|');
    if (shape !== this.shape) {
      this.shape = shape;
      this.marks = null;
    }
  }

  /** Alerte info : un bandeau interrompt le fil quelques secondes. `credit` : la chaîne et la date d'un vrai bandeau. */
  banner(text, credit = '', seconds = 7) {
    const el = this.q('bandeau');
    el.dataset.alerte = 'oui';
    const origin = credit.split(' — ')[0];
    this.show(origin ? `« ${text} » — ${origin}` : text, origin ? 'Vu à la télé' : 'Alerte info', seconds);
    el.classList.remove('entre');
    void el.offsetWidth; // relance l'animation
    el.classList.add('entre');
    clearTimeout(this.rotation); // l'alerte interrompt le fil…
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      delete el.dataset.alerte;
      this.nextQuote(); // … qui reprend après elle
    }, this.airtime * 1000);
  }

  /**
   * Affiche une ligne dans le bandeau, pour `seconds` secondes au moins.
   * Trop longue pour le fil, elle défile jusqu'à son dernier mot, et reste à l'antenne le temps qu'il faut.
   */
  show(text, label, seconds) {
    const el = this.q('bandeau');
    el.querySelector('em').textContent = label;
    el.querySelector('.fil').replaceChildren(h('i', {}, text));
    this.seconds = seconds;
    this.fit();
  }

  /** Ajuste la ligne affichée à la largeur du fil, et fixe son temps d'antenne (`this.airtime`). */
  fit() {
    const line = this.q('bandeau').querySelector('.fil');
    const inner = line.firstElementChild;
    this.airtime = this.seconds ?? AIRTIME;
    if (!inner) return;
    line.classList.remove('replie');
    inner.style.animation = 'none'; // sans défilement tant qu'on ne sait pas s'il en faut un
    const style = getComputedStyle(line);
    const room = line.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    const over = inner.scrollWidth - room;
    if (room <= 0 || over <= 0) return; // bandeau masqué, ou la ligne tient
    const still = document.body.classList.contains('sobre') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      // Effets réduits : la ligne se replie, en réduisant le corps jusqu'à ce qu'elle tienne dans le bandeau.
      line.classList.add('replie');
      for (const size of [0.86, 0.74, 0.62, 0.54, 0.46, 0.4]) {
        line.style.setProperty('--corps', `${size}em`);
        if (inner.offsetHeight <= line.clientHeight) break;
      }
      this.airtime += 2;
      return;
    }
    const { travel, time, airtime } = scrollTiming(over, parseFloat(style.fontSize), this.airtime);
    inner.style.setProperty('--decalage', `${-travel}px`);
    void inner.offsetWidth; // relance le défilement depuis le début
    inner.style.animation = '';
    inner.style.animationDuration = `${time.toFixed(2)}s`;
    this.airtime = airtime;
  }

  /**
   * Jusqu'où descend le HUD, en pixels CSS depuis le haut de la scène : `row`, sa première ligne (nom, pile, puce de la
   * spéciale, pause) ; `band`, tout le HUD (la puce passée à la ligne, le compteur de la manif, la barre du boss).
   * 0 tant qu'il est masqué. Mesuré dans la mise en page, pas à l'écran (juste aussi quand tout pivote), une seule fois :
   * remesuré seulement quand sa forme change (voir `update`, `setVisible`, et `main.js` au redimensionnement).
   */
  measures() {
    if (this.marks) return this.marks;
    const scene = this.el.offsetParent;
    if (!scene) return (this.marks = { row: 0, bar: 0, band: 0 }); // masqué : rien à laisser, ni à remesurer avant qu'il revienne
    const bottom = (el) => {
      if (!el?.offsetHeight) return 0;
      let y = el.offsetHeight;
      for (let e = el; e && e !== scene; e = e.offsetParent) y += e.offsetTop;
      return y;
    };
    const ids = (list) => Math.max(...list.map((id) => bottom(this.q(id))));
    // Le texte lui-même peut dépasser sa boîte (le ✊ du compteur, en emoji, est plus haut que sa ligne) : on le mesure
    // à l'écran, ramené dans le repère du jeu (au pivot, son haut est à droite de l'écran).
    const turned = document.documentElement.classList.contains('pivote');
    const frame = scene.getBoundingClientRect();
    const ink = (el) => {
      if (!el?.offsetHeight) return 0;
      const range = document.createRange();
      range.selectNodeContents(el);
      const r = range.getBoundingClientRect();
      return turned ? frame.right - r.left : r.bottom - frame.top;
    };
    const row = ids(['hud-heros', 'hud-vies', 'hud-charges', 'edition', 'pause']);
    const bar = bottom(this.q('hud-boss')); // la barre de vie du boss ou d'une ligne, en haut au milieu (0 si elle est masquée)
    const band = Math.max(row, bar, bottom(this.q('hud-manif')), ink(this.q('hud-manif')), ink(this.q('hud-heros')),
      ...[...this.el.querySelectorAll('.bloc')].map(bottom));
    this.marks = { row, bar, band };
    return this.marks;
  }

  /**
   * Une note : elles passent une à une, le temps d'être lues. `tone` : une classe (la rareté d'une pancarte).
   * `group` (une clé de FOLDS) : si une note du même genre attend déjà, les deux se replient en « 2 pancartes débloquées ».
   */
  toast(text, tone = '', group = '') {
    queueNote(this.notes, { text, tone, group });
  }

  /**
   * Fait passer les notes, au temps de jeu `now` : rien ne défile pendant une pause ou un carton.
   * Au pouce, un panneau d'aide (`sign`) s'affiche en haut, au même endroit : les notes l'attendent, et le temps
   * de lecture de celle qui était là ne court pas.
   */
  pump(now, sign = false) {
    const dt = Math.max(0, now - (this.now ?? now));
    this.now = now;
    if (sign) this.signUntil = now + SIGN_LINGER;
    const wait = document.body.classList.contains('tactile') && now < (this.signUntil ?? -1);
    this.q('toasts').classList.toggle('attend', wait);
    if (wait) {
      if (this.note) this.note.until += dt;
      return;
    }
    if (this.note && now >= this.note.until) {
      this.note.el.remove();
      this.note = null;
    }
    if (this.note || !this.notes.length) return;
    const next = this.notes.shift();
    const el = h('p', { className: next.tone }, next.text);
    this.q('toasts').append(el);
    this.note = { el, until: now + readTime(next.text) };
  }
}
