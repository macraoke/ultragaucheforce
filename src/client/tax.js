// La scène de taxation, après le boss. Il est assis sur sa fortune, un tas de liasses qui remplit son cadre.
// Un seul écran, en deux temps, une idée chacun :
//   - avant « Taxer les riches » : sa fortune, à l'échelle de quelqu'un (et ce qu'elle rapporte en un an) ;
//   - après : la fortune s'efface du récit (le tas et sa légende la gardent). D'abord, en petit, d'où vient l'argent
//     (2 % par an, combien ça fait) ; dessous, en aussi gros que la fortune, ce que ça paierait ; puis ce que chacun paie
//     déjà : autour de 52 % pour presque tout le monde, 27 % pour les milliardaires, ensemble. La part des 2 % quitte le tas,
//     en or, pour la caisse commune : un repère « 2 % » la désigne, puis ses liasses filent vers ce qu'elle paierait.
// L'échelle et l'exemple se tirent au hasard dans les fiches sourcées de `content/fiches/` (clés `compare` et
// `finance`) : d'une partie à l'autre, ce ne sont pas les mêmes. Le bouton suivant reprend un slogan scandé en manif.

import { h, link, frenchNumber, plural, round, money, billions, de } from './dom.js';
import { sprite } from './sprites.js';
import { TAX_RATES, taxFiches, taxScales, taxUses } from './collection.js';

const RATE = 0.02; // l'impôt plancher discuté : 2 % par an
/** Choix confirmé par Valentin : un exemple n'est tiré que si 2 % de la fortune en paient au moins dix (« 2 Canadair » ne dit rien). */
export const MIN_COUNT = 10;
const STACKS = 380; // le tas compte entre 285 et 380 liasses, quelle que soit la fortune : il remplit toujours son cadre
const STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8]; // ce que vaut une liasse : un de ces nombres × 10ⁿ années de revenus
const CELL = { w: 6, h: 4 }; // une liasse, en pixels
const SEAT = 8; // largeur du sommet du tas, en liasses : de quoi asseoir le boss
const SIDE = 22; // de chaque côté du tas : le héros à gauche, la caisse commune à droite
const GROUND = 8;
const SINK = 8; // le boss s'enfonce un peu dans son tas
const GUARD = 450; // ms pendant lesquelles le bouton n'écoute pas, à l'ouverture et après un appui
const SWAP = 260; // ms : la fortune s'efface du récit, puis ce que ça paierait prend sa place
const FLY = 1300; // ms : les liasses d'or quittent le tas pour la caisse commune
const STREAM = 8; // liasses d'or qui filent de la caisse vers ce que ça paierait

/**
 * Le bouton qui mène au bilan du niveau : un slogan tiré au hasard. « On lâche rien ! », et des slogans courts
 * réellement scandés en manif, recopiés tels quels de `content/pancartes/` (un test vérifie qu'ils y sont).
 */
export const SLOGANS = [
  'On lâche rien !',
  'ON EST LÀ, MÊME SI MACRON LE VEUT PAS',
  'REJOIGNEZ-NOUS, NE NOUS REGARDEZ PAS',
  'LES PETITS PAS, ÇA SUFFIT PAS',
  'PARIS DEBOUT SOULÈVE-TOI !',
  'AH, ANTI, ANTICAPITALISTE !',
  'GRÈVER, C\'EST RÊVER GRAVE.',
];

export { round, money }; // arrondis vers le bas : voir `dom.js`
/** Ce que vaut une fiche sur un an : sa valeur, douze fois si elle est donnée par mois (`par: mois`). */
export const perYear = (fact) => fact.valeur * (fact.par === 'mois' ? 12 : 1);

/**
 * Ce que vaut une liasse, en années de revenus : le plus petit des nombres ronds qui garde le tas sous STACKS liasses.
 * Dès un dixième d'année : une fortune d'un milliard, comptée en revenus d'un patron du CAC 40, fait moins de
 * 285 années, et des liasses d'un an laisseraient le cadre à moitié vide.
 */
export function stackYearsFor(years) {
  for (let power = -1; power < 15; power++) {
    for (const step of STEPS) {
      const value = Math.round(step * 10 ** power * 10) / 10;
      if (years / value <= STACKS) return value;
    }
  }
  return Infinity;
}

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
  const stackYears = stackYearsFor(years);
  const yearly = rent.length && rent.every((f) => f?.valeur) ? rent.reduce((total, f) => total * f.valeur, 1) : 0;
  const tax = fortune * RATE;
  return { fortune, income, years, stackYears, unit: income * stackYears, yearly, tax, count: use ? tax / perYear(use) : 0 };
}

/** Les exemples qu'on peut tirer pour cette fortune : ceux dont 2 % paient au moins MIN_COUNT. */
export const usesFor = (bundle, billionsOwned) =>
  taxUses(bundle).filter((use) => (billionsOwned * 1e9 * RATE) / perYear(use) >= MIN_COUNT);

const last = {}; // le dernier tirage de chaque sorte : on en change à la partie suivante
/** Tire au hasard dans une liste, autre chose que la fois précédente s'il y a le choix. */
export function draw(kind, list, random = Math.random) {
  const pool = list.length > 1 ? list.filter((f) => (f.id ?? f) !== last[kind]) : list;
  const pick = pool[Math.floor(random() * pool.length)];
  last[kind] = pick?.id ?? pick;
  return pick;
}

/**
 * Les liasses du tas, de bas en haut : chaque rangée a une liasse de moins que celle du dessous, et le sommet
 * reste assez large pour s'y asseoir. Le canvas est taillé sur le tas : agrandi, le tas remplit son cadre.
 */
export function heap(count) {
  let base = SEAT;
  for (let room = SEAT; room < count;) room += ++base;
  const stacks = [];
  for (let row = 0, width = base; stacks.length < count; row++, width--) {
    const n = Math.min(width, count - stacks.length);
    const left = SIDE + ((base - n) * CELL.w) / 2;
    for (let i = 0; i < n; i++) stacks.push({ x: left + i * CELL.w, row });
  }
  return { stacks, width: 2 * SIDE + base * CELL.w, rows: (stacks.at(-1)?.row ?? 0) + 1 };
}

function drawStack(ctx, x, y, gold = false) {
  ctx.fillStyle = gold ? '#c98f1e' : '#1f6b4a';
  ctx.fillRect(x, y, CELL.w - 1, CELL.h - 1);
  ctx.fillStyle = gold ? '#f6c21c' : '#38b764';
  ctx.fillRect(x + 1, y, CELL.w - 3, CELL.h - 2);
  ctx.fillStyle = gold ? '#fff3b0' : '#f6c21c';
  ctx.fillRect(x + 2, y + 1, 1, 1);
}

/** Les sources d'une étape, en petit : le nom de chaque page, cliquable. Une adresse n'y figure qu'une fois. */
function sourcesOf(facts) {
  const seen = new Set();
  const names = {};
  const links = facts.filter((f) => f && !seen.has(f.source.url) && seen.add(f.source.url)).map((f) => {
    const name = f.source.titre.split(' — ')[0];
    names[name] = (names[name] || 0) + 1;
    return link(f.source.url, names[name] > 1 ? `${name} (${names[name]})` : name); // deux rapports d'une même maison
  });
  return links.length ? h('small', { className: 'source' }, links.map((l, i) => [i > 0 && ' · ', l])) : null;
}

/** Une étape du récit : ce dont on parle, le grand nombre, une phrase, ses sources. */
const step = (className, label, number, text, facts) => h('li', { className },
  h('p', { className: 'etiquette' }, label), number, h('p', { className: 'phrase' }, text, ' ', sourcesOf(facts)));

/**
 * @returns {Promise<{learned: string[], said: {caption: string, result: string} | null}>}
 *   les fiches à noter comme découvertes, et ce que l'écran a dit des 2 % (pour l'image à partager)
 */
export function showTaxScene(root, bundle, boss, { audio = null, hero = null, pick = draw } = {}) {
  return new Promise((resolve) => {
    const fiche = (id) => bundle.fiches[id];
    // Le dictionnaire : à qui comparer la fortune, et ce que la taxe paierait. Tirés au hasard à chaque partie.
    const scale = pick('compare', taxScales(bundle));
    const use = pick('finance', usesFor(bundle, boss.fortune.montant || 0));
    if (!boss.fortune.montant || !scale) return resolve({ learned: [], said: null });
    const estimate = fiche(boss.fortune.fiche); // d'où vient le montant de la fortune
    // Ce que la fortune rapporte en un an : un dividende par action multiplié par un nombre d'actions, chacun avec sa source.
    const rent = boss.fortune.rente.map(fiche);
    const { fortune, years, stackYears, unit, yearly, tax, count } = taxNumbers(boss.fortune.montant, scale, use, rent);
    const base = Math.round(fortune / unit);
    const gained = Math.round(yearly / unit);
    const taken = Math.max(1, Math.round(tax / unit));
    const pile = heap(base + gained);
    const player = hero || Object.values(bundle.heros)[0];
    const throne = sprite(boss.sprites.repos, bundle.palette, true);
    const you = sprite(player.sprites.repos, bundle.palette);
    const W = pile.width;
    const H = GROUND + pile.rows * CELL.h + throne.height - SINK + 4;
    const floor = H - GROUND;
    const stacks = pile.stacks.map((s) => ({ x: s.x, y: floor - (s.row + 1) * CELL.h }));
    const top = Math.min(...stacks.slice(0, base).map((s) => s.y));
    const chest = { x: W - SIDE + 3, y: floor - 10, w: SIDE - 6, h: 10 }; // la caisse commune, à droite

    const scene = h('canvas', { className: 'pixel', width: W, height: H });
    const ctx = scene.getContext('2d');
    const state = { rain: 0, fly: 0 }; // 0 → 1 : les dividendes tombent sur le tas, puis les 2 % s'en vont
    const paint = () => {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#333c57';
      ctx.fillRect(0, floor, W, GROUND);
      const leavingFrom = stacks.length - taken;
      stacks.forEach((s, i) => {
        let { x, y } = s;
        if (i >= base) { // une liasse de dividendes : elle tombe du ciel
          const t = Math.min(1, Math.max(0, state.rain * 1.5 - ((i - base) / Math.max(1, gained)) * 0.5));
          if (t <= 0) return;
          y = -CELL.h + (s.y + CELL.h) * t * t;
        }
        const leaving = i >= leavingFrom && state.fly > 0;
        if (leaving) {
          // la part des 2 %, en or, s'envole en cloche vers la caisse commune et s'y range
          const t = Math.min(1, Math.max(0, state.fly * 1.6 - ((stacks.length - i) / taken) * 0.6));
          const k = i - leavingFrom;
          const to = { x: chest.x + 1 + (k % 2) * (CELL.w - 1), y: chest.y - CELL.h * (1 + Math.floor(k / 2)) + 2 };
          x += (to.x - x) * t;
          y += (to.y - y) * t - Math.sin(t * Math.PI) * 30;
        }
        drawStack(ctx, Math.round(x), Math.round(y), leaving);
      });
      ctx.drawImage(throne, Math.round(W / 2 - throne.width / 2), top - throne.height + SINK);
      ctx.drawImage(you, 4, floor - you.height);
      if (state.fly > 0) {
        ctx.fillStyle = '#f6c21c';
        ctx.fillRect(chest.x, chest.y, chest.w, chest.h);
        ctx.fillStyle = '#1a1c2c';
        ctx.fillRect(chest.x + 2, chest.y + 2, chest.w - 4, 2);
      }
    };
    const runs = { rain: 0, fly: 0 }; // le numéro de l'animation en cours de chaque sorte : une plus récente l'arrête
    /** Fait passer `key` de 0 à 1 ; arrive à l'image finale même si l'onglet est en arrière-plan. */
    const animate = (key, ms) => {
      const run = ++runs[key];
      const start = performance.now();
      const frame = (now) => {
        if (run !== runs[key]) return;
        state[key] = Math.min(1, (now - start) / ms);
        paint();
        if (state[key] < 1) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      setTimeout(() => {
        if (run !== runs[key]) return;
        state[key] = 1;
        paint();
      }, ms + 200);
    };
    /** Arrête `key` sur son image finale. */
    const finish = (key) => {
      runs[key]++;
      state[key] = 1;
    };

    const owner = boss.inspiration ? `la famille ${de(boss.inspiration)}` : boss.nom;
    const under = yearly > tax; // 2 % pèsent moins que ce que la fortune rapporte en un an
    const rule = fiche('impot-plancher');
    const [most, billionaires] = TAX_RATES.map(fiche);

    // La légende, sous le tas : ce que vaut une liasse ; après la taxe, ce que sont les liasses d'or.
    const goldKey = h('span', { className: 'cle', hidden: true }, h('i', { className: 'liasse or' }), ' 2 % par an');
    const legend = h('figcaption', { className: 'legende' },
      h('span', { className: 'cle' }, h('i', { className: 'liasse' }), ` 1 liasse = ${frenchNumber(stackYears, stackYears % 1 ? 1 : 0)} ${plural(stackYears, 'an', 'ans')} de revenus ${de(scale.compare)}`),
      goldKey);
    // Le repère des 2 %, au-dessus de la caisse commune où les liasses d'or se rangent : ce qu'elles valent.
    const mark = h('p', { className: 'repere', hidden: true }, h('b', {}, '2 %'), ` = ${money(tax)}`);
    const frame = h('div', { className: 'cadre' }, scene, mark);
    const figure = h('figure', { className: 'tas' }, frame, legend);
    /** Le canvas garde ses proportions (`object-fit: contain`) : un point du tas, en pixels de la page, dans le cadre. */
    const onPage = (x, y) => {
      const r = scene.getBoundingClientRect();
      const s = Math.min(r.width / W, r.height / H);
      return { x: (r.width - W * s) / 2 + x * s, y: (r.height - H * s) / 2 + y * s, rect: r };
    };
    const chestTop = () => onPage(chest.x + chest.w / 2, chest.y - CELL.h * Math.ceil(taken / 2) + 1);
    const placeMark = () => {
      const { x, y } = chestTop();
      mark.style.left = `${x}px`;
      mark.style.top = `${y}px`;
    };
    addEventListener('resize', placeMark);
    const flying = new Set(); // les liasses d'or en vol, hors du panneau
    /** L'écran quitté, au clic final ou autrement : plus d'écouteur, plus de liasses en vol. */
    const leave = () => {
      removeEventListener('resize', placeMark);
      flying.forEach((bill) => bill.remove());
      flying.clear();
      watch.disconnect();
    };
    const watch = new MutationObserver(() => { if (!panel.isConnected) leave(); });

    // Avant la taxe : sa fortune.
    const first = step('fortune', `La fortune ${de(owner)}`, h('p', { className: 'montant' }, `${billions(boss.fortune.montant)} d’euros`),
      [`${round(years)} ans de revenus ${de(scale.compare)}.`, yearly > 0 && ` Rien qu’en dividendes, elle rapporte ${money(yearly)} par an.`],
      [estimate, scale, ...(yearly > 0 ? rent : [])]);
    // Taxée à 2 % : au plus, puisque l'impôt est différentiel. La fortune s'efface du récit, mais ce nombre en découle :
    // il garde la source de son estimation, et « Moins que ses dividendes » celles des dividendes.
    const second = step('impot', 'Taxée à 2 % par an', h('p', { className: 'nombre' }, money(tax)),
      [`Au plus : on déduit les impôts déjà payés sur ses revenus.`, under && ' Moins que ses dividendes.'], [rule, estimate, ...(under ? rent : [])]);
    // Ce que ça paierait : le titre, après la taxe.
    const result = use ? `${round(count)} ${use.finance}` : `Au plus ${money(tax)} par an`;
    const third = use && step('paie', 'Ces 2 % paieraient, à eux seuls', h('p', { className: 'nombre' }, h('b', {}, round(count)), ` ${use.finance}`),
      `${use.ponctuel ? 'En un an' : 'Chaque année'}, au plus.`, [use]);
    // Ce que chacun paie déjà : les deux taux, côte à côte.
    // « ≈ 52 % » : le rapport dit « close to » 52 % ; les 27 % des milliardaires, eux, sont fermes (« only pay 27% »).
    const bar = (label, fact, about = '') => h('p', { className: 'barre' }, h('span', {}, label),
      h('i', { style: `--part: ${fact.valeur}` }), h('b', {}, `${about}${fact.valeur} %`));
    const fourth = most && billionaires && step('juste', 'Ce que chacun paie déjà',
      h('div', { className: 'barres' }, bar('Presque tout le monde', most, '≈ '), bar('Les milliardaires', billionaires)),
      'Tous impôts et cotisations compris, en part du revenu, en 2016.', [most, billionaires]);
    // Après la taxe, d'où vient l'argent, puis ce que ça paierait, en gros (sans exemple tiré : les 2 % eux-mêmes, en gros).
    const after = [second, third, fourth].filter(Boolean);
    (third || second).classList.add('titre');
    after.forEach((li, i) => {
      li.hidden = true;
      li.style.setProperty('--rang', i);
    });

    // L'image à partager garde la réserve de l'écran : « jusqu'à », puisque l'impôt est différentiel.
    const said = { result, caption: use ? `2 % de la fortune ${de(owner)}, ${use.ponctuel ? 'en un an' : 'chaque année'}, c’est jusqu’à :` : `2 % de la fortune ${de(owner)} :` };
    const button = h('button', { type: 'button', className: 'gros' }, 'Taxer les riches');
    const story = h('ol', { className: 'etapes recit' }, first, after);
    const panel = h('section', { className: 'panneau taxe' }, figure, story, h('div', { className: 'pied' }, button));
    let taxed = false;
    // Le bouton a la main dès l'ouverture : un appui sur Entrée (la touche de tir) juste après la chute du boss, ou
    // la touche gardée enfoncée, ne doit ni taxer ni passer le résultat sans qu'on l'ait vu. Même délai que le carton.
    let ready = performance.now() + GUARD;
    const still = () => document.body.classList.contains('sobre') || matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Les liasses d'or quittent la caisse et filent vers ce que ça paierait, qui les reçoit.
    const target = (third || second).querySelector('.nombre');
    const receive = () => target.closest('li').classList.add('recoit');
    const stream = () => {
      if (!panel.isConnected) return;
      const from = chestTop();
      const to = target.getBoundingClientRect();
      const start = { x: from.rect.left + from.x, y: from.rect.top + from.y };
      const end = { x: to.left + Math.min(to.width, 120) / 2, y: to.top + to.height / 2 };
      for (let i = 0; i < STREAM; i++) {
        const bill = h('i', { className: 'liasse or volante' });
        bill.style.left = `${start.x}px`;
        bill.style.top = `${start.y}px`;
        document.body.append(bill);
        flying.add(bill);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const flight = bill.animate([
          { transform: 'translate(-50%, -50%)', opacity: 0 },
          { transform: `translate(calc(${dx * 0.5}px - 50%), calc(${dy * 0.5 - 60}px - 50%))`, opacity: 1, offset: 0.5 },
          { transform: `translate(calc(${dx}px - 50%), calc(${dy}px - 50%)) scale(.6)`, opacity: 0.9 },
        ], { duration: 700, delay: i * 90, easing: 'ease-in', fill: 'both' });
        flight.onfinish = () => {
          bill.remove();
          flying.delete(bill);
          if (i === STREAM - 1) receive();
        };
      }
    };
    button.onclick = () => {
      if (performance.now() < ready) return;
      ready = performance.now() + GUARD;
      audio?.play('clic');
      if (taxed) {
        leave();
        root.replaceChildren();
        root.hidden = true;
        return resolve({ learned: taxFiches(bundle, boss, [scale, use].filter(Boolean)), said });
      }
      taxed = true;
      audio?.play('tampon');
      audio?.play('sauvetage');
      clearTimeout(rainTimer); // les dividendes sont tombés, ou ne tombent plus : ils ne retombent pas pendant l'envol
      finish('rain');
      // Même écran, deuxième temps : la fortune s'efface du récit, ce que ça paierait prend sa place. Effets réduits : d'un coup,
      // les liasses d'or déjà dans la caisse, le repère posé, sans liasses qui filent.
      const swap = () => {
        first.hidden = true;
        after.forEach((li) => { li.hidden = false; });
        panel.classList.add('faite');
      };
      const showMark = () => {
        placeMark();
        mark.hidden = false;
      };
      if (still()) {
        finish('fly');
        paint();
        swap();
        showMark();
        receive();
      } else {
        animate('fly', FLY);
        first.classList.add('part');
        setTimeout(swap, SWAP);
        setTimeout(() => {
          showMark();
          stream();
        }, FLY);
      }
      goldKey.hidden = false;
      // Le bouton suivant mène au bilan du niveau : un slogan de manif, tiré au hasard.
      const slogan = pick('slogan', SLOGANS);
      const line = bundle.pancartes?.find((p) => p.texte === slogan);
      button.textContent = slogan;
      if (line) button.title = line.credit.split(' — ')[0];
    };

    root.replaceChildren(panel);
    watch.observe(root, { childList: true });
    document.body.dataset.ecran = 'taxe';
    root.hidden = false;
    paint();
    const rainTimer = yearly ? setTimeout(() => animate('rain', 1000), 500) : 0;
    button.focus({ preventScroll: true });
  });
}
