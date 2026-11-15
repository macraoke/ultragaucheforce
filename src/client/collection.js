// La Collection : chaque personnage, chaque lieu, chaque parole, chaque fait rencontrés en
// jouant devient une carte, avec la référence exacte qui l'explique. Ce qu'on n'a pas encore
// croisé reste en silhouette : jouer, c'est compléter l'album.

import { h, link, frenchDate } from './dom.js';
import { sprite, spriteElement } from './sprites.js';
import { isFound } from './save.js';

/** Les rayons de l'album, dans l'ordre d'affichage. `keep` trie les fiches entre deux rayons. */
export const SHELVES = [
  { id: 'camarades', titre: 'Camarades', kinds: ['heros', 'recrues'] },
  { id: 'en-face', titre: 'En face', kinds: ['ennemis', 'boss'] },
  { id: 'lieux', titre: 'Lieux', kinds: ['niveaux'] },
  { id: 'paroles', titre: 'Paroles', kinds: ['citations'] },
  { id: 'pancartes', titre: 'Pancartes', kinds: ['pancartes'], keep: (p) => p.credit },
  { id: 'tele', titre: 'Vu à la télé', kinds: ['manchettes'], keep: (m) => m.credit },
  { id: 'faits', titre: 'Faits', kinds: ['fiches'], keep: (f) => f.theme !== 'programme' },
  { id: 'propositions', titre: 'Propositions', kinds: ['fiches'], keep: (f) => f.theme === 'programme' },
  { id: 'luttes', titre: 'Luttes', kinds: ['drapeaux'] },
];

const BADGES = { heros: 'Camarade', recrues: 'Manif', ennemis: 'En face', boss: 'Fortune', niveaux: 'Lieu', citations: 'Parole', pancartes: 'Vu en manif', manchettes: 'Bandeau', fiches: 'Fait', drapeaux: 'Lutte' };
const THEMES = { richesses: 'Richesses', droits: 'Tes droits', ordre: 'Maintien de l’ordre', democratie: 'Démocratie', programme: 'Programme', luttes: 'Luttes' };

/** Toutes les cartes de l'album, numérotées. */
export function allCards(bundle) {
  const cards = [];
  for (const shelf of SHELVES) {
    for (const kind of shelf.kinds) {
      for (const item of Object.values(bundle[kind] || {})) {
        if (item.statut === 'test' || (shelf.keep && !shelf.keep(item))) continue;
        cards.push({ shelf: shelf.id, kind, badge: shelf.id === 'propositions' ? 'Proposition' : BADGES[kind], item, number: cards.length + 1 });
      }
    }
  }
  return cards;
}

/** Le nom affiché d'une carte, quel que soit son rayon. */
export const cardName = (item) => item.nom || item.titre || item.auteur || item.texte;

/** L'identifiant d'une carte : celui de sa fiche ; une pancarte n'a que son texte. */
export const cardId = (item) => item.id ?? item.texte;

/** Où croise-t-on cette carte ? L'indice affiché sous une silhouette. */
function whereToFind(bundle, kind, item) {
  const levels = Object.values(bundle.niveaux).filter((lv) => {
    if (kind === 'niveaux') return lv.id === item.id;
    if (kind === 'heros') return lv.heros === item.id || lv.camarades.includes(item.id);
    if (kind === 'boss') return lv.boss === item.id;
    if (kind === 'fiches') return lv.fiche.includes(item.id);
    return Object.values(lv.legende).some((l) => l.id === item.id);
  }).map((lv) => lv.titre);
  if (levels.length) return levels;
  if (kind === 'citations') return [item.categorie === 'gauche' ? 'un camarade libéré' : 'PANIQUE TV'];
  if (kind === 'pancartes') return ['dans le cortège'];
  if (kind === 'manchettes') return ['PANIQUE TV'];
  if (kind === 'fiches') return [THEMES[item.theme] || item.theme];
  return [];
}

/** Une miniature de niveau : un pixel par case, de la couleur dominante de sa tuile. */
function levelThumb(bundle, level) {
  const symbols = Object.fromEntries(Object.values(bundle.tuiles).map((t) => [t.symbole, t]));
  const rows = level.carte;
  const cvs = h('canvas', { className: 'pixel', width: rows[0].length, height: rows.length });
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = { campagne: '#6fc4ee', ville: '#8ea2c0', citadelle: '#2b1741' }[level.fond] || '#6fc4ee';
  ctx.fillRect(0, 0, cvs.width, cvs.height);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const tile = symbols[row[x]] || symbols[level.murs?.[y]?.[x]];
      if (!tile) continue;
      const art = sprite(tile.sprites.image, bundle.palette, false, false, !symbols[row[x]]);
      ctx.drawImage(art, 7, 7, 1, 1, x, y, 1, 1);
    }
  });
  cvs.style.width = '100%';
  return cvs;
}

const hearts = (n) => h('span', { className: 'coeurs' }, '♥'.repeat(n));
const bar = (value, max) => '▮'.repeat(Math.max(1, Math.round((value / max) * 5))).padEnd(5, '▯');

/** L'image d'une carte ; les paroles et les faits n'en ont pas. */
function artOf(bundle, kind, item) {
  if (kind === 'niveaux') return levelThumb(bundle, item);
  if (!item.sprites) return null;
  const rows = item.sprites.portrait || item.sprites.repos || item.sprites.image;
  const scale = Math.max(2, Math.floor(120 / Math.max(rows.length, rows[0].length)));
  return spriteElement(rows, bundle.palette, scale);
}

/** Sur une carte, la source tient en une ligne : le média, cliquable. */
const shortSource = (item) => h('p', { className: 'source' }, 'Source : ', link(item.source.url, item.source.titre.split(' — ')[0]));

const quoteBlock = (quote) => h('blockquote', {}, `« ${quote.texte} »`,
  h('cite', {}, `${quote.auteur}, ${frenchDate(quote.date)} · `, link(quote.source.url, 'source')));

/** Les lignes « d'où ça vient » : la citation exacte et la fiche sourcée attachées à la carte. */
function references(bundle, item) {
  const out = [];
  const quote = bundle.citations[item.citation];
  if (quote) out.push(quoteBlock(quote));
  for (const id of [item.fiche].flat()) {
    const fact = bundle.fiches[id];
    if (fact) out.push(h('p', { className: 'fait' }, fact.texte, ' ', link(fact.source.url, 'source')));
  }
  for (const r of item.ressources || []) out.push(h('p', { className: 'fait' }, link(r.url, r.titre)));
  return out;
}

function facts(kind, item) {
  if (kind === 'heros') {
    return [[hearts(item.pv), `  vitesse ${bar(item.vitesse, 200)}  saut ${bar(item.saut, 4.5)}`],
      item.speciale?.nom && `Spéciale : ${item.speciale.nom}`];
  }
  if (kind === 'ennemis') {
    const w = item.arme;
    const traits = [item.bouclier && 'bouclier', w?.gaz > 0 && 'lacrymogènes', w?.vise > 0 && 'LBD', w?.type === 'jet' && 'canon à eau',
      w?.mots?.length && 'tire des mots', item.reaction === 'charge' && 'charge', item.reaction === 'fonce' && 'fonce',
      item.reaction === 'projecteur' && 'projecteur', item.deplacement === 'vol' && 'vole',
      item.debordement > 0 && `cède devant ${item.debordement} manifestants`].filter(Boolean);
    return [[hearts(Math.min(item.pv, 10)), item.pv > 10 ? ` ×${item.pv}` : ''], traits.join(' · ')];
  }
  if (kind === 'boss') return [`Fortune : ${String(item.fortune.montant).replace('.', ',')} milliards d’euros`];
  if (kind === 'recrues') return [item.multiplie > 1 ? `Manif × ${item.multiplie}` : `+ ${item.apport} dans la manif`];
  if (kind === 'niveaux') return [item.accroche];
  if (kind === 'drapeaux') return [item.description];
  return [];
}

/** Le corps d'une carte « Parole » ou « Fait » : le texte exact, son contexte, sa source. */
function textBody(kind, item) {
  if (kind === 'pancartes' || kind === 'manchettes') {
    const [where, url] = item.credit.split(' — ');
    return [h('p', { className: 'dapres' }, where), url && h('p', { className: 'source' }, link(url, 'source'))];
  }
  if (kind === 'citations') {
    return [h('blockquote', {}, `« ${item.texte} »`),
      h('p', { className: 'dapres' }, [item.fonction, frenchDate(item.date)].filter(Boolean).join(', ')),
      h('p', {}, item.contexte), shortSource(item)];
  }
  return [h('p', {}, item.texte), item.portee && h('p', { className: 'dapres' }, item.portee), shortSource(item)];
}

/**
 * Une carte de l'album.
 * @param {{kind: string, badge: string, item: object, number: number}} card
 * @param {boolean} found  faux : silhouette et indice seulement
 */
export function collectionCard(bundle, card, found = true) {
  const { kind, badge, item, number } = card;
  const where = whereToFind(bundle, kind, item);
  const art = artOf(bundle, kind, item);
  const head = h('header', {}, h('span', {}, `N° ${String(number).padStart(3, '0')}`), h('span', { className: 'genre' }, badge));
  const picture = art ? h('div', { className: 'vignette' }, art) : h('div', { className: 'vignette vide' }, found ? '' : '?');
  if (!found) {
    return h('article', { className: `carte ${kind} cachee` }, head, picture,
      h('h3', {}, '???'),
      h('p', { className: 'indice' }, where.length ? `À découvrir : ${where[0]}` : 'À découvrir'));
  }
  return h('article', { className: `carte ${kind}` }, head, art && picture,
    h('h3', {}, kind === 'pancartes' || kind === 'manchettes' ? `« ${item.texte} »` : cardName(item)),
    item.inspiration && h('p', { className: 'dapres' }, `d’après ${item.inspiration}`),
    item.origine && h('p', { className: 'origine' }, item.origine),
    art ? references(bundle, item) : textBody(kind, item),
    facts(kind, item).filter(Boolean).map((line) => h('p', { className: 'stats' }, line)),
    where.length && art && kind !== 'niveaux' ? h('p', { className: 'indice' }, `Vu dans : ${where.join(', ')}`) : null);
}

/** Combien de cartes trouvées, sur combien ? `save` nul : tout compte comme trouvé (Galerie). */
export function collectionCount(bundle, save = null, shelf = null) {
  const cards = allCards(bundle).filter((c) => !shelf || c.shelf === shelf);
  return { found: cards.filter((c) => !save || isFound(save, c.kind, cardId(c.item))).length, total: cards.length };
}

/** Les cartes d'un rayon. */
export function collectionShelf(bundle, shelf, save = null) {
  return h('div', { className: 'cartes-album' }, allCards(bundle).filter((c) => c.shelf === shelf)
    .map((c) => collectionCard(bundle, c, !save || isFound(save, c.kind, cardId(c.item)))));
}

/** L'album complet, rayon par rayon (Galerie). */
export function collectionAlbum(bundle, save = null) {
  const { found, total } = collectionCount(bundle, save);
  return h('div', { className: 'album' },
    h('p', { className: 'compte' }, `${found} / ${total}`),
    SHELVES.map((shelf) => (collectionCount(bundle, save, shelf.id).total
      ? [h('h3', { className: 'rayon' }, shelf.titre), collectionShelf(bundle, shelf.id, save)] : [])));
}
