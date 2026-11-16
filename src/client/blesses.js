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
  origine: 20, // « une vingtaine » d'agents indiquent l'origine de leur blessure : écrit « environ »
  tiers: 12, // blessure causée sans ambiguïté par un tiers
};

/** « 1 167 » : un nombre entier, en français. */
const whole = (x) => x.toLocaleString('fr-FR');

/**
 * Les `n` blessés annoncés, répartis comme les CRS blessés en octobre 2026. Chaque part est arrondie à l'entier le plus
 * proche, sans décimale : 2,84 blessés légers sur 3 s'écrivent 3, et 0,31 arrêt de travail, 0. Aucune part ne dépasse
 * le total, les blessures aux jambes et aux bras ensemble non plus (737 + 451 ≤ 1 233 dans la source), et le tiers ne
 * dépasse pas les origines connues : un test le vérifie jusqu'à 20 000 blessés. Les parts se recoupent (un blessé
 * léger peut être en arrêt de travail) : leur somme n'est pas le total, ni dans la source ni ici.
 * @param {number} n  le nombre de blessés annoncés par la partie
 * @returns {{legers: number, arrets: number, jambes: number, bras: number, acouphenes: number, origine: number, tiers: number} | null}
 */
export function injuries(n) {
  if (!(n > 0)) return null;
  const share = (count) => Math.round((n * count) / CRS_OCTOBRE_2026.blesses);
  const { legers, arrets, jambes, bras, acouphenes, origine, tiers } = CRS_OCTOBRE_2026;
  return {
    legers: share(legers), arrets: share(arrets), jambes: share(jambes), bras: share(bras), acouphenes: share(acouphenes),
    origine: share(origine), tiers: share(tiers),
  };
}

/** « 1 blessé léger », « 2 blessés légers ». */
const word = (x, one, many) => `${whole(x)} ${plural(x, one, many)}`;

/**
 * La ligne de l'écran de fin, en morceaux : « 38 blessés légers », « 4 arrêts de travail »… Une part arrondie à zéro
 * ne s'écrit pas ; le blessé par un tiers non plus, et avec lui les origines connues, dont il est la seule raison d'être.
 * @returns {string[]} vide sans blessé
 */
export function injuryParts(n) {
  const parts = injuries(n);
  if (!parts) return [];
  const limbs = [
    parts.jambes && word(parts.jambes, 'blessure aux jambes ou aux pieds', 'blessures aux jambes ou aux pieds'),
    parts.bras && (parts.jambes ? `${whole(parts.bras)} aux bras ou aux mains` : word(parts.bras, 'blessure aux bras ou aux mains', 'blessures aux bras ou aux mains')),
  ].filter(Boolean).join(' et ');
  return [
    parts.legers && word(parts.legers, 'blessé léger', 'blessés légers'),
    parts.arrets && word(parts.arrets, 'arrêt de travail', 'arrêts de travail'),
    limbs,
    parts.acouphenes && `${whole(parts.acouphenes)} avec un acouphène`,
    // L'origine n'est indiquée que pour une vingtaine d'agents sur 1 233 : le tiers se compte parmi eux.
    // Pas en dessous de 2 : « 1 sur environ 1 » ferait lire 100 % là où la source dit 12 sur une vingtaine.
    parts.tiers >= 2 && `${word(parts.tiers, 'blessé', 'blessés')} sans ambiguïté par un tiers, sur environ ${whole(parts.origine)} dont l’origine est connue`,
  ].filter(Boolean);
}
