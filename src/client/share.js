// L'image à partager en fin de niveau : la dernière image du jeu, la taille de la manif,
// ce que 2 % paieraient, une pancarte débloquée. Tout y vient de la partie qu'on vient de jouer.

import { h } from './dom.js';

const SIZE = 1080;
const INK = '#1a1c2c';
const PAPER = '#f4f4f4';
const GOLD = '#f6c21c';
const RED = '#e43b44';
const MUTED = '#b8bcd0';

/** Coupe un texte en lignes qui tiennent dans `width`, avec la police déjà réglée sur `ctx`. */
export function wrap(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Écrit `text` dans une boîte, à la plus grande taille (de `max` à `min`) qui y tient en `rows` lignes au plus.
 * `align` : 'left' ou 'center'. Le texte est centré en hauteur dans la boîte.
 */
function fit(ctx, text, { x, y, width, height, max, min = 22, rows = 2, color = PAPER, font, align = 'left' }) {
  const GAP = 1.08;
  let size = max + 2;
  let lines;
  do {
    size -= 2;
    ctx.font = `${size}px ${font}`;
    lines = wrap(ctx, text, width);
  } while (size > min && (lines.length > rows || lines.length * size * GAP > height));
  if (lines.length > rows) lines = [...lines.slice(0, rows - 1), `${lines[rows - 1]}…`]; // trop long même en petit : on le dit

  ctx.fillStyle = color;
  ctx.textAlign = align;
  const top = y + (height - lines.length * size * GAP) / 2;
  lines.forEach((l, i) => ctx.fillText(l, align === 'center' ? x + width / 2 : x, top + size * (i * GAP + 0.86)));
  ctx.textAlign = 'left';
}

/**
 * @param {object} o
 * @param {HTMLCanvasElement[]} o.frames  les calques du jeu, du fond vers le dessus
 * @param {string} o.level   titre du niveau
 * @param {number} o.crowd   taille de la manif à l'arrivée
 * @param {{caption: string, result: string} | null} o.tax  ce que 2 % paieraient, tel que l'écran de taxe l'a dit
 * @param {string} o.sign    une pancarte arrivée dans la manif pendant ce niveau
 * @param {string} o.where   l'adresse du jeu, sans « https:// »
 * @returns {HTMLCanvasElement}
 */
export function shareImage({ frames, level, crowd, tax = null, sign = '', where = '' }) {
  const canvas = h('canvas', { width: SIZE, height: SIZE });
  const ctx = canvas.getContext('2d');
  const style = getComputedStyle(document.documentElement);
  const title = style.getPropertyValue('--titre') || 'Impact, sans-serif';
  const body = style.getPropertyValue('--texte') || 'sans-serif';
  const M = 56;
  const WIDE = SIZE - 2 * M;

  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.textBaseline = 'alphabetic';

  // Quatre bandes fixes : l'image du jeu, la manif, la taxe, la pancarte. Puis le pied.
  // La dernière image du jeu, pixels nets, cadrée au centre de l'écran.
  const TOP = 430;
  ctx.imageSmoothingEnabled = false;
  for (const frame of frames) {
    if (!frame?.width) continue;
    const scale = Math.max(SIZE / frame.width, TOP / frame.height);
    const w = SIZE / scale;
    const hgt = TOP / scale;
    ctx.drawImage(frame, (frame.width - w) / 2, (frame.height - hgt) / 2, w, hgt, 0, 0, SIZE, TOP);
  }
  ctx.fillStyle = RED;
  ctx.fillRect(0, TOP, SIZE, 12);

  // La manif : le score.
  ctx.font = `160px ${title}`;
  const count = crowd.toLocaleString('fr-FR');
  ctx.fillStyle = GOLD;
  ctx.fillText(count, M, TOP + 178);
  const after = M + ctx.measureText(count).width + 28;
  fit(ctx, 'DANS LA MANIF', { x: after, y: TOP + 50, width: SIZE - M - after, height: 70, max: 64, rows: 1, font: title });
  fit(ctx, level.toUpperCase(), { x: after, y: TOP + 122, width: SIZE - M - after, height: 64, max: 40, rows: 2, color: MUTED, font: title });

  // La taxe : ce que 2 % paieraient.
  if (tax) {
    fit(ctx, tax.caption, { x: M, y: TOP + 222, width: WIDE, height: 44, max: 32, rows: 1, color: MUTED, font: body });
    fit(ctx, tax.result.toUpperCase(), { x: M, y: TOP + 268, width: WIDE, height: 150, max: 88, min: 40, rows: 2, font: title });
  }

  // Une pancarte de la manif, de travers, comme en vrai.
  if (sign) {
    const BOARD = { w: WIDE - 40, h: 128 };
    ctx.save();
    ctx.translate(SIZE / 2, TOP + 500);
    ctx.rotate(-0.025);
    ctx.fillStyle = '#0c0d16';
    ctx.fillRect(-BOARD.w / 2 + 8, -BOARD.h / 2 + 8, BOARD.w, BOARD.h);
    ctx.fillStyle = PAPER;
    ctx.fillRect(-BOARD.w / 2, -BOARD.h / 2, BOARD.w, BOARD.h);
    fit(ctx, sign.toUpperCase(), { x: -BOARD.w / 2 + 24, y: -BOARD.h / 2 + 8, width: BOARD.w - 48, height: BOARD.h - 16, max: 56, min: 24, rows: 2, color: INK, font: title, align: 'center' });
    ctx.restore();
  }

  // Le pied : le nom du jeu, et où le trouver.
  ctx.font = `34px ${title}`;
  ctx.fillStyle = RED;
  ctx.fillText('ULTRAGAUCHE FORCE', M, SIZE - 36);
  if (where) {
    ctx.font = `26px ${body}`;
    ctx.fillStyle = PAPER;
    ctx.textAlign = 'right';
    ctx.fillText(where, SIZE - M, SIZE - 38);
    ctx.textAlign = 'left';
  }
  return canvas;
}

const toFile = (canvas) => new Promise((resolve) =>
  canvas.toBlob((blob) => resolve(blob && new File([blob], 'ultragauche-force.png', { type: 'image/png' })), 'image/png'));

/**
 * Comment « Enregistrer l'image » s'y prend : sur un téléphone ou une tablette qui sait partager une image, par la
 * feuille de partage (« Enregistrer l'image » y est) ; partout ailleurs, l'ordinateur compris, un vrai téléchargement.
 * @param {{coarse: boolean, files: boolean}} o  `coarse` : on joue au doigt ; `files` : le partage accepte une image
 * @returns {'partage' | 'telechargement'}
 */
export const saveMode = ({ coarse, files }) => (coarse && files ? 'partage' : 'telechargement');

/** Télécharge `file` : une adresse « blob: », un lien posé dans la page le temps du clic, libérée une minute après. */
function download(file) {
  const href = URL.createObjectURL(file);
  const a = h('a', { href, download: file.name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000); // Firefox lit le fichier après le clic : on ne la libère pas tout de suite
}

/**
 * Copie `text` dans le presse-papiers. Sans l'API du presse-papiers (page non sécurisée, navigateur ancien, refus),
 * par un champ sélectionné et `execCommand('copy')`. Rend vrai si le texte est copié.
 */
export async function copyText(text, { clipboard = globalThis.navigator?.clipboard, doc = globalThis.document } = {}) {
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    // pas d'API, ou refusée : on essaie à l'ancienne
  }
  const field = doc.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  doc.body.append(field);
  field.select();
  let done = false;
  try {
    done = doc.execCommand('copy');
  } catch {
    done = false;
  }
  field.remove();
  return Boolean(done);
}

/**
 * Montre l'image, avec de quoi l'enregistrer, l'envoyer par le partage de l'appareil quand il existe, et copier le
 * lien du jeu. Un seul calque à la fois ; il prend le clavier, et Échap le ferme.
 * @param {HTMLCanvasElement} canvas
 * @param {{text: string, url: string, button: (label: string, action: () => void, className?: string) => HTMLElement}} o
 */
export async function openShare(canvas, { text, url, button }) {
  const host = document.getElementById('ecran') || document.body;
  if (host.querySelector('.partage')) return;
  const overlay = h('div', { className: 'carte-ouverte partage' });
  host.append(overlay); // posé tout de suite : un second appui pendant la fabrication de l'image ne fait rien
  const file = await toFile(canvas);
  if (!file || !overlay.isConnected) return overlay.remove();
  const opener = document.activeElement; // « Partager » : le clavier y revient à la fermeture
  const close = () => {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  };
  // Tant que le calque est ouvert, Échap le ferme où que soit le focus, et Tab reste dedans.
  const onKey = (e) => {
    if (!overlay.isConnected) return document.removeEventListener('keydown', onKey, true); // l'écran a changé sous lui
    const inside = [...overlay.querySelectorAll('a[href], button')];
    if (e.key === 'Escape') {
      e.stopPropagation(); // Échap ferme le calque, pas l'écran
      e.preventDefault();
      close();
    } else if (e.key === 'Tab' && inside.length) {
      const at = inside.indexOf(document.activeElement);
      const next = inside[(at + (e.shiftKey ? -1 : 1) + inside.length) % inside.length] || inside[0];
      e.preventDefault();
      next.focus({ preventScroll: true });
    }
  };
  const picture = canvas.toDataURL('image/png'); // une adresse « data: » : rien à libérer quand l'écran change
  const files = Boolean(navigator.canShare?.({ files: [file] }));
  const coarse = Boolean(globalThis.matchMedia?.('(pointer: coarse)').matches);
  const shared = (data) => navigator.share(data).catch(() => {}); // partage annulé : rien à dire
  const save = () => (saveMode({ coarse, files }) === 'partage' ? shared({ files: [file] }) : download(file));
  const status = h('p', { className: 'copie', role: 'status' });
  let copied = 0;
  const copy = async () => {
    const done = await copyText(url);
    status.textContent = done ? 'Lien copié' : `Copiez-le : ${url}`;
    clearTimeout(copied);
    if (done) copied = setTimeout(() => (status.textContent = ''), 2500);
  };
  // Pas de `return false` ici : un gestionnaire `onclick` qui rend faux annule le clic, et les boutons du calque avec.
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };
  document.addEventListener('keydown', onKey, true);
  overlay.append(h('div', { className: 'cadre' },
    h('img', { src: picture, alt: text, width: SIZE, height: SIZE }),
    h('div', { className: 'pied' },
      button('Enregistrer l’image', save, 'gros'),
      files ? button('Envoyer', () => shared({ files: [file], text, url })) : null,
      button('Copier le lien', copy),
      button('Fermer', close, 'discret'),
      status)));
  overlay.querySelector('.gros').focus({ preventScroll: true });
}
