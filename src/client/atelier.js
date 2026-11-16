// L'Atelier : dessiner un niveau avec les vraies tuiles et les vrais personnages, le tester, le proposer.
// Le niveau reste une fiche texte (voir atelier-modele.js) ; cet écran la peint, à la souris ou au doigt.

import { h } from './dom.js';
import { sprite } from './sprites.js';
import { SKIES } from './render.js';
import { storeSave } from './save.js';
import { REPO } from './config.js';
import { checkLevel, TILE, BACKDROPS } from '../content/rules.js';
import {
  TEMPLATE, History, readLevel, writeLevel, getField, setField, legendOf, paint, line, box, resize, cellOfError, plain, proposal,
} from './atelier-modele.js';

const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4];
const STEP = 5; // lignes ou colonnes ajoutées ou retirées d'un coup
const MARGIN = 2 * TILE; // ce qu'on peut voir au-delà des bords de la carte
const ICON = 68; // côté d'une icône de la palette, en pixels de dessin (affichée deux fois plus petite)
const SIDES = [['haut', 'Haut'], ['bas', 'Bas'], ['gauche', 'Gauche'], ['droite', 'Droite']];
const BACKDROP_NAMES = { campagne: 'Campagne', ville: 'Ville', citadelle: 'Citadelle' };
const PROPS = { S: 'sortie', K: 'cage', Q: 'piquet', E: 'pancarte' }; // les repères qui se dessinent avec un décor
const has = (obj, key) => Object.hasOwn(obj, key);
/** La fiche qui porte cet identifiant, ou rien : un identifiant tapé à la main peut être n'importe quoi. */
const own = (table, id) => (has(table, id) ? table[id] : null);

/** Le cercle de la nasse. */
function ring(ctx, x, y, radius, width) {
  ctx.save();
  ctx.strokeStyle = '#e43b44';
  ctx.lineWidth = width;
  ctx.setLineDash([width * 2.5, width * 1.5]);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * @param {HTMLElement} root
 * @param {{bundle: object, save: object, test: (level: object) => void, back: () => void}} ctx
 */
export function showAtelier(root, { bundle, save, test, back }) {
  const { palette } = bundle;
  const bySymbol = Object.fromEntries(Object.values(bundle.tuiles).map((t) => [t.symbole, t]));
  const image = (def) => def?.sprites && (def.sprites.image || def.sprites.repos || Object.values(def.sprites)[0]);
  const anyHero = Object.values(bundle.heros).find((x) => x.statut !== 'test') || Object.values(bundle.heros)[0];
  // Ce que l'en-tête reçoit de lui-même quand un boss ou une nasse arrive sur la carte.
  const defaults = { boss: Object.keys(bundle.boss)[0], nasse: has(bundle.ennemis, 'crs') ? 'crs' : Object.keys(bundle.ennemis)[0] };

  let model = readLevel(save.brouillon) || readLevel(TEMPLATE);
  const history = new History();
  let typing = null; // les frappes dans un même champ ne font qu'un pas d'annulation
  let report = { level: null, errors: [] };
  let flaw = null; // la case de la première erreur
  let tool = 'pinceau'; // pinceau | gomme | main
  let rect = false;
  let behind = false; // les tuiles se posent sur les murs du fond
  let picked = null; // le choix de la palette
  let shown = 0; // le groupe ouvert
  let zoom = 0;
  const cam = { x: 0, y: 0 };
  let gesture = null;
  let hover = null;
  const pointers = new Map();
  let sign = null; // le panneau dont on écrit le texte
  let notice = '';
  let noticeTimer = 0;
  const live = new AbortController();

  // ---------------------------------------------------------------- la palette

  const item = (name, rows, brush) => ({ name, rows, brush });
  const things = (defs) => Object.entries(defs).map(([id, def]) => item(def.nom || id, image(def), { type: 'chose', id }));
  const groups = [
    ['Terrain', Object.values(bundle.tuiles).map((t) => item(t.nom, t.sprites.image, { type: 'tuile', char: t.symbole }))],
    ['Repères', [
      item('Départ', image(anyHero), { type: 'repere', char: 'D' }),
      item('Sortie', image(bundle.decors.sortie), { type: 'repere', char: 'S' }),
      item('Garde à vue', image(bundle.decors.cage), { type: 'repere', char: 'K' }),
      item('Piquet de grève', image(bundle.decors.piquet), { type: 'repere', char: 'Q' }),
      item('Pancarte à ramasser', image(bundle.decors.pancarte), { type: 'repere', char: 'E' }),
      item('Boss', image(own(bundle.boss, defaults.boss)), { type: 'repere', char: 'Y' }),
      item('Nasse', image(own(bundle.ennemis, defaults.nasse)), { type: 'repere', char: 'N' }),
      item('Panneau', image(bundle.decors.panneau), { type: 'panneau' }),
    ]],
    ['En face', things(bundle.ennemis)],
    ['La manif', things(bundle.recrues)],
    ['Décors', things(bundle.decors).filter((it) => !['panneau', ...Object.values(PROPS)].includes(it.brush.id))],
  ].map(([name, items]) => [name, items.filter((it) => it.rows)]);

  const icon = (it) => {
    const img = sprite(it.rows, palette);
    const canvas = h('canvas', { width: ICON, height: ICON });
    const c = canvas.getContext('2d');
    const scale = Math.min(4, ICON / img.width, ICON / img.height);
    c.imageSmoothingEnabled = scale < 2;
    c.drawImage(img, (ICON - img.width * scale) / 2, (ICON - img.height * scale) / 2, img.width * scale, img.height * scale);
    if (it.brush.char === 'N') ring(c, ICON / 2, ICON / 2, ICON / 2 - 5, 4);
    return canvas;
  };
  const pick = (it) => {
    picked = it;
    tool = 'pinceau';
    refresh();
  };
  for (const [, items] of groups) {
    for (const it of items) it.button = h('button', { type: 'button', title: it.name, onclick: () => pick(it) }, icon(it));
  }
  picked = groups[0][1].find((it) => it.brush.char === 'T') || groups[0][1][0];

  const toggle = (glyph, title, onclick) => h('button', { type: 'button', className: 'discret', title, onclick }, glyph);
  const eraserButton = toggle('⌫', 'Gomme', () => {
    tool = tool === 'gomme' ? 'pinceau' : 'gomme';
    refresh();
  });
  const rectButton = toggle('▭', 'Rectangle', () => {
    rect = !rect;
    refresh();
  });
  const handButton = toggle('✋', 'Déplacer', () => {
    tool = tool === 'main' ? 'pinceau' : 'main';
    refresh();
  });
  const tabs = groups.map(([name], i) => h('button', {
    type: 'button', className: 'discret', onclick: () => {
      shown = i;
      refresh();
    },
  }, name));
  const choices = h('div', { className: 'choix' });
  const behindBox = h('input', {
    type: 'checkbox', onchange: () => {
      behind = behindBox.checked;
      refresh();
    },
  });
  const behindRow = h('label', { className: 'case' }, behindBox, ' Mur du fond');

  /** Le pinceau du moment. */
  const brush = () => (tool === 'gomme' ? { type: 'gomme' } : { ...picked.brush, back: behind && picked.brush.type === 'tuile' });
  const paintsArea = () => ['tuile', 'gomme'].includes(brush().type);

  // ---------------------------------------------------------------- les réglages

  const field = (key, input, fallback = '') => {
    input.oninput = () => commit(setField(model, key, input.value.trim() || fallback), key);
    return input;
  };
  const titleInput = field('titre', h('input', { type: 'text' }), 'Sans titre');
  const authorInput = field('auteur', h('input', { type: 'text', placeholder: 'ton pseudo' }));
  const backdropButtons = BACKDROPS.map((id) => h('button', {
    type: 'button', className: 'discret', onclick: () => commit(setField(model, 'fond', id)),
  }, BACKDROP_NAMES[id] || id));
  const bossSelect = h('select', { onchange: () => commit(setField(model, 'boss', bossSelect.value)) },
    Object.entries(bundle.boss).map(([id, def]) => h('option', { value: id }, def.nom || id)));
  const bossRow = h('label', { className: 'ligne' }, h('span', {}, 'Boss'), bossSelect);
  const marchBox = h('input', { type: 'checkbox', onchange: () => commit(setField(model, 'cortege', marchBox.checked ? 'oui' : 'non')) });
  const sizeLabel = h('b', {});
  const grow = (side, delta) => {
    const next = resize(model, side, delta, defaults);
    if (next === model) return;
    commit(next);
    // La vue va au bord qui vient de bouger.
    if (side === 'haut') cam.y = -MARGIN;
    if (side === 'gauche') cam.x = -MARGIN;
    if (side === 'bas') cam.y = Infinity;
    if (side === 'droite') cam.x = Infinity;
    draw();
  };
  const settings = h('div', { className: 'reglages', hidden: true },
    h('label', { className: 'ligne' }, h('span', {}, 'Titre'), titleInput),
    h('label', { className: 'ligne' }, h('span', {}, 'Auteur'), authorInput),
    h('div', { className: 'ligne' }, h('span', {}, 'Fond'), backdropButtons),
    bossRow,
    h('label', { className: 'case' }, marchBox, ' Cortège'),
    h('div', { className: 'ligne' }, h('span', {}, 'Carte'), sizeLabel),
    SIDES.map(([side, label]) => h('div', { className: 'ligne' }, h('span', {}, label),
      h('button', { type: 'button', className: 'discret', title: `${label} : retirer`, onclick: () => grow(side, -STEP) }, '−'),
      h('button', { type: 'button', className: 'discret', title: `${label} : ajouter`, onclick: () => grow(side, STEP) }, '+'))),
    h('button', { type: 'button', className: 'discret', onclick: () => commit(readLevel(TEMPLATE)) }, 'Tout effacer'));

  // ---------------------------------------------------------------- la fiche, pour qui veut la copier

  const area = h('textarea', { spellcheck: false, autocapitalize: 'off' });
  const sheetNote = h('span', {});
  const sheet = h('div', { className: 'fiche', hidden: true }, area, h('div', { className: 'bas' },
    h('button', { type: 'button', onclick: () => closeText() }, 'Fermer'),
    h('button', { type: 'button', className: 'discret', onclick: () => copy(area.value) }, 'Copier'),
    sheetNote));
  const openText = () => {
    area.value = writeLevel(model);
    sheetNote.textContent = '';
    sheet.hidden = false;
    refresh();
  };
  /** Referme la fiche ; ce qu'on y a changé devient le niveau. Faux si elle n'a plus de carte. */
  const closeText = () => {
    if (sheet.hidden) return true;
    if (area.value !== writeLevel(model)) {
      const next = readLevel(area.value);
      if (!next) {
        sheetNote.textContent = 'Il manque la carte.';
        return false;
      }
      commit(next);
    }
    sheet.hidden = true;
    refresh();
    draw();
    return true;
  };
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      say('Copié.');
      return true;
    } catch {
      openText();
      area.select();
      say('Copie-le avec ton clavier.');
      return false;
    }
  };

  // ---------------------------------------------------------------- la barre et le pied

  const leave = (then) => {
    closeText();
    live.abort();
    then();
  };
  const ready = () => closeText() && !report.errors.length;
  const propose = async () => {
    if (!ready()) return;
    const { url, filled } = proposal(REPO, writeLevel(model), report.level.titre);
    if (!filled && await copy(writeLevel(model))) say('Copié : colle-le dans la page qui s’ouvre.');
    window.open(url, '_blank', 'noopener');
  };
  const travel = (way) => {
    const next = history[way](model);
    if (next === model) return;
    sign = null;
    typing = null;
    model = next;
    changed();
  };
  const settingsButton = h('button', {
    type: 'button', className: 'discret', onclick: () => {
      settings.hidden = !settings.hidden;
      refresh();
    },
  }, 'Réglages');
  const undoButton = h('button', { type: 'button', className: 'discret', title: 'Annuler', onclick: () => travel('undo') }, '↶');
  const redoButton = h('button', { type: 'button', className: 'discret', title: 'Rétablir', onclick: () => travel('redo') }, '↷');
  const textButton = h('button', { type: 'button', className: 'discret', onclick: () => (sheet.hidden ? openText() : closeText()) }, 'Texte');
  const testButton = h('button', { type: 'button', onclick: () => ready() && leave(() => test(report.level)) }, 'Tester');
  const proposeButton = h('button', { type: 'button', onclick: propose }, 'Proposer');

  const toolName = h('span', { className: 'outil' });
  const message = h('div', { className: 'message' });
  const signInput = h('input', {
    type: 'text', enterKeyHint: 'done',
    oninput: () => commit(setField(model, `panneau.${sign}`, signInput.value.trim() || '…'), `panneau.${sign}`),
    onkeydown: (e) => e.key === 'Enter' && closeSign(),
  });
  const signBox = h('label', { className: 'ecrire' }, 'Texte', signInput);
  const editSign = (digit) => {
    sign = digit;
    signInput.value = getField(model, `panneau.${digit}`).replace(/^…$/, '');
    refresh();
    signInput.focus();
  };
  const closeSign = () => {
    if (!sign) return;
    sign = null;
    refresh();
  };
  const say = (text) => {
    notice = text;
    refresh();
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      notice = '';
      if (panel.isConnected) refresh();
    }, 4000);
  };

  // ---------------------------------------------------------------- le dessin

  const canvas = h('canvas', {});
  const ctx = canvas.getContext('2d');
  const view = () => ({ w: canvas.clientWidth / zoom, h: canvas.clientHeight / zoom });
  const size = () => ({ w: model.rows[0].length * TILE, h: model.rows.length * TILE });

  /** Un zoom permis, où une case fait un nombre entier de pixels : pas de joint entre deux tuiles. */
  const snap = (z) => {
    const unit = TILE * (window.devicePixelRatio || 1);
    return Math.round(Math.max(ZOOMS[0], Math.min(ZOOMS.at(-1), z)) * unit) / unit;
  };

  /** Au premier dessin : une vingtaine de lignes à l'écran, des cases assez grosses pour un doigt, le départ en vue. */
  const frame = () => {
    const coarse = window.matchMedia?.('(pointer: coarse)').matches || document.body.classList.contains('tactile');
    const wanted = Math.max(coarse ? 1.5 : 1, canvas.clientHeight / (18 * TILE));
    zoom = snap(ZOOMS.reduce((best, z) => (Math.abs(z - wanted) < Math.abs(best - wanted) ? z : best)));
    const y = Math.max(0, model.rows.findIndex((row) => row.includes('D')));
    cam.x = Math.max(0, model.rows[y].indexOf('D')) * TILE - view().w / 4;
    cam.y = (y + 1) * TILE - view().h * 0.62;
  };

  /** La carte ne quitte pas la vue ; plus petite qu'elle, elle se centre. */
  const clamp = () => {
    const v = view();
    const s = size();
    cam.x = s.w + 2 * MARGIN <= v.w ? (s.w - v.w) / 2 : Math.max(-MARGIN, Math.min(s.w - v.w + MARGIN, cam.x));
    cam.y = s.h + 2 * MARGIN <= v.h ? (s.h - v.h) / 2 : Math.max(-MARGIN, Math.min(s.h - v.h + MARGIN, cam.y));
  };

  /** Change le zoom en gardant sous le pointeur ce qui s'y trouve. */
  const zoomTo = (next, px = canvas.clientWidth / 2, py = canvas.clientHeight / 2) => {
    const z = snap(next);
    cam.x += px / zoom - px / z;
    cam.y += py / zoom - py / z;
    zoom = z;
    draw();
  };
  const zoomStep = (way) => zoomTo(way > 0 ? ZOOMS.find((z) => z > zoom + 0.01) ?? zoom : ZOOMS.findLast((z) => z < zoom - 0.01) ?? zoom);

  const show = (cell) => {
    cam.x = (cell.x + 0.5) * TILE - view().w / 2;
    cam.y = (cell.y + 0.5) * TILE - view().h / 2;
    draw();
  };

  function draw() {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(cw * dpr) || canvas.height !== Math.round(ch * dpr)) {
      canvas.width = Math.round(cw * dpr);
      canvas.height = Math.round(ch * dpr);
    }
    if (!zoom) frame();
    clamp();
    const { rows, walls } = model;
    const s = size();
    const k = zoom * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10111c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(k, 0, 0, k, -Math.round(cam.x * k), -Math.round(cam.y * k));
    ctx.imageSmoothingEnabled = false;

    const [top, bottom] = SKIES[getField(model, 'fond')] || SKIES.campagne;
    const sky = ctx.createLinearGradient(0, 0, 0, s.h);
    sky.addColorStop(0, top);
    sky.addColorStop(1, bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, s.w, s.h);

    // Ce qui est en vue, plus de quoi dessiner un grand décor dont le pied est juste hors champ.
    const x0 = Math.max(0, Math.floor(cam.x / TILE) - 8);
    const x1 = Math.min(rows[0].length - 1, Math.floor((cam.x + cw / zoom) / TILE) + 8);
    const y0 = Math.max(0, Math.floor(cam.y / TILE));
    const y1 = Math.min(rows.length - 1, Math.floor((cam.y + ch / zoom) / TILE) + 8);
    const each = (grid, fn) => {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (grid[y][x] !== '.') fn(grid[y][x], x, y);
    };
    const legend = legendOf(model);
    const kind = (c) => {
      const id = legend[c];
      if (!id) return null;
      for (const type of ['ennemis', 'recrues', 'decors']) if (own(bundle[type], id)) return { type, def: bundle[type][id] };
      return null;
    };
    /** Un personnage ou un accessoire, les pieds en bas de sa case ; `left` : calé à gauche, comme un décor. */
    const stand = (rowsOf, x, y, { left = false, wide = TILE, flip = false } = {}) => {
      if (!rowsOf) return;
      const img = sprite(rowsOf, palette, flip);
      ctx.drawImage(img, left ? x * TILE : Math.round(x * TILE + wide / 2 - img.width / 2), (y + 1) * TILE - img.height);
    };

    if (walls.length) {
      each(walls, (c, x, y) => {
        if (bySymbol[c] && !bySymbol[rows[y][x]]) ctx.drawImage(sprite(bySymbol[c].sprites.image, palette, false, false, true), x * TILE, y * TILE);
      });
    }
    const front = [];
    each(rows, (c, x, y) => {
      const what = kind(c);
      if (what?.type !== 'decors') return;
      if (what.def.devant) front.push([what.def, x, y]);
      else stand(image(what.def), x, y, { left: true });
    });
    each(rows, (c, x, y) => {
      const tile = bySymbol[c];
      if (!tile) return;
      ctx.drawImage(sprite(tile.sprites.image, palette), x * TILE, y * TILE);
      if (tile.id === 'terre' && (y === 0 || !bySymbol[rows[y - 1][x]])) {
        ctx.fillStyle = '#38b764';
        ctx.fillRect(x * TILE, y * TILE, TILE, 3);
      }
    });
    const starter = image(own(bundle.heros, getField(model, 'heros').split('|')[0].trim()) || anyHero);
    const boss = image(own(bundle.boss, getField(model, 'boss')) || own(bundle.boss, defaults.boss));
    each(rows, (c, x, y) => {
      if (bySymbol[c]) return;
      const what = kind(c);
      if (what) {
        if (what.type !== 'decors') stand(image(what.def), x, y);
      } else if (PROPS[c]) stand(image(bundle.decors[PROPS[c]]), x, y, { wide: c === 'S' ? 3 * TILE : TILE });
      else if (c >= '1' && c <= '9') stand(image(bundle.decors.panneau), x, y);
      else if (c === 'Y') stand(boss, x, y, { flip: true });
      else if (c === 'N') ring(ctx, (x + 0.5) * TILE, (y + 0.5) * TILE, TILE * 1.4, 1.5);
      else if (c === 'D') {
        stand(starter, x, y);
        const head = (y + 1) * TILE - (starter ? sprite(starter, palette).height : TILE); // une flèche au-dessus du héros
        ctx.fillStyle = '#f6c21c';
        ctx.beginPath();
        ctx.moveTo((x + 0.5) * TILE - 4, head - 8);
        ctx.lineTo((x + 0.5) * TILE + 4, head - 8);
        ctx.lineTo((x + 0.5) * TILE, head - 3);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgb(228 59 68 / .65)'; // un signe que la fiche ne connaît pas
        ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    });
    for (const [def, x, y] of front) stand(image(def), x, y, { left: true });

    // Le quadrillage, fin, puis ce qu'on montre : l'erreur, le rectangle en cours, la case survolée.
    const hair = 1 / k;
    ctx.fillStyle = 'rgb(26 28 44 / .14)';
    for (let x = x0; x <= x1 + 1; x++) ctx.fillRect(x * TILE, y0 * TILE, hair, (y1 - y0 + 1) * TILE);
    for (let y = y0; y <= y1 + 1; y++) ctx.fillRect(x0 * TILE, y * TILE, (x1 - x0 + 1) * TILE, hair);
    const outline = (a, b, color, fill) => {
      const x = Math.min(a.x, b.x) * TILE;
      const y = Math.min(a.y, b.y) * TILE;
      const w = (Math.abs(a.x - b.x) + 1) * TILE;
      const hgt = (Math.abs(a.y - b.y) + 1) * TILE;
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, w, hgt);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(1, 2 / zoom);
      ctx.strokeRect(x, y, w, hgt);
    };
    if (flaw) outline(flaw, flaw, '#e43b44', 'rgb(228 59 68 / .35)');
    if (gesture?.type === 'rect') outline(gesture.from, gesture.to, '#f6c21c', 'rgb(246 194 28 / .25)');
    else if (hover && tool !== 'main') outline(hover, hover, '#f4f4f4');
  }

  // ---------------------------------------------------------------- les gestes

  /** Un changement : il s'annule, se vérifie et se garde. */
  function commit(next, key = null) {
    if (next === model) return;
    if (!key || key !== typing) history.record(model);
    typing = key;
    model = next;
    changed();
  }

  function changed() {
    const text = writeLevel(model);
    save.brouillon = text;
    storeSave(save);
    report = checkLevel(text, bundle);
    flaw = cellOfError(model, report.errors[0]);
    refresh();
    draw();
  }

  function refresh() {
    const press = (button, on) => button.setAttribute('aria-pressed', String(Boolean(on)));
    testButton.disabled = proposeButton.disabled = report.errors.length > 0;
    undoButton.disabled = !history.past.length;
    redoButton.disabled = !history.future.length;
    press(settingsButton, !settings.hidden);
    press(textButton, !sheet.hidden);
    press(eraserButton, tool === 'gomme');
    press(handButton, tool === 'main');
    rectButton.disabled = !paintsArea() || tool === 'main';
    press(rectButton, rect && !rectButton.disabled);
    plan.classList.toggle('main', tool === 'main');
    tabs.forEach((tab, i) => press(tab, i === shown));
    if (choices.firstChild !== groups[shown][1][0]?.button) choices.replaceChildren(...groups[shown][1].map((it) => it.button));
    for (const [, items] of groups) for (const it of items) press(it.button, tool === 'pinceau' && it === picked);
    behindRow.hidden = shown !== 0;
    toolName.textContent = tool === 'gomme' ? 'Gomme' : tool === 'main' ? 'Déplacer' : picked.name;

    if (sign) {
      if (signBox.parentNode !== message) message.replaceChildren(signBox);
    } else if (notice) message.replaceChildren(notice);
    else if (report.errors[0]) {
      message.replaceChildren(h('button', { type: 'button', className: 'alerte', onclick: () => flaw && show(flaw) }, plain(report.errors[0].message)));
    } else message.replaceChildren();

    const sync = (input, value) => {
      if (document.activeElement !== input) input.value = value;
    };
    sync(titleInput, getField(model, 'titre'));
    sync(authorInput, getField(model, 'auteur'));
    backdropButtons.forEach((button, i) => press(button, BACKDROPS[i] === (getField(model, 'fond') || BACKDROPS[0])));
    bossRow.hidden = !getField(model, 'boss');
    bossSelect.value = getField(model, 'boss');
    marchBox.checked = getField(model, 'cortege') === 'oui';
    sizeLabel.textContent = `${model.rows[0].length} × ${model.rows.length}`;
  }

  /** Où est le pointeur sur le dessin, que l'écran soit droit ou pivoté d'un quart de tour (téléphone tenu debout). */
  const spot = (e) => {
    const bounds = canvas.getBoundingClientRect();
    return document.documentElement.classList.contains('pivote')
      ? { x: e.clientY - bounds.top, y: bounds.right - e.clientX }
      : { x: e.clientX - bounds.left, y: e.clientY - bounds.top };
  };
  const cellAt = (e) => {
    const at = spot(e);
    return { x: Math.floor((at.x / zoom + cam.x) / TILE), y: Math.floor((at.y / zoom + cam.y) / TILE) };
  };
  const pinch = () => {
    const [a, b] = [...pointers.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, gap: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
  };
  /** Pose le pinceau sans rien enregistrer encore : le geste entier fera un seul pas d'annulation. */
  const apply = (cells) => {
    const result = paint(model, cells, brush(), defaults);
    if (result.error) return say(result.error);
    model = result.model;
    if (result.sign) gesture.sign = result.sign;
    return draw();
  };

  canvas.addEventListener('pointerdown', (e) => {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // un pointeur simulé ne se capture pas
    }
    if (e.isPrimary) pointers.clear(); // un doigt levé hors de l'écran ne compte plus
    pointers.set(e.pointerId, spot(e));
    if (pointers.size === 2) { // deux doigts : on déplace et on zoome ; le trait commencé est repris
      if (gesture?.before) model = gesture.before;
      gesture = { type: 'pince', zoom, ...pinch() };
      return draw();
    }
    if (pointers.size > 2) return;
    closeSign();
    const cell = cellAt(e);
    const b = brush();
    const there = model.rows[cell.y]?.[cell.x] || '';
    if (tool === 'main' || e.button > 0) gesture = { type: 'main', ...spot(e) };
    else if (b.type === 'panneau' && there >= '1' && there <= '9') gesture = { type: 'ecrire', sign: there };
    else if (!paintsArea()) {
      gesture = { type: 'pose', before: model };
      apply([cell]);
    } else if (rect) {
      gesture = { type: 'rect', before: model, from: cell, to: cell };
      draw();
    } else {
      gesture = { type: 'trait', before: model, last: cell, seen: new Set([`${cell.x},${cell.y}`]) };
      apply([cell]);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    const cell = cellAt(e);
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, spot(e));
    if (gesture?.type === 'pince' && pointers.size === 2) {
      const now = pinch();
      cam.x -= (now.x - gesture.x) / zoom;
      cam.y -= (now.y - gesture.y) / zoom;
      zoomTo((gesture.zoom * now.gap) / gesture.gap, now.x, now.y);
      Object.assign(gesture, { x: now.x, y: now.y });
    } else if (gesture?.type === 'main') {
      const at = spot(e);
      cam.x -= (at.x - gesture.x) / zoom;
      cam.y -= (at.y - gesture.y) / zoom;
      Object.assign(gesture, at);
      draw();
    } else if (gesture?.type === 'trait') {
      const cells = line(gesture.last, cell).filter((c) => !gesture.seen.has(`${c.x},${c.y}`) && gesture.seen.add(`${c.x},${c.y}`));
      gesture.last = cell;
      if (cells.length) apply(cells);
    } else if (gesture?.type === 'rect') {
      gesture.to = cell;
      draw();
    } else if (e.pointerType === 'mouse' && (hover?.x !== cell.x || hover?.y !== cell.y)) {
      hover = cell;
      draw();
    }
  });

  const lift = (e, cancelled) => {
    pointers.delete(e.pointerId);
    const done = gesture;
    gesture = null;
    if (done?.before) {
      if (cancelled) model = done.before;
      else if (done.type === 'rect') model = paint(model, box(done.from, done.to), brush(), defaults).model;
      const next = model;
      model = done.before;
      commit(next);
    }
    draw();
    if (done?.sign && !cancelled) editSign(done.sign);
  };
  canvas.addEventListener('pointerup', (e) => lift(e, false));
  canvas.addEventListener('pointercancel', (e) => lift(e, true));
  canvas.addEventListener('pointerleave', () => {
    hover = null;
    draw();
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey) return zoomTo(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), spot(e).x, spot(e).y);
    cam.x += (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) / zoom;
    cam.y += (e.shiftKey && !e.deltaX ? 0 : e.deltaY) / zoom;
    return draw();
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (!panel.isConnected) return live.abort();
    if (!(e.ctrlKey || e.metaKey) || e.target.closest?.('input, textarea, select')) return undefined;
    const key = e.key.toLowerCase();
    if (key !== 'z' && key !== 'y') return undefined;
    e.preventDefault();
    return travel(key === 'y' || e.shiftKey ? 'redo' : 'undo');
  }, { signal: live.signal });

  // ---------------------------------------------------------------- l'écran

  const plan = h('div', { className: 'plan' }, canvas,
    h('div', { className: 'zoom' },
      h('button', { type: 'button', title: 'Voir plus large', onclick: () => zoomStep(-1) }, '−'),
      h('button', { type: 'button', title: 'Voir de plus près', onclick: () => zoomStep(1) }, '+')),
    sheet);
  const panel = h('section', { className: 'panneau atelier' },
    h('div', { className: 'barre' },
      h('button', { type: 'button', className: 'discret', onclick: () => leave(back) }, '← Retour'),
      settingsButton, h('span', { className: 'pousse' }), undoButton, redoButton, textButton, testButton, proposeButton),
    h('div', { className: 'etabli' },
      h('div', { className: 'palette' },
        h('div', { className: 'outils' }, eraserButton, rectButton, handButton),
        h('div', { className: 'groupes' }, tabs),
        choices, behindRow),
      plan, settings),
    h('div', { className: 'etat' }, toolName, message));

  root.replaceChildren(panel);
  root.hidden = false;
  new ResizeObserver(() => draw()).observe(canvas);
  changed();
}
