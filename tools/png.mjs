// Images PNG sans aucune dépendance : de quoi fabriquer les icônes du jeu à partir d'un dessin
// du contenu (une grille de lettres), au lieu de ranger des fichiers binaires dans le dépôt.

import { crc32, deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const check = Buffer.alloc(4);
  check.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, check]);
}

/**
 * Encode une image RVBA 8 bits.
 * @param {number} width
 * @param {number} height
 * @param {Buffer} rgba  width × height × 4 octets
 */
export function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits par canal
  header[9] = 6; // RVBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height); // chaque ligne commence par un octet de filtre (0 = aucun)
  for (let y = 0; y < height; y++) rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  return Buffer.concat([SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/**
 * Dessine un sprite du contenu, agrandi d'un facteur entier et centré sur un fond uni opaque.
 * @param {string[]} rows     grille de lettres de la palette (« . » = transparent)
 * @param {Record<string, string>} palette  lettre → #rrggbb
 * @param {{size: number, background: string, fill?: number}} options
 *        `fill` : part du côté que le dessin peut occuper (0,7 pour une icône « maskable »)
 */
export function spriteToPng(rows, palette, { size, background, fill = 0.9 }) {
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const scale = Math.max(1, Math.floor((size * fill) / Math.max(w, h)));
  const left = Math.floor((size - w * scale) / 2);
  const top = Math.floor((size - h * scale) / 2);
  const pixels = Buffer.alloc(size * size * 4);
  const [br, bg, bb] = rgb(background);
  for (let i = 0; i < size * size; i++) pixels.set([br, bg, bb, 255], i * 4);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const color = palette[row[x]];
      if (!color) continue;
      const [r, g, b] = rgb(color);
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          pixels.set([r, g, b, 255], ((top + y * scale + dy) * size + left + x * scale + dx) * 4);
        }
      }
    }
  });
  return encodePng(size, size, pixels);
}

const ICON_BACKGROUND = '#f6c21c'; // l'or du jeu : le héros rouge s'en détache

/**
 * Les icônes de l'application, tirées du portrait du héros de départ.
 * @returns {Record<string, Buffer>}  chemin relatif → image PNG
 */
export function makeIcons(bundle) {
  const hero = bundle.heros.tyrannogauchiste ?? Object.values(bundle.heros)[0];
  const rows = hero.sprites.portrait ?? hero.sprites.repos;
  const icon = (size, fill) => spriteToPng(rows, bundle.palette, { size, background: ICON_BACKGROUND, fill });
  return {
    'icons/icone-192.png': icon(192, 0.9),
    'icons/icone-512.png': icon(512, 0.9),
    'icons/icone-maskable-512.png': icon(512, 0.7), // le système peut rogner les bords : le dessin reste au centre
    'icons/apple-touch-icon.png': icon(180, 0.85),
  };
}
