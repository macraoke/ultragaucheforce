// La Galerie : tout le contenu du jeu, affiché et écoutable tel qu'il est dans `content/`.
// Elle sert à valider les ressources, et de catalogue à qui veut contribuer.

import { spriteElement } from './sprites.js';
import { Audio } from './audio.js';
import { showHeroCard } from './herocard.js';
import { h, link } from './dom.js';
import { collectionAlbum } from './collection.js';

const bundle = await (await fetch('content.json')).json();
const audio = new Audio(bundle);
addEventListener('pointerdown', () => audio.unlock(), true);
addEventListener('keydown', () => audio.unlock(), true);

const root = document.getElementById('galerie');
root.textContent = '';

const section = (title, ...children) => root.append(h('h2', {}, title), h('div', {}, ...children));
const grid = (items, tight = false) => h('div', { className: `grille${tight ? ' serree' : ''}` }, items);
const drawings = (item, names, scale, dark = false) =>
  h('div', { className: `dessins${dark ? ' sombre' : ''}` },
    names.filter((n) => item.sprites[n]).map((n) => {
      const cvs = spriteElement(item.sprites[n], bundle.palette, scale);
      cvs.title = n;
      return cvs;
    }));
const weapon = (w) => (w ? `${w.type} — ${Object.entries(w).filter(([k, v]) => k !== 'type' && typeof v === 'number' && v).map(([k, v]) => `${k} ${v}`).join(', ')}` : '—');

root.append(
  h('h1', {}, 'La Galerie ', h('b', {}, 'UltraGauche Force')),
  h('p', { className: 'intro' },
    'Tout le contenu du jeu, lu dans ', h('code', {}, 'content/'), '. Modifie un fichier, recharge la page. ',
    link('index.html', 'Retour au jeu')),
);

if (bundle.erreurs?.length) {
  section('Contenu à corriger', h('div', { className: 'erreurs' }, bundle.erreurs.map((e) => `${e.file}:${e.line} — ${e.message}`).join('\n')));
}

section('La Collection', collectionAlbum(bundle));

section('Héros', grid(Object.values(bundle.heros).map((hero) =>
  h('article', {},
    drawings(hero, ['portrait'], 5, true),
    drawings(hero, ['repos', 'marche1', 'marche2', 'saut', 'projectile', 'onde'], 4),
    h('h3', {}, hero.nom),
    hero.inspiration && h('p', {}, h('b', {}, 'Caricature de : '), hero.inspiration),
    h('p', {}, h('b', {}, 'Cri : '), `« ${hero.cri} »`),
    h('p', {}, h('small', {}, `${hero.pv} PV · vitesse ${hero.vitesse} · saut ${hero.saut} tuiles`)),
    h('p', {}, h('small', {}, `Arme : ${weapon(hero.arme)}`)),
    hero.speciale && h('p', {}, h('small', {}, `Spéciale « ${hero.speciale.nom} » : ${weapon(hero.speciale)}`)),
    h('div', { className: 'actions' },
      h('button', { onclick: () => showHeroCard(bundle, hero, { audio }) }, 'Voir le carton'),
      h('button', { className: 'discret', onclick: () => showHeroCard(bundle, hero, { audio, reduced: true }) }, 'Effets réduits'),
      bundle.voix[hero.id] && h('button', { className: 'discret', onclick: () => audio.speak(hero.id) }, 'Voix off')),
  ))));

section('Ennemis', grid(Object.values(bundle.ennemis).map((e) =>
  h('article', {},
    drawings(e, ['repos', 'marche1', 'fin', 'projectile'], 4),
    h('h3', {}, e.nom),
    h('p', {}, h('small', {}, `${e.pv} PV · ${e.deplacement} · réaction : ${e.reaction} · fin : en ${e.fin === 'greve' ? 'grève' : 'panne'}${e.bouclier ? ' · bouclier' : ''}`)),
    e.arme?.mots?.length ? h('p', {}, h('b', {}, 'Tire des mots : '), e.arme.mots.join(' ')) : null,
    h('p', {}, e.replique.map((r) => `« ${r} »`).join(' ')),
  ))));

section('Boss', grid(Object.values(bundle.boss).map((b) =>
  h('article', {},
    drawings(b, ['repos'], 3),
    drawings(b, ['portrait', 'ejecte', 'projectile'], 4, true),
    h('h3', {}, b.nom),
    h('p', {}, h('b', {}, 'Caricature de : '), b.inspiration),
    h('p', {}, h('b', {}, 'Fortune documentée : '), `${String(b.fortune.montant).replace('.', ',')} Md€`),
    h('p', {}, b.replique.map((r) => `« ${r} »`).join(' ')),
    h('p', {}, h('small', {}, `${b.pv} PV · phases : ${b.phases.map((p) => p.attaques.join(' + ')).join(' → ')}`)),
  ))));

section('Drapeaux des luttes', grid(Object.values(bundle.drapeaux).map((d) =>
  h('article', {},
    drawings(d, ['image'], 6, true),
    h('h3', {}, d.nom),
    h('p', {}, d.description),
    d.ressources.map((r) => h('p', {}, link(r.url, r.titre), h('span', { className: 'nature' }, r.nature))),
  )), true));

section('Tuiles et décors', grid([
  ...Object.values(bundle.tuiles).map((t) => h('article', {}, drawings(t, ['image'], 4), h('h3', {}, t.nom),
    h('p', {}, h('small', {}, `« ${t.symbole} » · ${t.pv ? `${t.pv} PV` : 'indestructible'}${t.explose ? ' · explosif' : ''}`)))),
  ...Object.values(bundle.decors).map((d) => h('article', {}, drawings(d, ['image', 'image2'], 3), h('h3', {}, d.nom))),
], true));

section('Bruitages', h('div', { className: 'actions' },
  Object.values(bundle.sons).map((s) => h('button', { className: 'discret', onclick: () => audio.play(s.id) }, s.nom || s.id))));

if (bundle.musiques && Object.keys(bundle.musiques).length) {
  section('Radio Manif — musiques (SoundCloud)', h('ul', { className: 'textes' },
    Object.values(bundle.musiques).map((m) => h('li', {}, link(m.url, `${m.titre} — ${m.artiste}`), ` (${m.ou})`))));
}
