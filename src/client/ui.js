// Les écrans du jeu, en HTML : texte net à toute taille, liens cliquables vers les sources.
// Chaque fonction remplit `#ecran` ; `close()` le vide et rend la main au jeu.

import { h, link, signature } from './dom.js';
import { spriteElement } from './sprites.js';
import { REPO, VERSION, REFERENCES, ANALYTICS } from './config.js';
import { storeSave, eraseProgress, isFound, isReadOnly } from './save.js';
import { SHELVES, VOTE_FICHES, allCards, collectionCount, isFresh, levelOrder, markSeen, openCard, progress, rarityCounts, shelfGrid, wonCards } from './collection.js';
import { livesStack } from './lives.js';
import { KEY_NAMES, CONTROLS, brief, mentions } from './input.js';
import { CRS_OCTOBRE_2026, injuryParts } from './blesses.js';
import { PANIC_STEPS } from '../sim/game.js';

const MENTION = 'Satire citoyenne, libre et collaborative.';
const PANIC_NAMES = ['calme', 'alerte', 'hystérie']; // les trois crans de la chaîne
const AIRTIME = 9; // secondes d'antenne d'une citation qui tient sur le fil
const SCROLL = 4.5; // vitesse de défilement d'une ligne trop longue, en hauteurs de lettre par seconde

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
  }

  show(className, ...children) {
    this.root.replaceChildren(h('section', { className: `panneau ${className}` }, ...children));
    document.body.dataset.ecran = className.split(' ')[0]; // la feuille de style sait quel écran est ouvert
    this.root.hidden = false;
    this.open = true;
    // Le bouton principal prend la main (Entrée, manette) ; sinon le premier.
    (this.root.querySelector('button.gros') || this.root.querySelector('button, a'))?.focus({ preventScroll: true });
  }

  close() {
    this.root.replaceChildren();
    delete document.body.dataset.ecran;
    this.root.hidden = true;
    this.open = false;
  }

  button(label, action, className = '') {
    return h('button', { type: 'button', className, onclick: () => { this.audio.play('clic'); action(); } }, label);
  }

  back(action = () => this.menu()) {
    return this.button('← Retour', action, 'discret');
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
    this.show('menu',
      h('div', { className: 'logo' }, h('span', {}, 'UltraGauche'), h('span', {}, 'Force')),
      h('p', { className: 'devise' }, 'Taxez les riches. Abattez la Citadelle.'),
      h('div', { className: 'troupe' }, heroes.map((x) => spriteElement(x.sprites.repos, this.bundle.palette, 4))),
      h('nav', {},
        this.button('Jouer', () => this.go.play(this.nextLevel()), 'gros'),
        this.button('Campagne', () => this.levels()),
        this.button(`Collection ${collectionCount(this.bundle, this.save).found}/${collectionCount(this.bundle).total}`, () => this.collection()),
        this.button('Atelier', () => this.go.atelier()),
        h('a', { className: 'bouton', href: 'galerie.html' }, 'Galerie'),
        this.button('Commandes', () => this.controls()),
        this.button('Options', () => this.options()),
        this.button('À propos', () => this.about()),
        this.update && this.button('Mettre à jour', this.update)),
      isReadOnly(this.save) && h('p', { className: 'mention' }, 'Cette sauvegarde vient d’une version plus récente du jeu. Mets le jeu à jour : d’ici là, rien n’est enregistré.'),
      h('p', { className: 'mention' }, MENTION, ` v${VERSION}`));
  }

  nextLevel() {
    const order = levelOrder(this.bundle);
    return order.find((id) => !this.save.termines[id]) || order[0];
  }

  /** Le plan de campagne : toutes les étapes, l'une après l'autre. */
  levels() {
    const { niveaux } = this.bundle;
    const stop = (id, i) => {
      const lv = niveaux[id];
      const best = this.save.records[id];
      return h('li', { className: this.save.termines[id] ? 'faite' : '' },
        h('span', { className: 'numero' }, String(i + 1)),
        h('div', {},
          h('h3', {}, lv.titre, this.save.termines[id] ? ' ✔' : ''),
          h('p', {}, [lv.accroche, best ? `✊ ${best.toLocaleString('fr-FR')}` : ''].filter(Boolean).join(' · ') || `par ${lv.auteur}`)),
        this.button('Jouer', () => this.go.play(id)));
    };
    this.show('liste plan',
      h('h2', {}, 'Plan de campagne'),
      h('ol', { className: 'etapes' }, levelOrder(this.bundle).map(stop)),
      h('div', { className: 'pied' }, this.back(), this.button('Dessiner une étape', () => this.go.atelier())));
  }

  // ------------------------------------------------------------------ Collection

  /**
   * L'album : un rayon par onglet, des cartes compactes qu'on ouvre d'un toucher.
   * Ce qui n'a pas encore été croisé en jouant reste en silhouette.
   */
  collection(tab = SHELVES[0].id, rarity = null, keep = false) {
    const { bundle, save } = this;
    const all = collectionCount(bundle, save);
    const fresh = new Set(allCards(bundle).filter((c) => isFound(save, c.kind, c.item.id) && isFresh(save, c)).map((c) => c.shelf));
    // Un héros déjà rencontré se joue depuis sa carte ; pas en pleine partie, où ce serait l'abandonner.
    const actionsFor = (card) => (card.kind === 'heros' && !this.go.playing() ? [this.button('Jouer avec', () => this.playAs(card.item.id), 'gros')] : []);
    this.show('biblio',
      h('h2', {}, 'La Collection ', h('small', {}, `${all.found} / ${all.total}`)),
      progress(all.found, all.total),
      h('div', { className: 'onglets' }, SHELVES.map((shelf) => {
        const { found, total } = collectionCount(bundle, save, shelf.id);
        if (!total) return null;
        const label = [shelf.titre, ' ', h('small', {}, `${found}/${total}`), fresh.has(shelf.id) && shelf.id !== tab && h('i', { className: 'pastille' }), progress(found, total)];
        return this.button(label, () => this.collection(shelf.id), shelf.id === tab ? '' : 'discret');
      })),
      h('div', { className: 'raretes' }, rarityCounts(bundle, save, tab).reverse().map((r) => Object.assign(this.button(
        [`${r.name}s `, h('small', {}, `${r.found}/${r.total}`)],
        () => this.collection(tab, rarity === r.rarity ? null : r.rarity, r.rarity), `rarete-${r.rarity}${rarity === r.rarity ? '' : ' discret'}`),
      { ariaPressed: String(rarity === r.rarity) }))),
      h('div', { className: 'contenu album' }, shelfGrid(bundle, tab, save, actionsFor, rarity)),
      h('div', { className: 'pied' }, this.back(() => this.go.back())));
    if (keep !== false) this.root.querySelector(`.raretes .rarete-${keep}`)?.focus({ preventScroll: true }); // le clavier reste sur le filtre
    markSeen(save, tab); // affichées avec leur badge « Nouveau » cette fois-ci, plus la prochaine
    storeSave(save);
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
  }

  /** Les réglages. Effacer sa progression ne se fait que depuis le menu, jamais en pleine partie. */
  options(note = '') {
    const toggle = (key, label) => {
      const box = h('input', { type: 'checkbox', checked: this.save.options[key] });
      box.onchange = () => {
        this.save.options[key] = box.checked;
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
  }

  about() {
    const fold = (title, ...body) => h('details', {}, h('summary', {}, title), ...body);
    this.show('liste',
      h('h2', {}, 'À propos'),
      h('p', {}, MENTION),
      h('p', {}, link(REPO, 'Le dépôt'), ' · ', link(`${REPO}/blob/main/CONTRIBUTING.md`, 'Contribuer'), ' · ',
        link(`${REPO}/blob/main/CHARTE.md`, 'La charte'), ' · ', h('a', { href: 'galerie.html' }, 'La Galerie')),
      ANALYTICS.token && fold('Ce que le jeu compte',
        h('p', {}, 'Par niveau : les parties lancées, terminées ou perdues, la taille de la manif, la durée, les personnages perdus, le boss, et les images partagées. Un numéro tiré au hasard relie les compteurs d’une même visite ; il est oublié à la fermeture de la page. Aucun cookie : rien n’est écrit sur votre appareil pour cela. La progression, elle, ne le quitte pas.')),
      fold('Références', h('ul', {}, REFERENCES.map((r) => h('li', {}, link(r.url, r.titre), ` — ${r.note}`)))),
      fold('Crédits et licences',
        h('p', {}, 'Code : MIT. Contenus : CC BY-SA 4.0. Bruitages synthétisés avec ZzFX de Frank Force (MIT).'),
        h('ul', {}, Object.values(this.bundle.sons).filter((x) => x.fichier).map((x) =>
          h('li', {}, link(x.source, x.nom), ` — ${x.auteur}, ${x.licence}`))),
        h('p', {}, h('b', {}, 'Radio Manif : '), Object.values(this.bundle.musiques).map((m, i) => [i ? ' · ' : '', link(m.url, `${m.titre} (${m.artiste})`)]))),
      h('div', { className: 'pied' }, this.back()));
  }

  // ------------------------------------------------------------------ en partie

  pause() {
    this.show('liste etroit pause',
      h('h2', {}, 'Pause'),
      this.keys(),
      this.button('Reprendre', () => this.go.resume(), 'gros'),
      this.button('Retour au piquet de grève', () => this.go.checkpoint()),
      this.button('Recommencer le niveau', () => this.go.restart()),
      this.button('Commandes', () => this.controls()),
      this.button('Collection', () => this.collection()),
      this.button('Options', () => this.options()),
      this.button('Quitter', () => this.go.quit(), 'discret'));
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
    this.show('intro',
      h('div', { className: 'tv' }, h('strong', {}, 'PANIQUE TV'), h('em', {}, quote ? 'ILS L’ONT DIT' : 'ÉDITION SPÉCIALE')),
      quote ? h('p', { className: 'manchette' }, `« ${quote.texte} »`) : level.intro && h('p', { className: 'manchette' }, level.intro),
      quote && h('p', { className: 'signature' }, signature(quote)),
      h('h2', {}, level.titre),
      level.accroche && h('p', {}, level.accroche),
      choose && heroes.length > 1 && this.heroRow(heroes, mine, hero, pick),
      h('div', { className: 'depart' }, this.keys(), go)); // écran bas : les commandes à côté du bouton, pas au-dessus
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
      ? h('button', { type: 'button', className: x.id === current ? 'choisi' : 'discret', onclick: () => pick(x.id) }, face(x), h('span', {}, x.nom))
      : h('span', { className: 'inconnu' }, face(x), h('span', {}, '???')))));
  }

  lost() {
    this.show('liste etroit',
      h('h2', {}, 'Plus de vies'),
      h('p', {}, 'La lutte continue : on recommence.'),
      this.button('Recommencer', () => this.go.restart(), 'gros'),
      this.button('Menu', () => this.go.quit(), 'discret'));
  }

  /**
   * Fin de niveau, en un écran : la manif, le bilan des blessés tel qu'on l'annonce côté forces de l'ordre, réparti
   * comme les CRS blessés en octobre 2026, des faits réels à ouvrir (« Et en vrai ? »), ce qui a été débloqué.
   * @param {number} hurt      les blessés annoncés côté forces de l'ordre pendant la partie
   * @param {string[]} facts   les fiches de « Et en vrai ? »
   */
  end({ level, hurt = 0, facts = [], time, crowd, next, last, won = [], best = 0, share = null }) {
    const cards = allCards(this.bundle).filter((c) => c.kind === 'fiches');
    const truths = facts.map((id) => cards.find((c) => c.item.id === id)).filter(Boolean);
    const minutes = `${Math.floor(time / 60)} min ${String(Math.floor(time % 60)).padStart(2, '0')} s`;
    const n = (x) => x.toLocaleString('fr-FR');
    const parts = injuryParts(hurt);
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
            `${hurt > 1 ? 'Répartis' : 'Réparti'} comme les ${n(crs.blesses)} CRS blessés en octobre 2026 : ${parts.join(', ')}.`) : null)),
      // « Et en vrai ? » sur toute la largeur : les titres entiers, chacun ouvre sa carte.
      truths.length ? h('div', { className: 'vrai' }, h('span', {}, 'Et en vrai ?'),
        truths.map((card) => h('button', { type: 'button', onclick: () => openCard(this.bundle, card) }, card.item.titre))) : null,
      won.length ? wonCards(this.bundle, won) : null,
      h('div', { className: 'pied' },
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
        programme.length ? this.button('Le programme', () => this.collection('propositions')) : null),
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
    this.pile = '';
    this.crowd = 0;
    this.ask = null;
    clearTimeout(this.bannerTimer);
    delete this.q('bandeau').dataset.alerte; // une alerte interrompue ne fige pas le fil de la partie suivante
    this.q('toasts').replaceChildren();
    this.nextQuote();
  }

  /** Le bandeau reste à l'antenne pendant toute la partie ; le fil tourne tant qu'aucune alerte ne l'interrompt. */
  setVisible(on) {
    const el = this.q('bandeau');
    const shown = !el.hidden;
    this.el.hidden = !on;
    el.hidden = !on;
    clearTimeout(this.rotation);
    if (!on) return;
    if (!shown) this.fit(); // on ne mesure une ligne que lorsqu'elle est à l'écran
    if (!el.dataset.alerte) this.rotation = setTimeout(() => this.nextQuote(), this.airtime * 1000);
  }

  nextQuote() {
    const quote = this.quotes[this.turn++ % Math.max(1, this.quotes.length)];
    if (!quote) return;
    this.show(`« ${quote.texte} » — ${quote.auteur}, ${quote.date.slice(0, 4)}`, 'Ils l’ont dit', AIRTIME);
    this.onQuote(quote.id);
    clearTimeout(this.rotation);
    if (!this.q('bandeau').hidden) this.rotation = setTimeout(() => this.nextQuote(), this.airtime * 1000);
  }

  update(game) {
    const { hero, boss } = game;
    const special = hero.def.speciale;
    // Un panneau demande la spéciale : la puce et le bouton SPÉ clignotent jusqu'à ce qu'elle serve.
    const { ask, on: asking } = askSpecial(this.ask, game, this.live);
    this.ask = ask;
    const state = [hero.def.id, hero.hp, game.stack.join(), hero.charges, game.panicLevel, Math.round(game.panic), game.crowd,
      boss?.active && boss.state !== 'gone' ? boss.hp : -1, this.device, asking].join('|');
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
    const gauge = this.q('hud-panique');
    const [from, to] = [[0, ...PANIC_STEPS][level], [...PANIC_STEPS, 100][level]];
    this.q('bandeau').dataset.niveau = level;
    gauge.dataset.niveau = level;
    gauge.style.setProperty('--part', `${Math.round(((Math.min(100, game.panic) - from) / (to - from)) * 100)}%`);
    gauge.setAttribute('aria-label', `Panique de la chaîne : ${PANIC_NAMES[level]}`);
    const bar = this.q('hud-boss');
    const fighting = Boolean(boss?.active && boss.state !== 'gone');
    bar.hidden = !fighting;
    if (fighting) {
      bar.querySelector('b').textContent = boss.def.nom;
      bar.querySelector('i').style.width = `${Math.max(0, (boss.hp / boss.hpMax) * 100)}%`;
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
    const em = parseFloat(style.fontSize);
    const travel = over + em; // jusqu'au dernier mot, avec un peu d'air
    const time = travel / (em * SCROLL);
    inner.style.setProperty('--decalage', `${-travel}px`);
    void inner.offsetWidth; // relance le défilement depuis le début
    inner.style.animation = '';
    inner.style.animationDuration = `${time.toFixed(2)}s`;
    this.airtime = Math.max(this.airtime, 1.2 + time + 1.6); // une pause avant, le défilement, une pause après
  }

  /** Une note en haut à gauche ; trois au plus à la fois. `tone` : une classe (la rareté d'une pancarte). */
  toast(text, tone = '') {
    const note = h('p', { className: tone }, text);
    const box = this.q('toasts');
    while (box.children.length > 1) box.firstChild.remove(); // deux notes à la fois, pas plus : l'écran reste au jeu
    box.append(note);
    setTimeout(() => note.remove(), 4200);
  }
}
