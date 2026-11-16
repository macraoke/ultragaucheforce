// La scène de taxation, après le boss. Il est assis sur sa fortune ; on avance d'un bouton à l'autre.
// D'abord l'échelle, face à quelqu'un de très bien payé. Puis les 2 %, en trois idées : pour lui ce n'est rien
// (moins que ses dividendes de l'année), c'est juste (les autres paient déjà bien plus), et ça finance beaucoup.
// Tous les nombres viennent des fiches sourcées de `content/fiches/` ; un temps dont la fiche manque est sauté.

import { h, link, frenchNumber } from './dom.js';
import { sprite } from './sprites.js';
import { taxFiches } from './collection.js';

const RATE = 0.02; // l'impôt plancher discuté : 2 % par an
const YEARS_PER_STACK = 1000; // une liasse dessinée = mille ans du revenu de référence
const W = 400;
const H = 190;
const CELL = { w: 7, h: 4 };
const GROUND = H - 14;

/** Les liasses du tas, de bas en haut : un trapèze assez large au sommet pour s'y asseoir. */
function heap(count) {
  const stacks = [];
  for (let row = 0, width = 54; stacks.length < count && width >= 8; row++, width -= 2) {
    for (let i = 0; i < width && stacks.length < count; i++) {
      stacks.push({ x: W / 2 - (width * CELL.w) / 2 + i * CELL.w, y: GROUND - (row + 1) * CELL.h });
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

const billions = (euros) => frenchNumber(euros / 1e9, 1);
const thousands = (n) => frenchNumber(Math.floor(n / 1000) * 1000);
/** La ligne des sources d'un temps : chaque nombre affiché renvoie à la page où il se lit. */
const sourcesOf = (facts) => h('p', { className: 'source' }, facts.length > 1 ? 'Sources : ' : 'Source : ',
  facts.map((fact, i) => [i > 0 && ' · ', link(fact.source.url, fact.source.titre.split(' — ')[0])]));

/**
 * @returns {Promise<string[]>} les fiches à noter comme découvertes
 */
export function showTaxScene(root, bundle, boss, { audio = null, hero = null } = {}) {
  return new Promise((resolve) => {
    const fiche = (id) => bundle.fiches[id];
    const fortune = boss.fortune.montant * 1e9;
    const wage = fiche('revenu-chirurgien'); // quelqu'un de très bien payé : le repère de l'échelle
    if (!fortune || !wage?.valeur) return resolve([]);
    const unit = wage.valeur * YEARS_PER_STACK;
    const estimate = fiche(boss.fortune.fiche); // d'où vient le montant de la fortune
    // Ce que la fortune rapporte en un an : un dividende par action multiplié par un nombre d'actions, chacun avec sa source.
    const rent = boss.fortune.rente.map(fiche);
    const yearly = rent.length && rent.every((f) => f?.valeur) ? rent.reduce((total, f) => total * f.valeur, 1) : 0;
    const tax = fortune * RATE;
    const base = Math.round(fortune / unit);
    const gained = Math.round(yearly / unit);
    const taken = Math.max(1, Math.round(tax / unit));
    const stacks = heap(base + gained);
    const top = Math.min(...stacks.slice(0, base).map((s) => s.y));
    const player = hero || Object.values(bundle.heros)[0];

    const scene = h('canvas', { className: 'pixel tas', width: W, height: H });
    const ctx = scene.getContext('2d');
    const state = { rain: 0, fly: 0 }; // 0 → 1 : les dividendes tombent sur le tas, puis les 2 % s'en vont
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#333c57';
      ctx.fillRect(0, GROUND, W, 14);
      stacks.forEach((s, i) => {
        const fresh = i >= base; // une liasse de dividendes : elle tombe du ciel
        const leaving = i >= stacks.length - taken;
        let { x, y } = s;
        if (fresh) {
          const t = Math.min(1, Math.max(0, state.rain * 1.5 - ((i - base) / Math.max(1, gained)) * 0.5));
          if (t <= 0) return;
          y = -CELL.h + (s.y + CELL.h) * t * t;
        }
        if (leaving && state.fly > 0) {
          if (state.fly >= 1) return;
          // les liasses prélevées s'envolent en cloche vers la caisse commune, à droite
          const t = Math.min(1, Math.max(0, state.fly * 1.6 - ((stacks.length - i) / taken) * 0.6));
          x += (W - 30 - x) * t;
          y += (H - 40 - y) * t - Math.sin(t * Math.PI) * 50;
        }
        drawStack(ctx, x, y);
      });
      const throne = sprite(boss.sprites.repos, bundle.palette, true);
      ctx.drawImage(throne, Math.round(W / 2 - throne.width / 2), top - throne.height + 8);
      const you = sprite(player.sprites.repos, bundle.palette);
      ctx.drawImage(you, 14, GROUND - you.height);
      ctx.fillStyle = '#e43b44';
      ctx.fillRect(14 + you.width + 4, GROUND - 2, 1, 1);
      if (state.fly > 0) {
        ctx.fillStyle = '#f6c21c';
        ctx.fillRect(W - 44, H - 26, 30, 12);
        ctx.fillStyle = '#1a1c2c';
        ctx.fillRect(W - 42, H - 24, 26, 2);
      }
    };
    /** Fait passer `key` de 0 à 1 ; arrive à l'image finale même si l'onglet est en arrière-plan. */
    const animate = (key, ms) => {
      const start = performance.now();
      const frame = (now) => {
        state[key] = Math.min(1, (now - start) / ms);
        draw();
        if (state[key] < 1) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      setTimeout(() => {
        state[key] = 1;
        draw();
      }, ms + 200);
    };

    const legend = h('p', { className: 'legende' },
      h('i', { className: 'liasse' }), ` une liasse : ${frenchNumber(YEARS_PER_STACK)} ans de revenus d’un chirurgien`,
      h('i', { className: 'point' }), ' le point rouge : toute sa carrière');
    const bar = (label, fact) => h('div', {},
      h('p', {}, label), h('span', {}, h('i', { style: `--part: ${fact.valeur}` }), h('b', {}, `${frenchNumber(fact.valeur)} %`)));
    const most = fiche('prelevements-52');
    const few = fiche('prelevements-27');
    const teacher = fiche('enseignants-cout');
    const rule = fiche('impot-plancher');
    const owner = boss.inspiration ? `la famille de ${boss.inspiration}` : boss.nom;

    // Chaque temps : un grand titre, une phrase, ses sources, et le bouton qui y mène.
    const beats = [
      {
        title: `${billions(fortune)} milliards d’euros`,
        line: `La fortune de ${owner} : ${thousands(fortune / wage.valeur)} ans de revenus d’un chirurgien.`,
        source: [estimate, wage], more: legend,
      },
      {
        title: 'Pour lui : rien',
        line: yearly > tax
          ? `2 % : ${billions(tax)} milliards par an. Ses dividendes : ${billions(yearly)} milliards par an.`
          : `2 % : ${billions(tax)} milliards par an. Il en reste ${billions(fortune - tax)}.`,
        source: [rule, ...rent], button: 'Taxer 2 %', enter: () => {
          audio?.play('tampon');
          audio?.play('sauvetage');
          if (yearly) animate('rain', 1000);
          setTimeout(() => animate('fly', 1300), yearly ? 900 : 0);
        },
      },
      most?.valeur && few?.valeur && {
        title: 'Et c’est juste',
        line: 'Impôts et cotisations, en part des revenus :',
        source: most, button: 'Est-ce juste ?', hideHeap: true,
        more: h('div', { className: 'barres' }, bar('Presque tout le monde, chirurgien compris', most), bar('Les milliardaires', few)),
      },
      teacher?.valeur && {
        title: `${thousands(tax / teacher.valeur)} enseignants`,
        line: `Ce que paient ${billions(tax)} milliards, chaque année.`,
        source: teacher, button: 'Ça paie quoi ?', hideHeap: true,
        more: h('div', { className: 'services allumes' }, ['🏫', '🏥', '🚆'].map((icon) => h('span', {}, icon))),
      },
    ].filter(Boolean);

    const title = h('p', { className: 'montant' });
    const line = h('p', { className: 'gros' });
    const more = h('div', { className: 'detail' });
    const source = h('div', {});
    const button = h('button', { type: 'button', className: 'gros' });
    let at = 0;
    const show = () => {
      const beat = beats[at];
      title.textContent = beat.title;
      line.textContent = beat.line;
      scene.hidden = Boolean(beat.hideHeap);
      more.replaceChildren(...[beat.more].flat().filter(Boolean));
      const facts = [beat.source].flat().filter(Boolean);
      source.replaceChildren(facts.length ? sourcesOf(facts) : '');
      button.textContent = beats[at + 1]?.button || 'Continuer';
      beat.enter?.();
    };
    button.onclick = () => {
      audio?.play('clic');
      if (++at < beats.length) return show();
      root.replaceChildren();
      root.hidden = true;
      resolve(taxFiches(bundle, boss));
    };

    root.replaceChildren(h('section', { className: 'panneau taxe' }, title, line, scene, more, source, h('div', { className: 'pied' }, button)));
    document.body.dataset.ecran = 'taxe';
    root.hidden = false;
    draw();
    show();
    button.focus({ preventScroll: true });
  });
}
