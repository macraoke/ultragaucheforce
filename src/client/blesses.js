// Le bilan des blessés de fin de niveau : le nombre que la partie annonce côté forces de l'ordre, réparti comme les
// CRS blessés en octobre 2026 dans le fichier interne de leur direction (fiche `crs-blesses-octobre-2026`), et une ou
// deux blessures de ce fichier, mot pour mot. Ce qui s'affiche se tire au hasard de la partie. Sans DOM : testé dans Node.

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

/**
 * Des blessures du fichier, telles que l'article de Mediapart les cite et que la fiche les reprend : un test vérifie
 * que chacune y figure mot pour mot. L'article n'en donne pas le nombre (ce sont des exemples) : l'écran les cite
 * telles quelles, sans les ramener à la partie. Les crochets sont ceux de Mediapart.
 */
export const FROM_FILE = {
  // Ce qu'un agent s'est fait seul : une porte, une chute du fourgon, une course, un trou.
  alone: [
    '« poignet gauche en fermant la porte du VR »',
    '« se tord la cheville en chutant du fourgon »',
    '« une entorse [lors d’une] poursuite pédestre »',
    '« des douleurs aux côtes droites lors d’une course-poursuite »',
    '« une cheville tordue dans un trou »',
  ],
  // Des blessures déclarées, au mot près.
  declared: [
    '« douleur orteil pied droit »',
    '« auriculaire main droite »',
    '« fesse gauche »',
    '« voûte plantaire »',
    '« pouce de la main droite »',
    '« ongle majeur droit »',
    'des hauts gradés, parfois pour une « douleur fesses quadriceps gauche »',
  ],
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
 * La répartition entière, en morceaux, dans l'ordre de la source : « 38 blessés légers », « 4 arrêts de travail »…
 * Une part arrondie à zéro ne s'écrit pas ; le blessé par un tiers non plus, et avec lui les origines connues, dont il
 * est la seule raison d'être.
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

/** Combien de parts s'affichent en plus des blessés légers. */
const SHOWN = 2;

/**
 * Ce que l'écran de fin dit des `n` blessés, tiré au hasard de la partie (même graine, même écran) :
 * - `parts` : les blessés légers, toujours en tête, puis deux autres parts de la répartition, dans l'ordre de la source ;
 * - `file` : une blessure qu'un agent s'est faite seul, et une fois sur deux une autre du fichier.
 * @param {number} n  les blessés annoncés par la partie
 * @param {{int: (k: number) => number, pick: (list: string[]) => string}} rng  le hasard de la partie (`makeRng(game.seed)`)
 * @returns {{parts: string[], file: string[]}} vides sans blessé
 */
export function injuryReport(n, rng) {
  const [first, ...rest] = injuryParts(n);
  if (!first) return { parts: [], file: [] };
  const kept = new Set(shuffle(rest, rng).slice(0, SHOWN));
  const alone = rng.pick(FROM_FILE.alone);
  const others = [...FROM_FILE.alone.filter((x) => x !== alone), ...FROM_FILE.declared];
  return {
    parts: [first, ...rest.filter((part) => kept.has(part))],
    file: rng.int(2) ? [alone, rng.pick(others)] : [alone],
  };
}

/** Une copie mélangée de `list` (Fisher-Yates), au hasard de `rng`. */
function shuffle(list, rng) {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
