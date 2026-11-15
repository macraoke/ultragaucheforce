// La scène de taxation, après le boss : montrer une fortune à l'échelle, puis ce que pèsent 2 %.
// Une liasse = un Smic mensuel. Tous les nombres viennent des fiches sourcées de `content/fiches/`.

import { h, frenchNumber, sourceLine } from './dom.js';
import { sprite, spriteElement } from './sprites.js';

const YEARS = 43; // hypothèse affichée à l'écran : une vie de travail
const RATE = 0.02; // l'impôt plancher discuté : 2 % par an
const COLUMNS = 400; // largeur de l'image « un point = une vie de travail »

/**
 * @returns {Promise<string[]>} les fiches à noter comme découvertes
 */
export function showTaxScene(root, bundle, boss, { audio = null } = {}) {
  return new Promise((resolve) => {
    const smic = bundle.fiches.smic?.valeur;
    const fortune = boss.fortune.montant * 1e9;
    if (!smic || !fortune) return resolve([]);
    const career = smic * 12 * YEARS;
    const careers = Math.round(fortune / career);
    const taxed = Math.round((fortune * RATE) / career);
    const fiche = (id) => bundle.fiches[id];
    const real = (id) => fiche(id) && h('p', { className: 'vrai' }, h('b', {}, 'En vrai : '), fiche(id).texte, ' ', sourceLine(fiche(id)));
    const stack = () => spriteElement(bundle.decors.liasse.sprites.image, bundle.palette, 6);

    // L'image de la fortune : un point doré par vie de travail au Smic.
    const picture = h('canvas', { className: 'pixel fortune', width: COLUMNS, height: Math.ceil(careers / COLUMNS) });
    const paint = (stamped) => {
      const ctx = picture.getContext('2d');
      ctx.clearRect(0, 0, picture.width, picture.height);
      for (let i = 0; i < careers; i++) {
        ctx.fillStyle = stamped && i >= careers - taxed ? '#38b764' : i % 7 ? '#f6c21c' : '#c98f1e';
        ctx.fillRect(i % COLUMNS, Math.floor(i / COLUMNS), 1, 1);
      }
      ctx.fillStyle = '#e43b44';
      ctx.fillRect(0, 0, 3, 3);
    };

    const life = h('canvas', { className: 'pixel vie', width: 12 * 14, height: YEARS * 9 });
    const bill = sprite(bundle.decors.liasse.sprites.image, bundle.palette);
    for (let y = 0; y < YEARS; y++) for (let m = 0; m < 12; m++) life.getContext('2d').drawImage(bill, m * 14, y * 9);

    const services = h('div', { className: 'services' }, ['🏫', '🏥', '🚆'].map((icon) => h('span', {}, icon)));
    const steps = [
      () => [
        h('h2', {}, 'Le coffre est ouvert'),
        stack(),
        h('p', { className: 'gros' }, `Une liasse = un mois de Smic : ${frenchNumber(smic, 2)} € net.`),
        real('smic'),
      ],
      () => [
        h('h2', {}, 'Une vie de travail'),
        life,
        h('p', { className: 'gros' }, `${YEARS} ans au Smic : ${frenchNumber(YEARS * 12)} liasses, soit ${frenchNumber(career)} €.`),
        h('p', {}, h('small', {}, `Hypothèse : ${YEARS} années de travail au Smic d’aujourd’hui, sans jamais rien dépenser.`)),
      ],
      () => {
        paint(false);
        return [
          h('h2', {}, boss.nom),
          picture,
          h('p', { className: 'gros' }, `Chaque point doré est une VIE ENTIÈRE de travail au Smic. Il y en a ${frenchNumber(careers)}.`),
          h('p', {}, 'Le petit carré rouge, en haut à gauche : neuf vies de travail.'),
          real(boss.fortune.fiche),
        ];
      },
      () => {
        paint(true);
        audio?.play('tampon');
        audio?.play('cuivres');
        services.classList.add('allumes');
        return [
          h('h2', {}, 'Tamponné : 2 %'),
          picture,
          h('p', { className: 'gros' },
            `2 % par an : ${frenchNumber((fortune * RATE) / 1e9, 1)} milliards d’euros, soit ${frenchNumber(taxed)} vies de travail au Smic… chaque année. La bande verte, en bas. Il reste 98 %.`),
          services,
          h('p', {}, h('small', {}, 'Ordre de grandeur arithmétique, pas une prévision de recettes. Les lumières qui se rallument sont une image.')),
          real('impot-plancher'),
          real('impot-plancher-rendement'),
        ];
      },
    ];

    let index = 0;
    const panel = h('section', { className: 'panneau taxe' });
    const render = () => {
      const last = index === steps.length - 1;
      const label = last ? 'Continuer' : index === steps.length - 2 ? 'Tamponner 2 %' : 'Suivant';
      panel.replaceChildren(...steps[index]().filter(Boolean),
        h('div', { className: 'pied' }, h('button', {
          type: 'button', className: 'gros',
          onclick: () => {
            audio?.play('clic');
            if (last) {
              root.replaceChildren();
              root.hidden = true;
              return resolve(['smic', boss.fortune.fiche, 'impot-plancher', 'impot-plancher-rendement'].filter(fiche));
            }
            index++;
            render();
          },
        }, label)));
      panel.querySelector('button').focus({ preventScroll: true });
      panel.scrollTop = 0;
    };
    root.replaceChildren(panel);
    root.hidden = false;
    render();
  });
}
