// Les écrans du jeu, en HTML : texte net à toute taille, liens cliquables vers les sources.
// Chaque fonction remplit `#ecran` ; `close()` le vide et rend la main au jeu.

import { h, link, signature } from './dom.js';
import { spriteElement } from './sprites.js';
import { REPO, VERSION, REFERENCES } from './config.js';
import { storeSave, isFound } from './save.js';
import { SHELVES, VOTE_FICHES, allCards, collectionCount, isFresh, levelOrder, markSeen, openCard, progress, shelfGrid, wonCards } from './collection.js';
import { livesStack } from './lives.js';

const MENTION = 'Satire citoyenne, libre et collaborative.';

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
        this.button('Options', () => this.options()),
        this.button('À propos', () => this.about()),
        this.update && this.button('Mettre à jour', this.update)),
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
  collection(tab = SHELVES[0].id) {
    const { bundle, save } = this;
    const all = collectionCount(bundle, save);
    const fresh = new Set(allCards(bundle).filter((c) => isFound(save, c.kind, c.item.id ?? c.item.texte) && isFresh(save, c)).map((c) => c.shelf));
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
      h('div', { className: 'contenu album' }, shelfGrid(bundle, tab, save, actionsFor)),
      h('div', { className: 'pied' }, this.back(() => this.go.back())));
    markSeen(save, tab); // affichées avec leur badge « Nouveau » cette fois-ci, plus la prochaine
    storeSave(save);
  }

  /** Lance le prochain niveau avec ce héros au départ. */
  playAs(hero) {
    this.save.heros = hero;
    storeSave(this.save);
    this.go.play(this.nextLevel());
  }

  // ------------------------------------------------------------------ options, à propos

  options() {
    const toggle = (key, label) => {
      const box = h('input', { type: 'checkbox', checked: this.save.options[key] });
      box.onchange = () => {
        this.save.options[key] = box.checked;
        storeSave(this.save);
        this.go.options();
      };
      return h('label', { className: 'case' }, box, ' ', label);
    };
    this.show('liste',
      h('h2', {}, 'Options'),
      toggle('son', 'Bruitages'),
      toggle('musique', 'Radio Manif (musique, par SoundCloud)'),
      toggle('sobre', 'Effets réduits'),
      h('h3', {}, 'Commandes'),
      h('table', {},
        h('tr', {}, h('th', {}, ''), h('th', {}, 'Clavier'), h('th', {}, 'Manette'), h('th', {}, 'Tactile')),
        [['Avancer', '← → ou Q D', 'croix / stick', 'pouce gauche'], ['Sauter, grimper', 'Espace, ↑ ou Z', 'A', 'SAUT'],
          ['Tirer (maintenir)', 'J, X ou Entrée', 'X / gâchette droite', 'TIR'],
          ['Creuser, viser en haut', '↓ ou ↑, puis tirer', 'bas ou haut, puis tirer', 'pouce gauche vers le bas ou le haut'],
          ['Spéciale', 'K, C ou Maj', 'B / gâchette gauche', 'SPÉ'],
          ['Pause', 'Échap ou P', 'Start', 'II']].map((row) => h('tr', {}, row.map((c) => h('td', {}, c))))),
      h('div', { className: 'pied' }, this.back(() => this.go.back()),
        this.button('Effacer ma progression', () => {
          this.save.termines = {};
          this.save.records = {};
          this.save.decouvertes = [];
          this.save.vues = {};
          this.save.heros = '';
          storeSave(this.save);
          this.options();
        }, 'discret')));
  }

  about() {
    const fold = (title, ...body) => h('details', {}, h('summary', {}, title), ...body);
    this.show('liste',
      h('h2', {}, 'À propos'),
      h('p', {}, MENTION),
      h('p', {}, link(REPO, 'Le dépôt'), ' · ', link(`${REPO}/blob/main/CONTRIBUTING.md`, 'Contribuer'), ' · ',
        link(`${REPO}/blob/main/CHARTE.md`, 'La charte'), ' · ', h('a', { href: 'galerie.html' }, 'La Galerie')),
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
    this.show('liste etroit',
      h('h2', {}, 'Pause'),
      this.button('Reprendre', () => this.go.resume(), 'gros'),
      this.button('Retour au piquet de grève', () => this.go.checkpoint()),
      this.button('Recommencer le niveau', () => this.go.restart()),
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
      go);
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
   * Fin de niveau, en un écran : la manif, le bilan des blessés tel qu'on l'annonce côté forces de l'ordre
   * avec ce qui le compose, un fait réel à ouvrir, les cartes gagnées.
   */
  end({ level, stats, time, crowd, next, last, won = [], best = 0 }) {
    const fact = this.bundle.fiches[level.fiche?.[0]];
    const card = fact && allCards(this.bundle).find((c) => c.kind === 'fiches' && c.item === fact);
    const minutes = `${Math.floor(time / 60)} min ${String(Math.floor(time % 60)).padStart(2, '0')} s`;
    const n = (x) => x.toLocaleString('fr-FR');
    const part = (count, one, many) => (count ? `${n(count)} ${count > 1 ? many : one}` : '');
    const hurt = stats.breakdownsBySelf + stats.breakdownsByPlayer + stats.overrunOrder;
    const parts = [
      part(stats.breakdownsBySelf, 'gazé par ses propres grenades', 'gazés par leurs propres grenades'),
      part(stats.breakdownsByPlayer, 'atteint par un tract', 'atteints par un tract'),
      part(stats.overrunOrder, 'débordé par le nombre', 'débordés par le nombre'),
    ].filter(Boolean);
    this.show('fin',
      h('h2', {}, 'Niveau terminé ', h('small', {}, `${level.titre} · ${minutes}`)),
      h('div', { className: 'bilans' },
        h('article', {},
          h('p', { className: 'chiffre' }, `✊ ${n(crowd)}`),
          h('p', {}, 'dans la manif'),
          best === null ? null : h('p', { className: 'dont' }, crowd > best ? (best ? `Record battu (${n(best)})` : 'Premier record') : `Record : ${n(best)}`)),
        h('article', { className: 'annonce' },
          h('p', { className: 'chiffre' }, n(hurt)),
          h('p', {}, hurt > 1 ? 'blessés annoncés côté forces de l’ordre' : 'blessé annoncé côté forces de l’ordre'),
          parts.length ? h('p', { className: 'dont' }, `dont ${parts.join(', ')}`) : null)),
      card && h('button', { type: 'button', className: 'vrai', onclick: () => openCard(this.bundle, card) },
        'Et en vrai ? ', h('b', {}, fact.titre)),
      won.length ? wonCards(this.bundle, won) : null,
      h('div', { className: 'pied' },
        next && this.button('Niveau suivant', () => this.go.play(next), 'gros'),
        last && this.button('La suite', () => this.final(), 'gros'),
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

export class Hud {
  constructor(bundle) {
    this.bundle = bundle;
    this.el = document.getElementById('hud');
    this.q = (id) => document.getElementById(id);
    this.last = '';
    this.bannerTimer = 0;
    this.rotation = 0;
    this.turn = 0;
    this.onQuote = () => {}; // une vraie citation passe à l'antenne : la Collection la note
    // Le fil permanent de PANIQUE TV : de vraies déclarations, datées et signées.
    this.quotes = Object.values(bundle.citations).filter((c) => c.categorie !== 'gauche');
  }

  /** Nouvelle partie : le fil repart, sans alerte ni notification de la précédente. */
  reset() {
    this.last = '';
    this.crowd = 0;
    clearTimeout(this.bannerTimer);
    delete this.q('bandeau').dataset.alerte; // une alerte interrompue ne fige pas le fil de la partie suivante
    this.q('toasts').replaceChildren();
    this.nextQuote();
  }

  /** Le bandeau reste à l'antenne pendant toute la partie. */
  setVisible(on) {
    this.el.hidden = !on;
    this.q('bandeau').hidden = !on;
    clearInterval(this.rotation);
    if (on) this.rotation = setInterval(() => this.q('bandeau').dataset.alerte || this.nextQuote(), 9000);
  }

  nextQuote() {
    const quote = this.quotes[this.turn++ % Math.max(1, this.quotes.length)];
    if (!quote) return;
    this.show(`« ${quote.texte} » — ${quote.auteur}, ${quote.date.slice(0, 4)}`, 'Ils l’ont dit', 8.5);
    this.onQuote(quote.id);
  }

  update(game) {
    const { hero, boss } = game;
    const state = [hero.def.id, hero.hp, game.stack.join(), hero.charges, game.panicLevel, Math.round(game.panic), game.crowd,
      boss?.active && boss.state !== 'gone' ? boss.hp : -1].join('|');
    if (state === this.last) return; // on ne touche au DOM que si quelque chose a changé
    this.last = state;
    this.q('hud-heros').textContent = hero.def.nom;
    this.q('hud-vies').replaceChildren(livesStack(this.bundle, game));
    // L'attaque spéciale, par son nom, et combien il en reste.
    const special = hero.def.speciale;
    const charges = this.q('hud-charges');
    charges.textContent = special ? `${(special.nom || 'Spéciale').replace(/\s*!$/, '')} × ${hero.charges}` : '';
    charges.classList.toggle('vide', Boolean(special) && hero.charges === 0);
    // La manif : combien on est. Le compteur sursaute quand elle grossit.
    const march = this.q('hud-manif');
    march.hidden = !game.crowd;
    if (game.crowd !== this.crowd) {
      march.textContent = `✊ ${game.crowd.toLocaleString('fr-FR')}`;
      if (game.crowd > this.crowd) {
        march.classList.remove('grossit');
        void march.offsetWidth; // relance l'animation
        march.classList.add('grossit');
      }
      this.crowd = game.crowd;
    }
    // La panique est celle de la chaîne : sa jauge vit dans le bandeau, à côté de son nom.
    const gauge = this.q('hud-panique');
    gauge.dataset.niveau = game.panicLevel;
    gauge.querySelector('i').style.width = `${Math.min(100, game.panic)}%`;
    gauge.querySelector('b').textContent = ['Calme', 'Alerte', 'Hystérie'][game.panicLevel];
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
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      delete el.dataset.alerte;
      this.nextQuote();
    }, seconds * 1000);
  }

  /** Affiche une ligne dans le bandeau ; si elle est trop longue, elle défile. */
  show(text, label, seconds) {
    const el = this.q('bandeau');
    el.querySelector('em').textContent = label;
    const line = el.querySelector(':scope > span'); // le texte qui défile, pas la jauge
    const inner = h('i', {}, text);
    line.replaceChildren(inner);
    const overflow = inner.scrollWidth - line.clientWidth + 24;
    inner.style.setProperty('--decalage', `${-Math.max(0, overflow)}px`);
    inner.style.animationDuration = `${Math.max(2, seconds - 2)}s`;
  }

  /** Une note en haut à gauche ; trois au plus à la fois. `tone` : une classe (la rareté d'une pancarte). */
  toast(text, tone = '') {
    const note = h('p', { className: tone }, text);
    const box = this.q('toasts');
    while (box.children.length > 2) box.firstChild.remove();
    box.append(note);
    setTimeout(() => note.remove(), 4200);
  }
}
