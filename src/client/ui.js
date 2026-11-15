// Les écrans du jeu, en HTML : texte net à toute taille, liens cliquables vers les sources.
// Chaque fonction remplit `#ecran` ; `close()` le vide et rend la main au jeu.

import { h, link, frenchDate, sourceLine } from './dom.js';
import { spriteElement } from './sprites.js';
import { REPO, VERSION, REFERENCES } from './config.js';
import { storeSave } from './save.js';

const THEMES = {
  richesses: 'Richesses', droits: 'Tes droits', ordre: 'Maintien de l’ordre', democratie: 'Démocratie',
  programme: 'Programme', luttes: 'Luttes',
};
const CATEGORIES = { diabolisation: 'Les mots pour faire peur', puissants: 'Paroles de puissants', gauche: 'La gauche se cite' };
const MENTION = 'Satire citoyenne indépendante, libre et collaborative : ni commandée ni financée par un parti. ' +
  'Les répliques des personnages sont inventées ; les citations et les chiffres de la Bibliothèque sont réels et sourcés.';

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
    this.root.hidden = false;
    this.open = true;
    this.root.querySelector('button, a')?.focus({ preventScroll: true });
  }

  close() {
    this.root.replaceChildren();
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
        this.button('Bibliothèque', () => this.library()),
        this.button('Atelier', () => this.go.atelier()),
        h('a', { className: 'bouton', href: 'galerie.html' }, 'Galerie'),
        this.button('Options', () => this.options()),
        this.button('À propos', () => this.about())),
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

  // ------------------------------------------------------------------ Bibliothèque

  quoteItem(c) {
    return h('li', { className: this.save.decouvertes.includes(c.id) ? 'vu' : '' },
      h('b', {}, `« ${c.texte} »`), ` — ${c.auteur}, ${c.fonction ? `${c.fonction}, ` : ''}${frenchDate(c.date)}. `,
      c.contexte, ' ', c.note && h('em', {}, c.note, ' '), sourceLine(c));
  }

  factItem(f) {
    return h('li', { className: this.save.decouvertes.includes(f.id) ? 'vu' : '' },
      h('b', {}, `${f.titre}. `), f.texte, ' ', f.portee && h('em', {}, f.portee, ' '), sourceLine(f));
  }

  library(tab = 'fiches') {
    const { fiches, citations, drapeaux } = this.bundle;
    const tabs = { fiches: 'Fiches', citations: 'Ils l’ont vraiment dit', luttes: 'Luttes' };
    let body;
    if (tab === 'fiches') {
      body = Object.entries(THEMES).map(([theme, title]) => {
        const list = Object.values(fiches).filter((f) => f.theme === theme);
        return list.length ? [h('h3', {}, title), h('ul', {}, list.map((f) => this.factItem(f)))] : [];
      });
    } else if (tab === 'citations') {
      body = Object.entries(CATEGORIES).map(([cat, title]) => {
        const list = Object.values(citations).filter((c) => c.categorie === cat);
        return list.length ? [h('h3', {}, title), h('ul', {}, list.map((c) => this.quoteItem(c)))] : [];
      });
    } else {
      body = h('div', { className: 'cartes' }, Object.values(drapeaux).map((d) =>
        h('article', {},
          spriteElement(d.sprites.image, this.bundle.palette, 5),
          h('h3', {}, d.nom), h('p', {}, d.description),
          d.ressources.map((r) => h('p', {}, link(r.url, r.titre), h('span', { className: 'nature' }, r.nature))))));
    }
    this.show('biblio',
      h('h2', {}, 'La Bibliothèque'),
      h('p', {}, 'Tout ce qui est ici est réel, daté et sourcé. La parodie, elle, reste dans le jeu.'),
      h('div', { className: 'onglets' }, Object.entries(tabs).map(([id, title]) =>
        this.button(title, () => this.library(id), id === tab ? '' : 'discret'))),
      h('div', { className: 'contenu' }, body),
      h('div', { className: 'pied' }, this.back(() => this.go.back())));
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
      toggle('son', 'Bruitages et voix off'),
      toggle('musique', 'Radio Manif : musique par le lecteur SoundCloud (service externe, en ligne)'),
      toggle('sobre', 'Effets réduits : sans secousses ni clignotements'),
      h('h3', {}, 'Commandes'),
      h('table', {},
        h('tr', {}, h('th', {}, ''), h('th', {}, 'Clavier'), h('th', {}, 'Manette'), h('th', {}, 'Tactile')),
        [['Avancer', '← → ou Q D', 'croix / stick', '◀ ▶'], ['Sauter, grimper', 'Espace, ↑ ou Z', 'A', 'SAUT'],
          ['Tirer (maintenir)', 'J, X ou Entrée', 'X / gâchette droite', 'TIR'], ['Spéciale', 'K, C ou Maj', 'B / gâchette gauche', 'SPÉ'],
          ['Pause', 'Échap ou P', 'Start', 'II']].map((row) => h('tr', {}, row.map((c) => h('td', {}, c))))),
      h('p', {}, h('small', {}, 'Contre un mur, saute plusieurs fois pour l’escalader.')),
      h('div', { className: 'pied' }, this.back(() => this.go.back()),
        this.button('Effacer ma progression', () => {
          this.save.termines = {};
          this.save.decouvertes = [];
          storeSave(this.save);
          this.options();
        }, 'discret')));
  }

  about() {
    this.show('liste',
      h('h2', {}, 'À propos'),
      h('p', {}, MENTION),
      h('p', {}, 'Le jeu grandit par les contributions : une blague, une pancarte, un drapeau, un niveau, un personnage, un son. ',
        'Tout le contenu est en fichiers texte, modifiables depuis GitHub sans rien installer.'),
      h('p', {}, link(REPO, 'Le dépôt'), ' · ', link(`${REPO}/blob/main/CONTRIBUER.md`, 'Contribuer'), ' · ',
        link(`${REPO}/blob/main/CHARTE.md`, 'La charte'), ' · ', h('a', { href: 'galerie.html' }, 'La Galerie')),
      h('h3', {}, 'Références assumées'),
      h('ul', {}, REFERENCES.map((r) => h('li', {}, link(r.url, r.titre), ` — ${r.note}`))),
      h('h3', {}, 'Licences'),
      h('p', {}, 'Code : MIT. Contenus (dessins, textes, niveaux, sons) : CC BY-SA 4.0. Bruitages synthétisés avec ZzFX de Frank Force (MIT).'),
      h('div', { className: 'pied' }, this.back()));
  }

  // ------------------------------------------------------------------ en partie

  pause() {
    this.show('liste etroit',
      h('h2', {}, 'Pause'),
      this.button('Reprendre', () => this.go.resume(), 'gros'),
      this.button('Retour au piquet de grève', () => this.go.checkpoint()),
      this.button('Recommencer le niveau', () => this.go.restart()),
      this.button('Bibliothèque', () => this.library()),
      this.button('Options', () => this.options()),
      this.button('Quitter', () => this.go.quit(), 'discret'));
  }

  /** Carton d'ouverture : PANIQUE TV exagère un événement ordinaire. */
  intro(level, done) {
    this.show('intro',
      h('div', { className: 'tv' }, h('strong', {}, 'PANIQUE TV'), h('em', {}, 'ÉDITION SPÉCIALE')),
      level.intro && h('p', { className: 'manchette' }, level.intro),
      h('h2', {}, level.titre),
      h('p', {}, level.accroche),
      this.button('C’est parti', done, 'gros'));
  }

  lost() {
    this.show('liste etroit',
      h('h2', {}, 'Plus de vies'),
      h('p', {}, 'La lutte continue : on recommence.'),
      this.button('Recommencer', () => this.go.restart(), 'gros'),
      this.button('Menu', () => this.go.quit(), 'discret'));
  }

  /** Fin de niveau : ce que PANIQUE TV annonce, ce qui s'est réellement passé, puis un fait sourcé. */
  end({ level, stats, time, announced, next, last }) {
    const fact = this.bundle.fiches[level.fiche];
    const minutes = `${Math.floor(time / 60)} min ${String(Math.floor(time % 60)).padStart(2, '0')} s`;
    this.show('fin',
      h('h2', {}, 'Niveau terminé'),
      h('p', { className: 'temps' }, `${level.titre} — ${minutes}`),
      h('div', { className: 'bilans' },
        h('article', { className: 'annonce' },
          h('h3', {}, 'Selon PANIQUE TV'),
          h('p', { className: 'chiffre' }, announced.toLocaleString('fr-FR')),
          h('p', {}, 'blessés annoncés à l’antenne')),
        h('article', {},
          h('h3', {}, 'Dans ta partie'),
          h('ul', {},
            h('li', {}, `${stats.breakdownsByPlayer} automate(s) en panne ou en grève à cause de toi`),
            h('li', {}, `${stats.breakdownsBySelf} automate(s) mis hors service par leurs propres grenades`),
            h('li', {}, `${stats.gassed} manifestant(s) gazé(s)`),
            h('li', {}, `${stats.tracts} tract(s) distribué(s), ${stats.rescues} camarade(s) libéré(s), ${stats.tiles} morceau(x) de décor en moins`)))),
      fact && h('article', { className: 'fiche' }, h('h3', {}, `Et en vrai ? ${fact.titre}`), h('p', {}, fact.texte),
        fact.portee && h('p', {}, h('em', {}, fact.portee)), sourceLine(fact)),
      h('div', { className: 'pied' },
        next && this.button('Niveau suivant', () => this.go.play(next), 'gros'),
        last && this.button('La suite', () => this.final(), 'gros'),
        this.button('Rejouer', () => this.go.restart(), 'discret'),
        this.button('Menu', () => this.go.quit(), 'discret')));
  }

  /** Dernier écran : un appel au vote citoyen. Des dates, des démarches, des liens — pas de consigne. */
  final() {
    const f = this.bundle.fiches;
    const programme = Object.values(f).filter((x) => x.theme === 'programme');
    this.show('vote',
      h('h2', {}, 'La Citadelle ne tombera pas toute seule'),
      h('p', { className: 'dates' }, 'Élection présidentielle : ', h('b', {}, 'dimanche 18 avril'), ' et ', h('b', {}, 'dimanche 2 mai 2027'), '.'),
      h('p', { className: 'appel' }, 'Allez voter.'),
      h('div', { className: 'cartes' },
        [f['presidentielle-dates'], f['inscription-listes'], f.procuration].filter(Boolean).map((x) =>
          h('article', {}, h('h3', {}, x.titre), h('p', {}, x.texte), sourceLine(x)))),
      programme.length ? h('h3', {}, 'Le programme mis en scène dans ce jeu') : null,
      programme.length ? h('ul', {}, programme.map((x) => h('li', {}, x.texte, ' ', sourceLine(x)))) : null,
      h('p', { className: 'mention' }, 'Ce jeu est l’initiative individuelle de citoyens, en open source et collaboratif. ',
        'Il ne donne aucune consigne de vote : lisez les programmes, comparez, décidez.'),
      h('div', { className: 'pied' },
        this.button('Menu', () => this.go.quit(), 'gros'),
        this.button('Bibliothèque', () => this.library(), 'discret'),
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
  }

  /** Nouvelle partie : plus de bandeau ni de notification de la précédente. */
  reset() {
    this.last = '';
    clearTimeout(this.bannerTimer);
    this.q('bandeau').hidden = true;
    this.q('toasts').replaceChildren();
  }

  setVisible(on) {
    this.el.hidden = !on;
    if (!on) this.q('bandeau').hidden = true;
  }

  update(game) {
    const { hero, boss } = game;
    const state = [hero.def.id, hero.hp, game.lives, hero.charges, game.panicLevel, Math.round(game.panic), game.announced(),
      boss?.active && boss.state !== 'gone' ? boss.hp : -1].join('|');
    if (state === this.last) return; // on ne touche au DOM que si quelque chose a changé
    this.last = state;
    this.q('hud-heros').textContent = hero.def.nom;
    this.q('hud-coeurs').textContent = '♥'.repeat(Math.max(0, hero.hp)) + '♡'.repeat(Math.max(0, hero.def.pv - hero.hp));
    this.q('hud-vies').textContent = `× ${game.lives}`;
    this.q('hud-charges').textContent = hero.def.speciale ? '★'.repeat(hero.charges) + '☆'.repeat(Math.max(0, hero.def.speciale.charges - hero.charges)) : '';
    const gauge = this.q('hud-panique');
    gauge.dataset.niveau = game.panicLevel;
    gauge.querySelector('i').style.width = `${Math.min(100, game.panic)}%`;
    gauge.querySelector('b').textContent = ['Calme', 'Alerte', 'Hystérie'][game.panicLevel];
    this.q('hud-annonce').textContent = `Blessés annoncés : ${game.announced().toLocaleString('fr-FR')}`;
    const bar = this.q('hud-boss');
    const fighting = Boolean(boss?.active && boss.state !== 'gone');
    bar.hidden = !fighting;
    if (fighting) {
      bar.querySelector('b').textContent = boss.def.nom;
      bar.querySelector('i').style.width = `${Math.max(0, (boss.hp / boss.hpMax) * 100)}%`;
    }
  }

  /** Bandeau d'info en continu : la parodie, toujours signée PANIQUE TV. */
  banner(text, seconds = 6) {
    const el = this.q('bandeau');
    el.querySelector('span').textContent = text;
    el.hidden = false;
    el.classList.remove('entre');
    void el.offsetWidth; // relance l'animation
    el.classList.add('entre');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => { el.hidden = true; }, seconds * 1000);
  }

  toast(text) {
    const note = h('p', {}, text);
    this.q('toasts').append(note);
    setTimeout(() => note.remove(), 4200);
  }
}
