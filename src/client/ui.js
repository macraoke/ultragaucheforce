// Les écrans du jeu, en HTML : texte net à toute taille, liens cliquables vers les sources.
// Chaque fonction remplit `#ecran` ; `close()` le vide et rend la main au jeu.

import { h, link, frenchDate, sourceLine } from './dom.js';
import { spriteElement } from './sprites.js';
import { REPO, VERSION, REFERENCES } from './config.js';
import { storeSave, isFound } from './save.js';
import { SHELVES, VOTE_FICHES, allCards, collectionCount, isFresh, markSeen, progress, shelfGrid, wonCards } from './collection.js';
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
    this.root.querySelector('button, a')?.focus({ preventScroll: true });
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
        this.button('Niveaux', () => this.levels()),
        this.button(`Collection ${collectionCount(this.bundle, this.save).found}/${collectionCount(this.bundle).total}`, () => this.collection()),
        this.button('Atelier', () => this.go.atelier()),
        h('a', { className: 'bouton', href: 'galerie.html' }, 'Galerie'),
        this.button('Options', () => this.options()),
        this.button('À propos', () => this.about()),
        this.update && this.button('Mettre à jour', this.update)),
      h('p', { className: 'mention' }, MENTION, ` v${VERSION}`));
  }

  nextLevel() {
    const { campagne } = this.bundle;
    return campagne.find((id) => !this.save.termines[id]) || campagne[0];
  }

  levels() {
    const { niveaux, campagne } = this.bundle;
    const card = (id, n) => {
      const lv = niveaux[id];
      return h('article', {},
        h('h3', {}, n ? `${n}. ` : '', lv.titre, this.save.termines[id] ? ' ✔' : ''),
        h('p', {}, lv.accroche),
        h('p', {}, h('small', {}, `par ${lv.auteur}`)),
        this.button('Jouer', () => this.go.play(id)));
    };
    const community = Object.keys(niveaux).filter((id) => !campagne.includes(id));
    this.show('liste',
      h('h2', {}, 'Campagne'),
      h('div', { className: 'cartes' }, campagne.map((id, i) => card(id, i + 1))),
      h('h2', {}, 'Niveaux de la communauté'),
      community.length
        ? h('div', { className: 'cartes' }, community.map((id) => card(id)))
        : h('p', {}, 'Aucun pour l’instant. Le tien ? Ouvre l’Atelier : un niveau est un simple fichier texte.'),
      h('div', { className: 'pied' }, this.back(), this.button('Ouvrir l’Atelier', () => this.go.atelier())));
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
    // Un héros déjà rencontré se joue depuis sa carte.
    const actionsFor = (card) => (card.kind === 'heros' ? [this.button('Jouer avec', () => this.playAs(card.item.id), 'gros')] : []);
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
          ['Tirer (maintenir)', 'J, X ou Entrée', 'X / gâchette droite', 'TIR'], ['Spéciale', 'K, C ou Maj', 'B / gâchette gauche', 'SPÉ'],
          ['Pause', 'Échap ou P', 'Start', 'II']].map((row) => h('tr', {}, row.map((c) => h('td', {}, c))))),
      h('p', {}, h('small', {}, 'Contre un mur, saute plusieurs fois pour l’escalader.')),
      h('div', { className: 'pied' }, this.back(() => this.go.back()),
        this.button('Effacer ma progression', () => {
          this.save.termines = {};
          this.save.decouvertes = [];
          this.save.vues = {};
          this.save.heros = '';
          storeSave(this.save);
          this.options();
        }, 'discret')));
  }

  about() {
    this.show('liste',
      h('h2', {}, 'À propos'),
      h('p', {}, MENTION),
      h('p', {}, 'Une pancarte vue en manif, une citation, un drapeau, un niveau, un personnage, un son : tout le contenu est en fichiers texte, modifiables depuis GitHub.'),
      h('p', {}, link(REPO, 'Le dépôt'), ' · ', link(`${REPO}/blob/main/CONTRIBUER.md`, 'Contribuer'), ' · ',
        link(`${REPO}/blob/main/CHARTE.md`, 'La charte'), ' · ', h('a', { href: 'galerie.html' }, 'La Galerie')),
      h('h3', {}, 'Références'),
      h('ul', {}, REFERENCES.map((r) => h('li', {}, link(r.url, r.titre), ` — ${r.note}`))),
      h('h3', {}, 'Licences et crédits'),
      h('p', {}, 'Code : MIT. Contenus : CC BY-SA 4.0. Bruitages synthétisés avec ZzFX de Frank Force (MIT).'),
      h('ul', {}, Object.values(this.bundle.sons).filter((s) => s.fichier).map((s) =>
        h('li', {}, link(s.source, s.nom), ` — ${s.auteur}, ${s.licence}`))),
      h('p', {}, h('b', {}, 'Radio Manif : '), Object.values(this.bundle.musiques).map((m, i) => [i ? ' · ' : '', link(m.url, `${m.titre} (${m.artiste})`)])),
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
   */
  intro(level, done, hero = '') {
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
      quote && h('p', { className: 'signature' }, `${quote.auteur}, ${frenchDate(quote.date)} · `, link(quote.source.url, 'source')),
      h('h2', {}, level.titre),
      level.accroche && h('p', {}, level.accroche),
      heroes.length > 1 && this.heroRow(heroes, mine, hero, pick),
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
   * Fin de niveau : la manif, puis le bilan des blessés tel qu'on l'annonce côté forces de l'ordre,
   * avec ce qui le compose. `won` : les cartes gagnées pendant le niveau.
   */
  end({ level, stats, time, crowd, next, last, won = [] }) {
    const fact = this.bundle.fiches[level.fiche?.[0]];
    const minutes = `${Math.floor(time / 60)} min ${String(Math.floor(time % 60)).padStart(2, '0')} s`;
    const n = (x) => x.toLocaleString('fr-FR');
    const line = (count, one, many) => (count ? h('li', {}, h('b', {}, n(count)), ` ${count > 1 ? many : one}`) : null);
    const hurt = stats.breakdownsBySelf + stats.breakdownsByPlayer + stats.overrun;
    this.show('fin',
      h('h2', {}, 'Niveau terminé'),
      h('p', { className: 'temps' }, `${level.titre} — ${minutes}`),
      h('div', { className: 'bilans' },
        h('article', {},
          h('h3', {}, 'La manif'),
          h('p', { className: 'chiffre' }, `✊ ${n(crowd)}`),
          h('ul', {},
            line(stats.recruits, 'recrue', 'recrues'),
            line(stats.rescues, 'camarade libéré', 'camarades libérés'),
            line(stats.overrun, 'ligne débordée', 'lignes débordées'),
            line(stats.gassed, 'manifestant gazé', 'manifestants gazés'))),
        h('article', { className: 'annonce' },
          h('h3', {}, 'Forces de l’ordre'),
          h('p', { className: 'chiffre' }, n(hurt)),
          h('p', {}, hurt > 1 ? 'blessés annoncés, dont :' : 'blessé annoncé, dont :'),
          h('ul', {},
            line(stats.breakdownsBySelf, 'gazé par ses propres grenades', 'gazés par leurs propres grenades'),
            line(stats.breakdownsByPlayer, 'atteint par un tract', 'atteints par un tract'),
            line(stats.overrun, 'débordé par le nombre', 'débordés par le nombre')))),
      fact && h('article', { className: 'fiche' }, h('h3', {}, `Et en vrai ? ${fact.titre}`), h('p', {}, fact.texte), sourceLine(fact)),
      won.length ? [h('h3', {}, 'Cartes gagnées'), wonCards(this.bundle, won)] : null,
      h('div', { className: 'pied' },
        next && this.button('Niveau suivant', () => this.go.play(next), 'gros'),
        last && this.button('La suite', () => this.final(), 'gros'),
        this.button('Rejouer', () => this.go.restart(), 'discret'),
        this.button('Menu', () => this.go.quit(), 'discret')));
  }

  /** Dernier écran : un appel au vote citoyen. Des dates, des démarches, des liens — pas de consigne. */
  final() {
    const f = this.bundle.fiches;
    const steps = VOTE_FICHES.map((id) => f[id]).filter(Boolean);
    const programme = Object.values(f).filter((x) => x.theme === 'programme');
    this.go.learn([...steps, ...programme].map((x) => x.id)); // ce qu'on lit ici entre dans la Collection
    this.show('vote',
      h('h2', {}, 'La Citadelle ne tombera pas toute seule'),
      h('p', { className: 'dates' }, 'Élection présidentielle : ', h('b', {}, 'dimanche 18 avril'), ' et ', h('b', {}, 'dimanche 2 mai 2027'), '.'),
      h('p', { className: 'appel' }, 'Allez voter.'),
      h('div', { className: 'cartes' },
        steps.map((x) => h('article', {}, h('h3', {}, x.titre), h('p', {}, x.texte), sourceLine(x)))),
      programme.length ? h('h3', {}, 'Le programme') : null,
      programme.length ? h('ul', {}, programme.map((x) => h('li', {}, x.texte, ' ', sourceLine(x)))) : null,
      h('p', { className: 'mention' }, 'Un jeu fait par des citoyens, en open source et collaboratif.'),
      h('div', { className: 'pied' },
        this.button('Menu', () => this.go.quit(), 'gros'),
        this.button('Collection', () => this.collection(), 'discret'),
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
    const state = [hero.def.id, hero.hp, game.lives, hero.charges, game.panicLevel, Math.round(game.panic), game.crowd,
      boss?.active && boss.state !== 'gone' ? boss.hp : -1].join('|');
    if (state === this.last) return; // on ne touche au DOM que si quelque chose a changé
    this.last = state;
    this.q('hud-heros').textContent = hero.def.nom;
    this.q('hud-coeurs').textContent = '♥'.repeat(Math.max(0, hero.hp)) + '♡'.repeat(Math.max(0, hero.def.pv - hero.hp));
    this.q('hud-vies').replaceChildren(livesStack(this.bundle, game));
    this.q('hud-charges').textContent = hero.def.speciale ? '★'.repeat(hero.charges) + '☆'.repeat(Math.max(0, hero.def.speciale.charges - hero.charges)) : '';
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

  toast(text) {
    const note = h('p', {}, text);
    this.q('toasts').append(note);
    setTimeout(() => note.remove(), 4200);
  }
}
