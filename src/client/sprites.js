// Dessins du contenu : des grilles de lettres (voir `content/palette.txt`) cuites en images
// la première fois qu'on les demande, avec leurs variantes (miroir, flash blanc).

const cache = new WeakMap(); // grille → { variante → canvas }

function bake(rows, palette, flip, flash) {
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
      ctx.fillStyle = flash ? '#ffffff' : palette[c] || '#ff00ff';
      ctx.fillRect(flip ? w - 1 - x : x, y, 1, 1);
    }
  }
  return cvs;
}

/** Image d'un dessin. `flip` = regarde à gauche ; `flash` = silhouette blanche (coup reçu). */
export function sprite(rows, palette, flip = false, flash = false) {
  let variants = cache.get(rows);
  if (!variants) cache.set(rows, (variants = {}));
  const key = (flip ? 'f' : '') + (flash ? 'w' : '');
  return (variants[key] ??= bake(rows, palette, flip, flash));
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
