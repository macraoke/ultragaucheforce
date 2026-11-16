// Le bilan des blessés de fin de niveau : le nombre que la partie annonce côté forces de l'ordre, réparti comme les
// CRS blessés en octobre 2026 dans le fichier interne de leur direction (fiche `crs-blesses-octobre-2026`).
// Sans DOM : testé dans Node.

import { plural } from './dom.js';

/** Ce que dit le fichier, tel que la fiche le cite. Un test vérifie que chaque nombre figure dans son texte. */
export const CRS_OCTOBRE_2026 = {
  fiche: 'crs-blesses-octobre-2026',
  blesses: 1233,
  legers: 1167, // « blessés légers », selon la classification de l'administration
  arrets: 126, // arrêts de travail
  jambes: 737, // blessures aux membres inférieurs (un agent peut en déclarer plusieurs)
  bras: 451, // blessures aux membres supérieurs
  acouphenes: 117, // agents qui mentionnent un acouphène
  tiers: 12, // blessure causée sans ambiguïté par un tiers
};

/**
 * Arrondi vers le bas à deux chiffres significatifs : 37,86 → 37 ; 2,84 → 2,8 ; 0,389 → 0,38 ; 0,0097 → 0,0097.
 * Jamais plus que la proportion exacte, et jamais zéro quand elle ne l'est pas.
 */
export function floor2(x) {
  if (!(x > 0)) return 0;
  const digits = 1 - Math.floor(Math.log10(x)); // chiffres après la virgule pour en garder deux significatifs
  const scale = 10 ** digits;
  return Math.floor(x * scale * (1 + 1e-12)) / scale; // 1e-12 : 0,3 × 10 ne doit pas donner 2,999…
}

/** « 2,8 », « 37 », « 0,0097 » : un nombre de `floor2`, en français, sans zéro inutile. */
export const frenchShare = (x) => x.toLocaleString('fr-FR', { maximumFractionDigits: 6 });

/**
 * Les `n` blessés annoncés, répartis comme les CRS blessés en octobre 2026. Chaque part est arrondie vers le bas à deux
 * chiffres : elle ne dit jamais plus que la source, et une petite part reste écrite (0,38 plutôt que 0).
 * @param {number} n  le nombre de blessés annoncés par la partie
 * @returns {{legers: number, arrets: number, jambes: number, bras: number, acouphenes: number, tiers: number} | null}
 */
export function injuries(n) {
  if (!(n > 0)) return null;
  const share = (count) => floor2((n * count) / CRS_OCTOBRE_2026.blesses);
  const { legers, arrets, jambes, bras, acouphenes, tiers } = CRS_OCTOBRE_2026;
  return { legers: share(legers), arrets: share(arrets), jambes: share(jambes), bras: share(bras), acouphenes: share(acouphenes), tiers: share(tiers) };
}

/** Le singulier jusqu'à 2 exclu, comme on l'écrit en français : « 1,7 blessure », « 2,8 légers ». */
const word = (x, one, many) => `${frenchShare(x)} ${plural(x, one, many)}`;

/**
 * La ligne de l'écran de fin, en morceaux : « 37 légers », « 4 arrêts de travail »…
 * @returns {string[]} vide sans blessé
 */
export function injuryParts(n) {
  const parts = injuries(n);
  if (!parts) return [];
  return [
    word(parts.legers, 'léger', 'légers'),
    word(parts.arrets, 'arrêt de travail', 'arrêts de travail'),
    `${word(parts.jambes, 'blessure aux jambes ou aux pieds', 'blessures aux jambes ou aux pieds')} et ${frenchShare(parts.bras)} aux bras ou aux mains`,
    word(parts.acouphenes, 'acouphène', 'acouphènes'),
    `${word(parts.tiers, 'blessé', 'blessés')} par un tiers, sans ambiguïté`,
  ];
}
