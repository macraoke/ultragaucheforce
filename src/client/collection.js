// La Collection : chaque personnage, chaque lieu, chaque parole, chaque fait rencontrés en
// jouant devient une carte, avec la référence exacte qui l'explique. Ce qu'on n'a pas encore
// croisé reste en silhouette : jouer, c'est compléter l'album.
//
// Dans l'album, les cartes sont compactes et toutes de la même taille (`miniCard`) ; on en
// touche une, elle s'ouvre en grand avec ses références (`openCard`, `collectionCard`).

import { h, link, frenchDate, signature, sourceName } from './dom.js';
import { RARITIES } from '../content/rules.js';
import { sprite, spriteElement } from './sprites.js';
import { isFound } from './save.js';

/** Les rayons de l'album, dans l'ordre d'affichage. `keep` trie les fiches entre deux rayons. */
export const SHELVES = [
  { id: 'camarades', titre: 'Camarades', kinds: ['heros', 'recrues'] },
  { id: 'en-face', titre: 'En face', kinds: ['ennemis', 'boss'] },
  { id: 'lieux', titre: 'Lieux', kinds: ['niveaux'] },
  { id: 'paroles', titre: 'Paroles', kinds: ['citations'] },
  { id: 'pancartes', titre: 'Pancartes', kinds: ['pancartes'] },
  { id: 'tele', titre: 'Vu à la télé', kinds: ['manchettes'] },
  { id: 'faits', titre: 'Faits', kinds: ['fiches'], keep: (f) => f.theme !== 'programme' },
  { id: 'propositions', titre: 'Propositions', kinds: ['fiches'], keep: (f) => f.theme === 'programme' },
  { id: 'luttes', titre: 'Luttes', kinds: ['drapeaux'] },
];

const BADGES = { heros: 'Camarade', recrues: 'Manif', ennemis: 'En face', boss: 'Fortune', niveaux: 'Lieu', citations: 'Parole', pancartes: 'Vu en manif', manchettes: 'Bandeau', fiches: 'Fait', drapeaux: 'Lutte' };

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

/** La clé d'une carte dans la sauvegarde : « rayon:identifiant ». */
export const cardKey = (card) => `${card.kind}:${cardId(card.item)}`;

/** Les cartes qui correspondent à des clés de sauvegarde, dans l'ordre de l'album. */
export function cardsByKeys(bundle, keys) {
  const wanted = new Set(keys);
  return allCards(bundle).filter((c) => wanted.has(cardKey(c)));
}

/**
 * Trouvée depuis la dernière visite de son rayon ?
 * `save.vues[rayon]` = nombre de découvertes au moment de cette visite.
 */
export function isFresh(save, card) {
  return save.decouvertes.indexOf(cardKey(card)) >= (save.vues?.[card.shelf] ?? 0);
}

/** Le rayon vient d'être regardé : ses cartes ne sont plus nouvelles. */
export function markSeen(save, shelf) {
  save.vues = { ...save.vues, [shelf]: save.decouvertes.length };
}

/** Une pancarte ou un bandeau a une rareté ; les autres cartes n'en ont pas. */
export const rarityName = (item) => (item.rarete === undefined ? '' : RARITIES[item.rarete]);

/** Les trois démarches que rappelle l'appel au vote. */
export const VOTE_FICHES = ['presidentielle-dates', 'inscription-listes', 'procuration'];

/** Les fiches que la scène de taxe apprend au joueur. */
export const taxFiches = (bundle, boss) =>
  [boss.fortune.fiche, ...boss.fortune.rente, 'revenu-chirurgien', 'prelevements-52', 'prelevements-27', 'enseignants-cout',
    'impot-plancher', 'impot-plancher-rendement', 'impot-plancher-parcours', 'patrimoine-moitie', 'patrimoine-top10']
    .filter((id) => bundle.fiches[id]);

/** La citation dont vient un mot crié en jeu (« ÉCOTERRORISME ! ») : son mot-clé, sinon ses propres mots. */
export function citationOfWord(bundle, word) {
  const bare = word.replace(/\s*!$/, '');
  const all = Object.values(bundle.citations);
  return all.find((c) => c.mot && bare.startsWith(c.mot)) || all.find((c) => c.texte.toUpperCase().includes(bare));
}

/** Les unités qu'on croise dans un niveau : sa légende, sa nasse, les renforts qu'elles appellent, ceux du boss. */
function unitsOf(bundle, level) {
  const ids = new Set(Object.values(level.legende).filter((l) => l.type === 'ennemi').map((l) => l.id));
  if (level.nasse?.ennemi) ids.add(level.nasse.ennemi);
  const called = bundle.boss[level.boss]?.attaques?.invocation?.ennemi;
  if (called) ids.add(called);
  for (const id of [...ids]) if (bundle.ennemis[id]?.renfort?.ennemi) ids.add(bundle.ennemis[id].renfort.ennemi);
  return ids;
}

/**
 * Où gagne-t-on cette carte ? L'indice affiché sous une silhouette, puis « Vu dans » sur la carte trouvée.
 * Une liste vide voudrait dire qu'aucun chemin n'y mène : un test l'interdit.
 */
export function whereToFind(bundle, kind, item) {
  const levels = Object.values(bundle.niveaux);
  const titles = (keep) => levels.filter(keep).map((lv) => lv.titre);
  const inLegend = (lv) => Object.values(lv.legende).some((l) => l.id === item.id);
  const characters = ['heros', 'recrues', 'ennemis', 'boss'].flatMap((k) => Object.values(bundle[k] || {}));
  const speakers = [...Object.values(bundle.heros), ...Object.values(bundle.ennemis)];
  switch (kind) {
    case 'niveaux': return [item.titre];
    case 'heros': return titles((lv) => lv.heros === item.id || lv.camarades.includes(item.id));
    case 'boss': return titles((lv) => lv.boss === item.id);
    case 'recrues': return titles(inLegend);
    case 'ennemis': return titles((lv) => unitsOf(bundle, lv).has(item.id));
    case 'drapeaux': return levels.some((lv) => lv.cortege) ? ['dans le cortège'] : [];
    case 'manchettes': return ['PANIQUE TV'];
    case 'pancartes': {
      const carriers = Object.values(bundle.recrues || {}).filter((r) => r.slogan.includes(item.texte)).map((r) => r.nom);
      return carriers.length ? carriers : ['à ramasser dans un niveau'];
    }
    case 'citations': {
      if (item.categorie !== 'gauche') return ['PANIQUE TV'];
      const quoting = [...characters, ...levels].filter((x) => x.citation === item.id).map(cardName);
      const saying = speakers.filter((x) => (x.arme?.mots || []).some((w) => citationOfWord(bundle, w) === item)).map(cardName);
      return [...quoting, ...saying];
    }
    case 'fiches': {
      const holders = [...characters, ...levels].filter((x) => [x.fiche].flat().includes(item.id)).map(cardName);
      if (holders.length) return holders;
      if (Object.values(bundle.boss).some((b) => taxFiches(bundle, b).includes(item.id))) return ['en taxant une fortune'];
      if (item.theme === 'droits') return ['en libérant un camarade'];
      if (item.theme === 'programme' || VOTE_FICHES.includes(item.id)) return ['à la fin de la campagne'];
      return [];
    }
    default: return [];
  }
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

/** L'image d'une carte, dans un carré de `size` pixels ; les paroles et les faits n'en ont pas. */
function artOf(bundle, kind, item, size = 120) {
  if (kind === 'niveaux') return levelThumb(bundle, item);
  if (!item.sprites) return null;
  const rows = item.sprites.portrait || item.sprites.repos || item.sprites.image;
  const scale = Math.max(size < 120 ? 1 : 2, Math.floor(size / Math.max(rows.length, rows[0].length)));
  return spriteElement(rows, bundle.palette, scale);
}

const SIGNS = { richesses: '€', droits: '§', ordre: '!', democratie: '✓', programme: '★', luttes: '✊' };

/** Sur une carte compacte sans dessin : le mot d'une parole, la pancarte, le bandeau, ou le signe d'un thème. */
function emblem(kind, item) {
  if (kind === 'citations') return h('span', { className: 'mot' }, item.mot || '« »');
  if (kind === 'pancartes' || kind === 'manchettes') return h('span', { className: 'ecrit' }, item.texte);
  return h('span', { className: 'signe' }, SIGNS[item.theme] || '?');
}

/** Sous une carte compacte : son nom ; pour une pancarte ou un bandeau, où et quand on l'a vu. */
const shortName = (kind, item) => (kind === 'pancartes' || kind === 'manchettes' ? item.credit.split(' — ')[0] : cardName(item));

/** Sur une carte, la source tient en une ligne : le média, cliquable. */
const shortSource = (item) => h('p', { className: 'source' }, 'Source : ', link(item.source.url, sourceName(item)));

const quoteBlock = (quote) => h('blockquote', {}, `« ${quote.texte} »`, h('cite', {}, signature(quote)));

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
    return [where && h('p', { className: 'dapres' }, where), url && h('p', { className: 'source' }, link(url, 'source'))];
  }
  if (kind === 'citations') {
    return [h('blockquote', {}, `« ${item.texte} »`),
      h('p', { className: 'dapres' }, link(item.source.url, [item.fonction, frenchDate(item.date)].filter(Boolean).join(', '))),
      item.contexte && h('details', { className: 'portee' }, h('summary', {}, 'Le contexte'), h('p', {}, item.contexte))];
  }
  // Un fait tient en une phrase ; ce qu'il couvre exactement se déplie.
  return [h('p', {}, item.texte), shortSource(item),
    item.portee && h('details', { className: 'portee' }, h('summary', {}, 'Ce que ça couvre'), h('p', {}, item.portee))];
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
  const rarity = found && rarityName(item);
  const head = h('header', {}, h('span', {}, `N° ${String(number).padStart(3, '0')}`),
    h('span', { className: `genre${rarity ? ` rarete-${item.rarete}` : ''}` }, rarity ? `${badge} · ${rarity}` : badge));
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
    where.length && ['heros', 'recrues', 'ennemis', 'boss'].includes(kind) ? h('p', { className: 'indice' }, `Vu dans : ${where.join(', ')}`) : null);
}

/**
 * Une carte compacte : numéro, image ou pictogramme, nom. Toutes de la même taille.
 * @param {{found?: boolean, fresh?: boolean, onOpen?: Function}} options  `fresh` : badge « Nouveau »
 */
export function miniCard(bundle, card, { found = true, fresh = false, onOpen = null } = {}) {
  const { kind, item, number } = card;
  const art = artOf(bundle, kind, item, 56);
  const rare = found && item.rarete > 0;
  return h('button', { type: 'button', className: `carte-mini ${kind}${found ? '' : ' cachee'}${rare ? ` rarete-${item.rarete}` : ''}`, onclick: onOpen },
    h('span', { className: 'numero' }, `N° ${String(number).padStart(3, '0')}`, rare && h('b', {}, '★'.repeat(item.rarete))),
    fresh && h('span', { className: 'nouveau' }, 'Nouveau'),
    h('span', { className: 'vignette' }, art || (found ? emblem(kind, item) : h('span', { className: 'signe' }, '?'))),
    h('span', { className: 'nom' }, found ? shortName(kind, item) : '???'));
}

/**
 * Ouvre une carte en grand, par-dessus l'écran, avec ses références.
 * Se ferme d'un toucher à côté, avec Échap ou avec « Fermer ». `actions` : boutons ajoutés au pied.
 */
export function openCard(bundle, card, { found = true, actions = [] } = {}) {
  const close = () => overlay.remove();
  const overlay = h('div', {
    className: 'carte-ouverte',
    onclick: (e) => e.target === overlay && close(),
    onkeydown: (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation(); // Échap ferme la carte, pas l'écran
      close();
    },
  }, h('div', { className: 'cadre' },
    collectionCard(bundle, card, found),
    h('div', { className: 'pied' }, actions, h('button', { type: 'button', className: 'discret fermer', onclick: close }, 'Fermer'))));
  (document.getElementById('ecran') || document.body).append(overlay);
  overlay.querySelector('.fermer').focus({ preventScroll: true });
  return overlay;
}

/** Une barre de progression : trouvées sur total. */
export const progress = (found, total) =>
  h('span', { className: 'jauge', title: `${found} / ${total}` }, h('i', { style: `width: ${total ? Math.round((found / total) * 100) : 0}%` }));

/**
 * La grille d'un rayon : des cartes compactes ; on en touche une, elle s'ouvre.
 * `actionsFor(carte)` : les boutons à montrer au pied d'une carte trouvée (« Jouer avec »).
 */
export function shelfGrid(bundle, shelf, save = null, actionsFor = () => []) {
  return h('div', { className: 'grille-album' }, allCards(bundle).filter((c) => c.shelf === shelf).map((c) => {
    const found = !save || isFound(save, c.kind, cardId(c.item));
    return miniCard(bundle, c, {
      found, fresh: Boolean(save) && found && isFresh(save, c),
      onOpen: () => openCard(bundle, c, { found, actions: found ? actionsFor(c) : [] }),
    });
  }));
}

/**
 * Les cartes gagnées pendant un niveau, en rangée : elles se retournent une à une.
 * @param {string[]} keys  clés de sauvegarde, « rayon:identifiant »
 */
export function wonCards(bundle, keys) {
  return h('div', { className: 'cartes-gagnees' }, cardsByKeys(bundle, keys).map((c, i) => {
    const mini = miniCard(bundle, c, { onOpen: () => openCard(bundle, c) });
    mini.style.animationDelay = `${Math.min(i, 30) * 70}ms`;
    return mini;
  }));
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
