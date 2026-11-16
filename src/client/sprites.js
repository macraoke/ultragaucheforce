// Dessins du contenu : des grilles de lettres (voir `content/palette.txt`) cuites en images
// la première fois qu'on les demande, avec leurs variantes (miroir, flash blanc).

const cache = new WeakMap(); // grille → { variante → canvas }

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hex = (c) => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
const dim = (color) => hex(rgb(color).map((v, i) => v * 0.42 + [26, 28, 44][i] * 0.58));
// Apaisé : presque gris, un peu éclairci vers le blanc ombré de la palette. Une unité hors service sans dessin de fin.
const calm = (color) => {
  const c = rgb(color);
  const grey = c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;
  return hex(c.map((v, i) => (v * 0.25 + grey * 0.75) * 0.7 + [207, 216, 227][i] * 0.3));
};

function bake(rows, palette, flip, flash, back) {
  const h = rows.length;
  const w = rows[0].length;
  const cvs = document.createElement('canvas');
  cvs.width = w;
  cvs.height = h;
  const ctx = cvs.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = rows[y][x];
      if (c === '.') continue;
      const color = palette[c] || '#ff00ff';
      ctx.fillStyle = flash ? '#ffffff' : back === 'calm' ? calm(color) : back ? dim(color) : color;
      ctx.fillRect(flip ? w - 1 - x : x, y, 1, 1);
    }
  }
  return cvs;
}

/**
 * Image d'un dessin. `flip` = regarde à gauche ; `flash` = silhouette blanche (coup reçu) ;
 * `back` = assombri (mur du fond), ou `'calm'` : apaisé, presque gris (une unité hors service sans dessin de fin).
 */
export function sprite(rows, palette, flip = false, flash = false, back = false) {
  let variants = cache.get(rows);
  if (!variants) cache.set(rows, (variants = {}));
  const key = (flip ? 'f' : '') + (flash ? 'w' : '') + (back === 'calm' ? 'c' : back ? 'd' : '');
  return (variants[key] ??= bake(rows, palette, flip, flash, back));
}

const runs = (row) => [...row].filter((c, x) => c !== '.' && (x === 0 || row[x - 1] === '.')).length;
const seats = new WeakMap(); // dessin debout → le même, assis (ou null)

/**
 * Le même personnage, assis en tailleur : le haut du dessin jusqu'à la ceinture, puis les genoux écartés et les pieds.
 * Les jambes sont les rangées du bas où le dessin se sépare en deux, sous une ceinture d'au plus douze pixels ; sans
 * jambes reconnaissables (une machine, un blindé sur ses roues, un écran), null. Deux colonnes de plus de chaque côté,
 * pour les genoux : le dessin reste centré.
 */
export function seated(rows) {
  if (seats.has(rows)) return seats.get(rows);
  const h = rows.length;
  let hip = h - 1;
  while (hip > 0 && runs(rows[hip]) >= 2) hip--;
  const legs = h - 1 - hip;
  const a = rows[hip].search(/[^.]/) + 2;
  const b = rows[hip].length - 1 - [...rows[hip]].reverse().join('').search(/[^.]/) + 2;
  let out = null;
  if (legs >= 3 && legs <= h / 2 && runs(rows[hip]) === 1 && b - a < 12) {
    const thigh = rows[hip + 1].replace(/\./g, '')[0];
    const shoe = rows[h - 1].replace(/\./g, '')[0];
    const width = rows[0].length + 4;
    const line = (paint) => [...Array(width)].map((_, x) => paint(x) || '.').join('');
    out = [
      ...rows.slice(0, hip + 1).map((r) => `..${r}..`),
      line((x) => x >= a - 2 && x <= b + 2 && thigh), // les genoux, de part et d'autre
      line((x) => (x === a - 2 || x === b + 2 ? shoe : x > a - 2 && x < b + 2 && thigh)), // les tibias croisés, les pieds au bout
    ];
  }
  seats.set(rows, out);
  return out;
}

/**
 * Où tenir quelque chose : la main, le pixel de peau le plus en avant sous la tête, devant le corps (le dessin regarde
 * à droite). Rien de tel : null.
 */
export function hand(rows) {
  const w = rows[0].length;
  let best = null;
  for (let y = Math.ceil(rows.length * 0.35); y < rows.length; y++) {
    for (let x = w - 1; x >= w / 2; x--) {
      if ((rows[y][x] === 's' || rows[y][x] === 'S') && (!best || x > best.x)) best = { x, y };
    }
  }
  return best;
}

/** Le sommet du dessin, au milieu : le premier pixel plein de la colonne centrale (ou de la plus proche qui en a un). */
export function crown(rows) {
  const mid = Math.floor(rows[0].length / 2);
  for (let d = 0; d < rows[0].length; d++) {
    for (const x of [mid - d, mid + d]) {
      const y = rows.findIndex((r) => r[x] && r[x] !== '.');
      if (y >= 0) return { x, y };
    }
  }
  return { x: mid, y: 0 };
}

/** Un élément <canvas> agrandi, aux pixels nets, pour les menus, les cartons et la Galerie. */
export function spriteElement(rows, palette, scale = 4, flip = false) {
  const src = sprite(rows, palette, flip);
  const cvs = document.createElement('canvas');
  cvs.width = src.width;
  cvs.height = src.height;
  cvs.getContext('2d').drawImage(src, 0, 0);
  cvs.className = 'pixel';
  cvs.style.width = `${src.width * scale}px`;
  cvs.style.height = `${src.height * scale}px`;
  return cvs;
}
