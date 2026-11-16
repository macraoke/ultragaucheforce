// Petits outils d'interface partagés par les écrans du jeu et la Galerie.

/** Crée un élément : h('button', { onclick }, 'Texte', autreElement…) */
export function h(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false && c !== ''));
  return node;
}

/** Lien externe (sources, ressources) : s'ouvre dans un nouvel onglet. Seule une adresse https devient un lien. */
export const link = (url, text) =>
  (/^https:\/\//.test(url) ? h('a', { href: url, target: '_blank', rel: 'noopener' }, text) : h('span', {}, text));

const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

/** « 2018-10-16 » → « 16 oct. 2018 » */
export function frenchDate(iso = '') {
  const [y, m, d] = iso.split('-');
  return [d && Number(d), m && MONTHS[Number(m) - 1], y].filter(Boolean).join(' ');
}

/** 1477.93 → « 1 477,93 » */
export const frenchNumber = (n, digits = 0) =>
  n.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** Le pluriel commence à 2, en français : « 1,5 milliard », « 0,2 milliard », « 2 milliards ». */
export const plural = (value, one, many) => (Math.abs(value) >= 2 ? many : one);

/** Un grand nombre arrondi vers le bas à deux chiffres : 64 640 → 64 000, 247 → 240. Jamais plus que le vrai. */
export const floorTwo = (n) => {
  const step = 10 ** Math.max(0, Math.floor(Math.log10(Math.max(1, n))) - 1);
  return Math.floor(n / step) * step;
};
/** 64 640 → « 64 000 » : `floorTwo`, écrit en français. */
export const round = (n) => frenchNumber(floorTwo(n));

/** Des milliards d'euros donnés tels quels (une fortune) : « 121,2 milliards », « 1,5 milliard ». */
export const billions = (value) => `${frenchNumber(value, value % 1 ? 1 : 0)} ${plural(value, 'milliard', 'milliards')}`;

/** Une somme en euros, arrondie vers le bas : « 2,4 milliards », « 1,3 milliard », « 210 millions », « 1 million ». */
export function money(euros) {
  if (euros >= 1e9) return billions(Math.floor(euros / 1e8 + 1e-9) / 10);
  if (euros >= 1e6) {
    const shown = floorTwo(euros / 1e6);
    return `${frenchNumber(shown)} ${plural(shown, 'million', 'millions')}`;
  }
  const shown = floorTwo(euros);
  return `${frenchNumber(shown)} ${plural(shown, 'euro', 'euros')}`;
}

/** Les mots en h aspiré qui pourraient ouvrir un nom : devant eux, « de » ne s'élide pas (« de Hollande »). */
const ASPIRATED = new Set(['haut', 'hausse', 'hasard', 'héros', 'honte', 'hollande', 'hongrie', 'hall', 'halle', 'hameau', 'hangar', 'hibou']);

/**
 * « de » devant un nom, comme on l'écrit : « d’Emmanuel Besnier », « d’Hélène », « d’un chirurgien », « de Bernard
 * Arnault », « du Milliardaire invisible », « de la Dernière Famille royale », « de l’Héritière », « des Riches ».
 * Voyelle et h muet élident ; un y suivi d'une consonne aussi (« d’Yves »), pas devant une voyelle (« de Yannick »).
 */
export function de(text) {
  const name = String(text).trim();
  const article = /^(?:(le|la|les)\s+|(l)['’])/i.exec(name);
  if (article) {
    const rest = name.slice(article[0].length);
    return { le: `du ${rest}`, la: `de la ${rest}`, les: `des ${rest}` }[article[1]?.toLowerCase()] ?? `de l’${rest}`;
  }
  const low = name.toLowerCase();
  const word = low.split(/[\s'’-]/)[0];
  const elides = /^[aeiouàâäéèêëîïôöùûüœæ]/.test(low) || (low.startsWith('h') && !ASPIRATED.has(word)) || /^y[^aeiouyàâäéèêëîïôöùûü]/.test(low);
  return elides ? `d’${name}` : `de ${name}`;
}

/** Le nom court d'une source : ce qui précède « — » dans son titre (le média, l'institution). */
export const sourceName = (item) => item.source.titre.split(' — ')[0];

/** La ligne « Source : … » affichée sous une fiche réelle : le nom de la source, cliquable. */
export const sourceLine = (item) => h('small', { className: 'source' }, 'Source : ', link(item.source.url, sourceName(item)));

/** L'attribution d'une citation : qui, quand ; le tout mène à la source. */
export const signature = (quote) => link(quote.source.url, `${quote.auteur}, ${frenchDate(quote.date)}`);
