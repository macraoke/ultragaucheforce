// La scène de taxation, après le boss. Il est assis sur sa fortune. Deux écrans :
// 1. la fortune, à l'échelle de quelqu'un, et ce qu'elle rapporte en un an ;
// 2. ce que 2 % paieraient, et un fait frappant sur les inégalités.
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
/** Un grand nombre arrondi vers le bas à deux ou trois chiffres : 64 640 → « 64 000 », 247 → « 240 ». */
const round = (n) => {
  const step = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, n))) - 1);
  return frenchNumber(Math.floor(n / step) * step);
};
const last = {}; // la dernière comparaison montrée de chaque sorte : on en change à la partie suivante
/** Tire une comparaison au hasard, autre que la précédente s'il y a le choix. */
function draw(kind, list) {
  const pool = list.length > 1 ? list.filter((f) => f.id !== last[kind]) : list;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  last[kind] = pick?.id;
  return pick;
}
/** La ligne des sources d'un temps : chaque nombre affiché renvoie à la page où il se lit. */
const sourcesOf = (facts) => h('p', { className: 'source' }, facts.length > 1 ? 'Sources : ' : 'Source : ',
  facts.map((fact, i) => [i > 0 && ' · ', link(fact.source.url, fact.source.titre.split(' — ')[0])]));

/**
 * @returns {Promise<string[]>} les fiches à noter comme découvertes
 */
export function showTaxScene(root, bundle, boss, { audio = null, hero = null, pick = draw } = {}) {
  return new Promise((resolve) => {
    const fiche = (id) => bundle.fiches[id];
    const fortune = boss.fortune.montant * 1e9;
    // Le dictionnaire : à qui comparer la fortune, et ce que la taxe paierait. Tirés au hasard à chaque partie.
    const scale = pick('compare', taxScales(bundle));
    const use = pick('finance', taxUses(bundle));
    const shock = pick('choc', taxShocks(bundle));
    if (!fortune || !scale) return resolve([]);
    const income = scale.valeur * (scale.par === 'mois' ? 12 : 1); // revenu d'une année
    const years = fortune / income;
    const stackYears = STACK_YEARS.find((y) => years / y <= STACKS) ?? STACK_YEARS.at(-1);
    const unit = income * stackYears;
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

    // Chaque écran : un grand titre, une phrase, toutes ses sources.
    const beats = [
      {
        title: `${billions(fortune)} milliards d’euros`,
        line: `La fortune de ${owner} : ${round(years)} ans de revenus d’${scale.compare}.`,
        more: [yearly > 0 && h('p', { className: 'qui' }, `Rien qu’en dividendes, elle rapporte ${billions(yearly)} milliards par an.`), legend],
        source: [estimate, scale, ...(yearly > 0 ? rent : [])],
        enter: () => yearly && setTimeout(() => animate('rain', 1000), 500),
      },
      {
        // Ce que 2 % paieraient. L'impôt est différentiel : c'est un maximum, la phrase le dit.
        title: use ? `${round(tax / use.valeur)} ${use.finance}` : `Au plus ${billions(tax)} milliards par an`,
        line: use
          ? `Ce que paieraient 2 % de cette fortune${use.ponctuel ? ' en un an' : ', chaque année'} : au plus ${billions(tax)} milliards${under ? ', moins que ses dividendes' : ''}.`
          : `2 % de cette fortune${under ? ' : moins que ses dividendes' : ''}.`,
        more: shock && h('article', { className: 'choc' }, h('b', {}, shock.titre), h('p', {}, shock.texte)),
        source: [use, estimate, rule, shock], button: 'Taxer 2 %', compact: true,
        enter: () => {
          audio?.play('tampon');
          audio?.play('sauvetage');
          state.rain = 1;
          animate('fly', 1300);
        },
      },
    ];

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
      scene.classList.toggle('reduit', Boolean(beat.compact)); // deuxième écran : le tas se fait petit, le fait prend la place
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
      resolve(taxFiches(bundle, boss, [scale, use, shock].filter(Boolean)));
    };

    root.replaceChildren(h('section', { className: 'panneau taxe' }, title, line, scene, more, source, h('div', { className: 'pied' }, button)));
    document.body.dataset.ecran = 'taxe';
    root.hidden = false;
    draw();
    show();
    button.focus({ preventScroll: true });
  });
}
