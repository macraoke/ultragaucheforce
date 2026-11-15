// La scène de taxation, après le boss : il est assis sur sa fortune, on en prend 2 %.
// Tous les nombres viennent des fiches sourcées de `content/fiches/`.

import { h, frenchNumber, sourceLine } from './dom.js';
import { sprite } from './sprites.js';

const RATE = 0.02; // l'impôt plancher discuté : 2 % par an
const YEARS_PER_STACK = 10000; // une liasse dessinée = dix mille ans de Smic
const W = 400;
const H = 190;
const CELL = { w: 7, h: 4 };

/** Les liasses du tas, de bas en haut : un trapèze assez large au sommet pour s'y asseoir. */
function heap(count) {
  const stacks = [];
  const ground = H - 14;
  for (let row = 0, width = 52; stacks.length < count && width >= 8; row++, width -= 2) {
    for (let i = 0; i < width && stacks.length < count; i++) {
      stacks.push({ x: W / 2 - (width * CELL.w) / 2 + i * CELL.w, y: ground - (row + 1) * CELL.h, row });
    }
  }
  return stacks;
}

function drawStack(ctx, x, y) {
  ctx.fillStyle = '#1f6b4a';
  ctx.fillRect(x, y, CELL.w - 1, CELL.h - 1);
  ctx.fillStyle = '#38b764';
  ctx.fillRect(x + 1, y, CELL.w - 3, CELL.h - 2);
  ctx.fillStyle = '#f6c21c';
  ctx.fillRect(x + 2, y + 1, 2, 1);
}

/**
 * @returns {Promise<string[]>} les fiches à noter comme découvertes
 */
export function showTaxScene(root, bundle, boss, { audio = null, hero = null } = {}) {
  return new Promise((resolve) => {
    const smic = bundle.fiches.smic?.valeur;
    const fortune = boss.fortune.montant * 1e9;
    if (!smic || !fortune) return resolve([]);
    const stacks = heap(Math.round(fortune / (smic * 12 * YEARS_PER_STACK)));
    const taken = Math.max(1, Math.round(stacks.length * RATE));
    const top = Math.min(...stacks.map((s) => s.y));
    const fiche = (id) => bundle.fiches[id];
    const real = (id) => fiche(id) && h('p', { className: 'vrai' }, fiche(id).texte, ' ', sourceLine(fiche(id)));
    const player = hero || Object.values(bundle.heros)[0];

    const scene = h('canvas', { className: 'pixel tas', width: W, height: H });
    const ctx = scene.getContext('2d');
    /** progress : 0 = avant l'impôt, 1 = les 2 % sont partis vers le bien commun. */
    const draw = (progress) => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#333c57';
      ctx.fillRect(0, H - 14, W, 14);
      stacks.forEach((s, i) => {
        const flying = i >= stacks.length - taken;
        if (!flying) return drawStack(ctx, s.x, s.y);
        if (progress >= 1) return;
        // les liasses prélevées s'envolent en cloche vers la caisse commune, à droite
        const t = Math.min(1, Math.max(0, progress * 1.6 - ((stacks.length - i) / taken) * 0.6));
        drawStack(ctx, s.x + (W - 30 - s.x) * t, s.y + (H - 40 - s.y) * t - Math.sin(t * Math.PI) * 50);
      });
      const throne = sprite(boss.sprites.repos, bundle.palette, true);
      ctx.drawImage(throne, Math.round(W / 2 - throne.width / 2), top - throne.height + 8);
      const you = sprite(player.sprites.repos, bundle.palette);
      ctx.drawImage(you, 14, H - 14 - you.height);
      ctx.fillStyle = '#e43b44';
      ctx.fillRect(14 + you.width + 4, H - 16, 1, 1);
      if (progress > 0) {
        ctx.fillStyle = '#f6c21c';
        ctx.fillRect(W - 44, H - 26, 30, 12);
        ctx.fillStyle = '#1a1c2c';
        ctx.fillRect(W - 42, H - 24, 26, 2);
      }
    };

    const billions = frenchNumber(boss.fortune.montant, 1);
    const result = h('div', { hidden: true },
      h('p', { className: 'montant petit' }, `${frenchNumber((fortune * RATE) / 1e9, 1)} milliards par an.`),
      h('p', { className: 'gros' }, 'Il lui reste 98 %.'),
      h('div', { className: 'services' }, ['🏫', '🏥', '🚆'].map((icon) => h('span', {}, icon))),
      real('impot-plancher'));
    const button = h('button', { type: 'button', className: 'gros' }, 'Taxer 2 %');
    let done = false;
    button.onclick = () => {
      audio?.play('clic');
      if (done) {
        root.replaceChildren();
        root.hidden = true;
        return resolve(['smic', boss.fortune.fiche, 'impot-plancher', 'impot-plancher-rendement'].filter(fiche));
      }
      done = true;
      audio?.play('tampon');
      audio?.play('sauvetage');
      button.textContent = 'Continuer';
      result.hidden = false;
      result.querySelector('.services').classList.add('allumes');
      const start = performance.now();
      const animate = (now) => {
        const progress = Math.min(1, (now - start) / 1400);
        draw(progress);
        if (progress < 1) requestAnimationFrame(animate);
      };
      requestAnimationFrame(animate);
      setTimeout(() => draw(1), 1600); // onglet en arrière-plan : on arrive quand même à l'image finale
    };

    root.replaceChildren(h('section', { className: 'panneau taxe' },
      h('p', { className: 'montant' }, `${billions} milliards d’euros`),
      h('p', {}, `La fortune de ${boss.inspiration ? `la famille de ${boss.inspiration}` : boss.nom}. `, fiche(boss.fortune.fiche) && sourceLine(fiche(boss.fortune.fiche))),
      scene,
      h('p', { className: 'legende' },
        h('i', { className: 'liasse' }), ` une liasse : ${frenchNumber(YEARS_PER_STACK)} ans de Smic`,
        h('i', { className: 'point' }), ' le point rouge : une vie de travail'),
      result,
      h('div', { className: 'pied' }, button)));
    document.body.dataset.ecran = 'taxe';
    root.hidden = false;
    draw(0);
    button.focus({ preventScroll: true });
  });
}
