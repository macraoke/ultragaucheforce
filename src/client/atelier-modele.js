// Le niveau de l'Atelier, sans écran. La fiche texte reste la vérité : on la lit, on peint dans sa carte,
// on la réécrit. L'en-tête est gardé ligne à ligne ; seules les lignes qu'on touche changent.
//
// Un modèle : { head, rows, walls, rest }
//   head   les lignes de l'en-tête, telles qu'écrites
//   rows   la carte, toutes les lignes à la même largeur, « . » pour le vide
//   walls  les murs du fond, à la taille de la carte, ou [] s'il n'y en a pas
//   rest   les autres sections, gardées telles quelles
// Un modèle ne se modifie pas : chaque geste en renvoie un nouveau (annuler = reprendre l'ancien).

import { LEGEND, MARKERS } from '../content/rules.js';

export const MIN = { w: 10, h: 8 };
export const MAX = { w: 400, h: 60 };
const MAX_URL = 7000; // au-delà, GitHub refuse le lien prérempli : on passe par le presse-papiers

const SIGNS = [...'abcdefghijklmnopqrstuvwxyz+*@&%$!?=~^<>_,;'].filter((c) => LEGEND.test(c));
const DIGITS = [...'123456789'];
const UNIQUE = ['D', 'Y']; // un seul départ, un seul boss
const SIGN_KEY = /^panneau\.([1-9])$/;

/** Le niveau de départ : un sol épais qu'on peut creuser, un socle dessous, un départ, une sortie. */
export const TEMPLATE = `${[
  'titre: Mon niveau',
  'fond: campagne',
  'cortege: oui',
  '--- carte',
  ...Array(9).fill('.'.repeat(40)),
  `..D${'.'.repeat(34)}S..`,
  ...Array(5).fill('T'.repeat(40)),
  'O'.repeat(40),
].join('\n')}\n`;

// ---------------------------------------------------------------- lire, écrire

/** Une ligne d'en-tête « clé: valeur », lue comme le fait `Fiche` ; null pour un commentaire ou une ligne vide. */
function fieldOf(raw) {
  if (!raw.trim() || raw.trimStart().startsWith('#')) return null;
  const m = raw.match(/^\s*([^:\s][^:]*?)\s*:\s?(.*)$/);
  return m ? { key: m[1], value: m[2].trim() } : null;
}

/** L'ordre de l'en-tête : les réglages, puis les panneaux, puis la légende. */
const rank = (key) => (LEGEND.test(key) ? 2 : SIGN_KEY.test(key) ? 1 : 0);

const blank = (rows) => rows.every((row) => !/[^.]/.test(row));

/**
 * @param {string} text  une fiche de niveau
 * @returns {object | null}  le modèle, ou null si la fiche n'a pas de carte
 */
export function readLevel(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/);
  const cut = lines.findIndex((line) => line.startsWith('---'));
  if (cut < 0) return null;
  const sections = [];
  for (const raw of lines.slice(cut)) {
    if (raw.startsWith('---')) sections.push({ name: raw.slice(3).trim(), raw, rows: [] });
    else sections.at(-1).rows.push(raw.replace(/\s+$/, ''));
  }
  for (const s of sections) while (s.rows.length && !s.rows.at(-1)) s.rows.pop();
  const grid = (name) => sections.findLast((s) => s.name === name)?.rows || [];
  const map = grid('carte');
  const w = Math.max(0, ...map.map((row) => row.length));
  if (!w) return null;
  const fit = (rows) => map.map((_, y) => (rows[y] || '').replaceAll(' ', '.').padEnd(w, '.').slice(0, w));
  const back = fit(grid('murs'));
  return {
    head: lines.slice(0, cut),
    rows: fit(map),
    walls: blank(back) ? [] : back,
    rest: sections.filter((s) => s.name !== 'carte' && s.name !== 'murs').flatMap((s) => [s.raw, ...s.rows]),
  };
}

/** Le modèle redevient une fiche. */
export function writeLevel(model) {
  return `${[
    ...model.head,
    '--- carte', ...model.rows,
    ...(model.walls.length ? ['--- murs', ...model.walls] : []),
    ...model.rest,
  ].join('\n')}\n`;
}

// ---------------------------------------------------------------- l'en-tête

/** La valeur d'une clé de l'en-tête, ou ''. */
export function getField(model, key) {
  return fieldOf(model.head.findLast((raw) => fieldOf(raw)?.key === key) || '')?.value || '';
}

/** Écrit une clé de l'en-tête à sa place ; une valeur vide retire la ligne. */
export function setField(model, key, value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  const head = model.head.slice();
  const at = head.findLastIndex((raw) => fieldOf(raw)?.key === key);
  if (!text) return at < 0 ? model : { ...model, head: head.filter((raw) => fieldOf(raw)?.key !== key) };
  if (at >= 0) head[at] = `${key}: ${text}`;
  else {
    const after = head.findLastIndex((raw) => {
      const field = fieldOf(raw);
      return field && rank(field.key) <= rank(key);
    });
    head.splice(after + 1, 0, `${key}: ${text}`);
  }
  return { ...model, head };
}

/** La légende : signe → identifiant d'ennemi, de recrue ou de décor. */
export function legendOf(model) {
  const out = {};
  for (const raw of model.head) {
    const field = fieldOf(raw);
    if (field && LEGEND.test(field.key)) out[field.key] = field.value;
  }
  return out;
}

/** Un signe libre pour cet identifiant : de préférence une de ses lettres. */
function freeSign(model, id) {
  const taken = new Set([...Object.keys(legendOf(model)), ...model.rows.join('')]);
  return [...id, ...SIGNS].find((c) => LEGEND.test(c) && !taken.has(c)) || null;
}

/**
 * Accorde l'en-tête à la carte : il ne déclare que ce qu'elle contient,
 * l'unité de la nasse s'il y a un « N ». Un « Y » n'impose aucun boss : il est tiré au hasard.
 */
function settle(model, defaults) {
  const seen = new Set(model.rows.join(''));
  let next = {
    ...model,
    head: model.head.filter((raw) => {
      const key = fieldOf(raw)?.key;
      if (!key) return true;
      if (LEGEND.test(key)) return seen.has(key);
      const sign = key.match(SIGN_KEY);
      return !sign || seen.has(sign[1]);
    }),
  };
  if (!seen.has('Y')) next = setField(next, 'boss', '');
  if (seen.has('N') && !getField(next, 'nasse.ennemi')) next = setField(next, 'nasse.ennemi', defaults.nasse);
  return next;
}

// ---------------------------------------------------------------- peindre

/**
 * Pose un pinceau sur des cases.
 * @param {object} model
 * @param {{x: number, y: number}[]} cells
 * @param {object} brush  { type: 'tuile', char, back? } | { type: 'repere', char } | { type: 'chose', id } | { type: 'panneau' } | { type: 'gomme' }
 * @param {{boss?: string, nasse?: string}} defaults  ce que l'en-tête reçoit quand un boss ou une nasse arrive sur la carte
 * @returns {{model: object, error?: string, sign?: string}}  `sign` : le numéro du panneau qu'on vient de poser
 */
export function paint(model, cells, brush, defaults = {}) {
  const inside = cells.filter(({ x, y }) => y >= 0 && y < model.rows.length && x >= 0 && x < model.rows[0].length);
  if (!inside.length) return { model };
  let next = model;
  let { char } = brush;
  if (brush.type === 'chose') {
    char = Object.entries(legendOf(model)).find(([, id]) => id === brush.id)?.[0] || freeSign(model, brush.id);
    if (!char) return { model, error: 'Trop de personnages et de décors différents.' };
    next = setField(next, char, brush.id);
  } else if (brush.type === 'panneau') {
    const taken = new Set(model.rows.join(''));
    char = DIGITS.find((d) => !taken.has(d));
    if (!char) return { model, error: 'Neuf panneaux au plus.' };
    next = setField(next, `panneau.${char}`, '…');
  }
  const rows = next.rows.map((row) => row.split(''));
  let walls = next.walls.map((row) => row.split(''));
  const once = brush.type === 'panneau' || UNIQUE.includes(char);
  if (UNIQUE.includes(char)) for (const row of rows) row.forEach((c, x) => c === char && (row[x] = '.'));
  for (const { x, y } of once ? inside.slice(-1) : inside) {
    if (brush.type === 'gomme') {
      if (rows[y][x] !== '.') rows[y][x] = '.';
      else if (walls.length) walls[y][x] = '.';
    } else if (brush.back) {
      if (!walls.length) walls = rows.map((row) => row.map(() => '.'));
      walls[y][x] = char;
    } else rows[y][x] = char;
  }
  const back = walls.map((row) => row.join(''));
  next = settle({ ...next, rows: rows.map((row) => row.join('')), walls: blank(back) ? [] : back }, defaults);
  return { model: next, ...(brush.type === 'panneau' && { sign: char }) };
}

/** Les cases d'un trait entre deux cases : un geste rapide ne laisse pas de trou. */
export function line(a, b) {
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  return Array.from({ length: steps + 1 }, (_, i) => ({
    x: Math.round(a.x + ((b.x - a.x) * i) / (steps || 1)),
    y: Math.round(a.y + ((b.y - a.y) * i) / (steps || 1)),
  }));
}

/** Les cases d'un rectangle entre deux coins. */
export function box(a, b) {
  const cells = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) {
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) cells.push({ x, y });
  }
  return cells;
}

// ---------------------------------------------------------------- agrandir, réduire

/**
 * Ajoute (`delta` > 0) ou retire des lignes ou des colonnes d'un côté. Le bord reste le bord (un socle, un mur
 * d'enceinte) : c'est juste derrière lui que la carte s'étire ou se resserre. Le terrain se prolonge ;
 * les personnages, eux, ne se recopient pas.
 * @param {'haut' | 'bas' | 'gauche' | 'droite'} side
 */
export function resize(model, side, delta, defaults = {}) {
  const tall = side === 'haut' || side === 'bas';
  const size = tall ? model.rows.length : model.rows[0].length;
  const n = Math.max(tall ? MIN.h : MIN.w, Math.min(tall ? MAX.h : MAX.w, size + delta)) - size;
  if (!n) return model;
  const terrain = (row) => row.replace(/./g, (c) => (/[A-Z]/.test(c) && !Object.hasOwn(MARKERS, c) ? c : '.'));
  /** Étire ou resserre une ligne (de caractères) ou une carte (de lignes) juste derrière son dernier élément. */
  const stretch = (cells, more) => [...cells.slice(0, Math.min(-1, n - 1)), ...more, cells.at(-1)];
  const edit = (rows) => {
    if (!rows.length) return rows;
    const mirror = (grid) => (tall ? [...grid].reverse() : grid.map((row) => [...row].reverse().join('')));
    const flip = side === 'haut' || side === 'gauche'; // même geste, carte retournée
    const turned = flip ? mirror(rows) : rows;
    const done = tall
      ? stretch(turned, Array(Math.max(0, n)).fill(terrain(turned.at(-2))))
      : turned.map((row) => stretch([...row], [terrain(row.at(-2)).repeat(Math.max(0, n))]).join(''));
    return flip ? mirror(done) : done;
  };
  const walls = edit(model.walls);
  return settle({ ...model, rows: edit(model.rows), walls: blank(walls) ? [] : walls }, defaults);
}

// ---------------------------------------------------------------- annuler, rétablir

export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.past = [];
    this.future = [];
  }

  /** À appeler après un changement, avec l'état qu'on vient de quitter. */
  record(before) {
    this.past.push(before);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  /** @returns l'état précédent, ou `now` s'il n'y en a pas */
  undo(now) {
    if (!this.past.length) return now;
    this.future.push(now);
    return this.past.pop();
  }

  redo(now) {
    if (!this.future.length) return now;
    this.past.push(now);
    return this.future.pop();
  }
}

// ---------------------------------------------------------------- erreurs, proposition

/** La case que désigne une erreur de `checkLevel` sur la fiche de ce modèle, ou null. */
export function cellOfError(model, error) {
  if (!error?.col) return null;
  const map = model.head.length + 2; // la ligne « --- carte », puis la première ligne de la carte
  const back = map + model.rows.length + 1;
  for (const first of model.walls.length ? [map, back] : [map]) {
    const y = error.line - first;
    if (y >= 0 && y < model.rows.length) return { x: error.col - 1, y };
  }
  return null;
}

/** Le message d'une erreur, sans la lettre de la fiche : ici, on ne voit que des images. */
export const plain = (message) => message.replace(/ « [DS] »/g, '');

const slug = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'mon-niveau';

/**
 * L'adresse GitHub qui crée le fichier du niveau. `filled` : la fiche tient dans le lien ; sinon, il faut la coller.
 * @returns {{url: string, filled: boolean}}
 */
export function proposal(repo, text, title) {
  const base = `${repo}/new/main/content/niveaux?filename=${encodeURIComponent(`${slug(title)}.txt`)}`;
  const full = `${base}&value=${encodeURIComponent(text)}`;
  return full.length <= MAX_URL ? { url: full, filled: true } : { url: base, filled: false };
}

/**
 * Les autres façons de contribuer, depuis l'Atelier : les propositions ouvertes, les formulaires d'issue
 * du dépôt (`.github/ISSUE_TEMPLATE/`), les guides. Des liens, rien d'autre : ni compte, ni API.
 * @returns {{text: string, url: string}[]}
 */
export const contributions = (repo) => [
  { text: 'Les propositions en cours', url: `${repo}/pulls` },
  { text: 'Une idée de niveau', url: `${repo}/issues/new?template=niveau.yml` },
  { text: 'Proposer une pancarte', url: `${repo}/issues/new?template=blague-ou-pancarte.yml` },
  { text: 'Proposer un personnage', url: `${repo}/issues/new?template=personnage.yml` },
  { text: 'Une source à corriger', url: `${repo}/issues/new?template=source-a-corriger.yml` },
  { text: 'Signaler un bug', url: `${repo}/issues/new?template=bug.yml` },
  { text: 'Le guide des niveaux', url: `${repo}/blob/main/docs/ajouter-un-niveau.md` },
  { text: 'Comment contribuer', url: `${repo}/blob/main/CONTRIBUTING.md` },
];
