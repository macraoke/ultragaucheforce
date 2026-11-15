// L'Atelier : écrire un niveau dans le navigateur, le tester tout de suite, puis le proposer.
// Un niveau est une fiche texte ; les erreurs affichées ici sont exactement celles de la CI.

import { h } from './dom.js';
import { checkLevel, MARKERS } from '../content/rules.js';
import { REPO } from './config.js';
import { storeSave } from './save.js';

const TEMPLATE = `titre: Mon niveau
auteur: ton pseudo
fond: campagne
cortege: oui
panneau.1: Touche-la : elle rejoint la manif
b: bac
p: paysanne
v: vache
--- carte
........................................
........................................
........................................
........................................
........................................
.........................PPP............
........................................
..D...1..p.v......FF.....b.....K....S...
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
`;

const MAX_URL = 7000; // au-delà, GitHub refuse le lien prérempli : on passe par le presse-papiers

const slug = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mon-niveau';

/**
 * @param {HTMLElement} root
 * @param {{bundle: object, save: object, test: (level: object) => void, back: () => void}} ctx
 */
export function showAtelier(root, { bundle, save, test, back }) {
  const area = h('textarea', { spellcheck: false, autocapitalize: 'off', value: save.brouillon || TEMPLATE });
  const report = h('div', { className: 'rapport' });
  const status = h('p', { className: 'etat' });
  let level = null;

  const check = () => {
    save.brouillon = area.value;
    storeSave(save);
    const result = checkLevel(area.value, bundle);
    level = result.errors.length ? null : result.level;
    report.replaceChildren(...result.errors.map((e) => h('p', {}, h('b', {}, `Ligne ${e.line}${e.col ? `, colonne ${e.col}` : ''} : `), e.message)));
    status.textContent = level
      ? `✔ Niveau valide : ${level.carte[0].length} × ${level.carte.length} cases.`
      : `${result.errors.length} point(s) à corriger avant de tester.`;
    testButton.disabled = !level;
    proposeButton.disabled = !level;
  };

  const propose = async () => {
    const name = `${slug(level.titre)}.txt`;
    const base = `${REPO}/new/main/content/niveaux?filename=${encodeURIComponent(name)}`;
    const full = `${base}&value=${encodeURIComponent(area.value)}`;
    if (full.length <= MAX_URL) return window.open(full, '_blank', 'noopener');
    await copy();
    status.textContent = 'Niveau trop long pour un lien : il est copié. Colle-le dans la page GitHub qui vient de s’ouvrir.';
    window.open(base, '_blank', 'noopener');
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(area.value);
      status.textContent = 'Niveau copié dans le presse-papiers.';
    } catch {
      area.select();
      status.textContent = 'Sélectionné : copie-le avec ton clavier.';
    }
  };

  const testButton = h('button', { type: 'button', className: 'gros', onclick: () => test(level) }, 'Tester');
  const proposeButton = h('button', { type: 'button', onclick: propose }, 'Proposer sur GitHub');
  const legend = [
    ['Vide', '.'],
    ...Object.values(bundle.tuiles).map((t) => [`${t.nom}${t.pv ? '' : ' (indestructible)'}${t.explose ? ' (explosif)' : ''}`, t.symbole]),
    ...Object.entries(MARKERS).map(([symbol, name]) => [name, symbol]),
    ['panneau (texte : « panneau.1: … »)', '1 à 9'],
  ];

  let timer = 0;
  area.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(check, 250);
  };

  root.replaceChildren(h('section', { className: 'panneau atelier' },
    h('h2', {}, 'L’Atelier'),
    h('p', {}, 'Un niveau est un texte : un en-tête « clé: valeur », puis la carte après « --- carte ». Une case = un caractère.'),
    h('div', { className: 'etabli' },
      h('div', {}, area, status, report),
      h('aside', {},
        h('h3', {}, 'Légende'),
        h('table', {}, legend.map(([name, symbol]) => h('tr', {}, h('td', {}, h('code', {}, symbol)), h('td', {}, name)))),
        h('h3', {}, 'Ennemis et décors'),
        h('p', {}, 'Choisis une lettre minuscule dans l’en-tête, par exemple ', h('code', {}, 'b: bac'), ', puis place-la sur la carte.'),
        h('p', {}, h('b', {}, 'Ennemis : '), Object.keys(bundle.ennemis).join(', ')),
        h('p', {}, h('b', {}, 'Décors : '), Object.keys(bundle.decors).join(', ')),
        h('p', {}, h('b', {}, 'Fonds : '), 'campagne, ville, citadelle'))),
    h('div', { className: 'pied' },
      testButton, proposeButton,
      h('button', { type: 'button', className: 'discret', onclick: copy }, 'Copier'),
      h('button', { type: 'button', className: 'discret', onclick: () => { area.value = TEMPLATE; check(); } }, 'Repartir du modèle'),
      h('button', { type: 'button', className: 'discret', onclick: back }, '← Retour'))));
  root.hidden = false;
  check();
}
