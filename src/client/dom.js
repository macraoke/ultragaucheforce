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

/** La ligne « Source : … » affichée sous toute citation ou fiche réelle. */
export const sourceLine = (item) =>
  h('small', { className: 'source' }, 'Source : ', link(item.source.url, item.source.titre),
    h('span', { className: 'nature' }, item.source.nature), ` vérifié le ${frenchDate(item.verifie)}`);
