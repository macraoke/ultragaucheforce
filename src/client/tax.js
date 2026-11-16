// La scène de taxation, après le boss. Il est assis sur sa fortune. Un seul écran :
// la fortune, à l'échelle de quelqu'un, et ce qu'elle rapporte en un an ; puis le bouton « Taxer 2 % » fait
// apparaître au même endroit ce que 2 % paieraient et un fait frappant sur les inégalités.
// L'échelle, l'exemple et le fait se tirent au hasard dans les fiches sourcées de `content/fiches/` (clés `compare`,
// `finance`, `choc`) : d'une partie à l'autre, ce ne sont pas les mêmes.

import { h, link, frenchNumber } from './dom.js';
import { sprite } from './sprites.js';
import { taxFiches, taxScales, taxUses, taxShocks } from './collection.js';

const RATE = 0.02; // l'impôt plancher discuté : 2 % par an
const STACKS = 620; // le tas dessiné ne dépasse pas ce nombre de liasses
const STACK_YEARS = [100, 200, 500, 1000, 2000, 5000, 1e4, 2e4, 5e4, 1e5, 2e5, 5e5, 1e6, 2e6, 5e6, 1e7]; // ce que vaut une liasse, en années de revenus
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
/** Un grand nombre arrondi vers le bas à deux chiffres : 64 640 → « 64 000 », 247 → « 240 ». Jamais plus que le vrai. */
export const round = (n) => {
  const step = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, n))) - 1);
  return frenchNumber(Math.floor(n / step) * step);
};
/** Ce que vaut une fiche sur un an : sa valeur, douze fois si elle est donnée par mois (`par: mois`). */
export const perYear = (fact) => fact.valeur * (fact.par === 'mois' ? 12 : 1);

/**
 * Les nombres de l'écran de taxe, sans rien dessiner.
 * @param {number} billionsOwned  la fortune, en milliards d'euros
 * @param {object} scale          la fiche `compare` : le revenu de quelqu'un
 * @param {object | null} use     la fiche `finance` : ce que la taxe paierait
 * @param {object[]} rent         les fiches dont le produit donne ce que la fortune rapporte en un an
 */
export function taxNumbers(billionsOwned, scale, use = null, rent = []) {
  const fortune = billionsOwned * 1e9;
  const income = perYear(scale);
  const years = fortune / income;
  const stackYears = STACK_YEARS.find((y) => years / y <= STACKS) ?? STACK_YEARS.at(-1);
  const yearly = rent.length && rent.every((f) => f?.valeur) ? rent.reduce((total, f) => total * f.valeur, 1) : 0;
  const tax = fortune * RATE;
  return { fortune, income, years, stackYears, unit: income * stackYears, yearly, tax, count: use ? tax / perYear(use) : 0 };
}

const last = {}; // la dernière comparaison montrée de chaque sorte : on en change à la partie suivante
/** Tire une comparaison au hasard, autre que la précédente s'il y a le choix. */
export function draw(kind, list, random = Math.random) {
  const pool = list.length > 1 ? list.filter((f) => f.id !== last[kind]) : list;
  const pick = pool[Math.floor(random() * pool.length)];
  last[kind] = pick?.id;
  return pick;
}
/** La ligne des sources : chaque nombre affiché renvoie à la page où il se lit. Une adresse n'y figure qu'une fois. */
function sourcesOf(facts) {
  const seen = new Set();
  const names = {};
  const links = facts.filter((f) => f && !seen.has(f.source.url) && seen.add(f.source.url)).map((f) => {
    const name = f.source.titre.split(' — ')[0];
    names[name] = (names[name] || 0) + 1;
    return link(f.source.url, names[name] > 1 ? `${name} (${names[name]})` : name); // deux rapports d'une même maison
  });
  return h('p', { className: 'source' }, links.length > 1 ? 'Sources : ' : 'Source : ', links.map((l, i) => [i > 0 && ' · ', l]));
}

/**
 * @returns {Promise<{learned: string[], said: {caption: string, result: string} | null}>}
 *   les fiches à noter comme découvertes, et ce que l'écran a dit des 2 % (pour l'image à partager)
 */
export function showTaxScene(root, bundle, boss, { audio = null, hero = null, pick = draw } = {}) {
  return new Promise((resolve) => {
    const fiche = (id) => bundle.fiches[id];
    // Le dictionnaire : à qui comparer la fortune, et ce que la taxe paierait. Tirés au hasard à chaque partie.
    const scale = pick('compare', taxScales(bundle));
    const use = pick('finance', taxUses(bundle));
    const shock = pick('choc', taxShocks(bundle));
    if (!boss.fortune.montant || !scale) return resolve({ learned: [], said: null });
    const estimate = fiche(boss.fortune.fiche); // d'où vient le montant de la fortune
    // Ce que la fortune rapporte en un an : un dividende par action multiplié par un nombre d'actions, chacun avec sa source.
    const rent = boss.fortune.rente.map(fiche);
    const { fortune, years, stackYears, unit, yearly, tax, count } = taxNumbers(boss.fortune.montant, scale, use, rent);
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
      h('i', { className: 'liasse' }), ` une liasse : ${frenchNumber(stackYears)} ans de revenus d’${scale.compare}`);
    const rule = fiche('impot-plancher');
    const owner = boss.inspiration ? `la famille de ${boss.inspiration}` : boss.nom;
    const under = yearly > tax; // 2 % pèsent moins que ce que la fortune rapporte en un an

    // Avant de taxer : la fortune, son échelle, ce qu'elle rapporte.
    const title = h('p', { className: 'montant' }, `${billions(fortune)} milliards d’euros`);
    const line = h('p', { className: 'gros' }, `La fortune de ${owner} : ${round(years)} ans de revenus d’${scale.compare}.`);
    const before = h('div', { className: 'detail' },
      yearly > 0 && h('p', { className: 'qui' }, `Rien qu’en dividendes, elle rapporte ${billions(yearly)} milliards par an.`), legend);
    // Après : ce que 2 % paieraient (au plus : l'impôt est différentiel), et un fait frappant.
    const result = use ? `${round(count)} ${use.finance}` : `Au plus ${billions(tax)} milliards par an`;
    // L'image à partager garde la réserve de l'écran : « jusqu'à », puisque l'impôt est différentiel.
    const said = { result, caption: use ? `2 % de la fortune de ${owner}, ${use.ponctuel ? 'en un an' : 'chaque année'}, c’est jusqu’à :` : `2 % de la fortune de ${owner} :` };
    const after = h('div', { className: 'detail apres', hidden: true },
      h('p', { className: 'resultat' }, result),
      h('p', { className: 'qui' }, use
        ? `Ce que paieraient 2 % de cette fortune${use.ponctuel ? ' en un an' : ', chaque année'} : au plus ${billions(tax)} milliards${under ? ', moins que ses dividendes' : ''}.`
        : `2 % de cette fortune${under ? ' : moins que ses dividendes' : ''}.`),
      shock && h('article', { className: 'choc' }, h('b', {}, shock.titre), h('p', {}, shock.texte)));
    const source = h('div', {}, sourcesOf([estimate, scale, ...(yearly > 0 ? rent : [])]));
    const button = h('button', { type: 'button', className: 'gros' }, 'Taxer 2 %');
    const panel = h('section', { className: 'panneau taxe' }, title, line, scene, before, after, source, h('div', { className: 'pied' }, button));
    let taxed = false;
    button.onclick = () => {
      audio?.play('clic');
      if (taxed) {
        root.replaceChildren();
        root.hidden = true;
        return resolve({ learned: taxFiches(bundle, boss, [scale, use, shock].filter(Boolean)), said });
      }
      taxed = true;
      audio?.play('tampon');
      audio?.play('sauvetage');
      state.rain = 1;
      animate('fly', 1300);
      panel.classList.add('faite'); // même écran : le tas se fait petit, le résultat prend la place
      before.hidden = true;
      after.hidden = false;
      source.replaceChildren(sourcesOf([estimate, scale, ...(yearly > 0 ? rent : []), use, rule, shock]));
      button.textContent = 'Continuer';
    };

    root.replaceChildren(panel);
    document.body.dataset.ecran = 'taxe';
    root.hidden = false;
    draw();
    if (yearly) setTimeout(() => animate('rain', 1000), 500);
    button.focus({ preventScroll: true });
  });
}
