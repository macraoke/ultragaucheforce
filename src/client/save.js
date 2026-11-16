// Sauvegarde locale : progression, découvertes, options, brouillon de l'Atelier.
// Rien ne quitte l'appareil. Si le stockage est indisponible (navigation privée, quota),
// le jeu continue avec une sauvegarde en mémoire.

const KEY = 'ugf:sauvegarde'; // préfixé : le domaine peut être partagé avec d'autres pages
const UNREAD = 'ugf:sauvegarde:illisible'; // une sauvegarde qu'on n'a pas su lire reste ici, telle quelle

/** Le format de la sauvegarde. Il ne change qu'avec une fonction de passage dans `MIGRATIONS`. */
export const VERSION = 2;

/**
 * `MIGRATIONS[n - 1]` fait passer une sauvegarde de la version n à la version n + 1.
 * On n'en retire jamais : un joueur peut revenir après des mois. Chaque version garde une vraie
 * sauvegarde dans `tests/fixtures/sauvegardes/`, que les tests font remonter jusqu'à aujourd'hui.
 */
const MIGRATIONS = [
  // 1 → 2 : la question « Radio Manif ? » du premier lancement (`options.musiqueChoisie`). Qui avait mis la
  // musique l'a choisie ; les autres n'y ont jamais été invités : la question leur est posée une fois.
  (save) => {
    if (shape(save.options) !== 'object') return save; // abîmées : upgrade() les met de côté et repart des options de départ
    return { ...save, options: { ...save.options, musiqueChoisie: save.options.musique === true } };
  },
];

const DEFAULTS = {
  termines: {}, // identifiant de niveau → vrai
  records: {}, // identifiant de niveau → la plus grande manif à l'arrivée
  decouvertes: [], // ce qui est débloqué dans la Collection : « rayon:identifiant ». Une clé inconnue reste : la fiche peut revenir
  vues: {}, // rayon de la Collection → nombre de découvertes lors de sa dernière visite (badge « Nouveau »)
  heros: '', // le héros de départ choisi ; vide : au hasard
  // La musique (lecteur SoundCloud) ne se lance que sur demande ; `musiqueChoisie` : le joueur a répondu, d'une façon
  // ou d'une autre (question du premier lancement, Options, bouton de Radio Manif), et on ne lui redemande plus.
  options: { son: true, musique: false, sobre: false, musiqueChoisie: false },
  brouillon: '',
};

const shape = (value) => (Array.isArray(value) ? 'liste' : value === null ? 'rien' : typeof value);
/** Le numéro de version d'une sauvegarde : un entier à partir de 1 ; tout le reste vaut 1. */
const versionOf = (save) => (Number.isInteger(save?.version) && save.version >= 1 ? save.version : 1);

/**
 * Une sauvegarde lue, de n'importe quelle version, devient celle d'aujourd'hui. Rien n'est retiré :
 * ce que cette version du jeu ne connaît pas (une fiche partie, un champ d'une version plus récente) est gardé tel quel.
 * Un champ qui n'a pas la bonne forme reprend sa valeur de départ ; l'original reste dans `ecartes`.
 */
export function upgrade(stored) {
  let save = shape(stored) === 'object' ? { ...stored } : {};
  const from = versionOf(save);
  for (let v = from; v < VERSION; v++) save = MIGRATIONS[v - 1](save);
  const out = { ...structuredClone(DEFAULTS), ...save, version: Math.max(from, VERSION) };
  for (const [key, start] of Object.entries(DEFAULTS)) {
    if (shape(out[key]) === shape(start)) continue;
    out.ecartes = { ...out.ecartes, [key]: out[key] };
    out[key] = structuredClone(start);
  }
  out.options = { ...DEFAULTS.options, ...out.options };
  return out;
}

/** Le menu demande « Radio Manif ? » : le joueur n'a jamais choisi, et la musique est coupée. */
export const asksMusic = (save) => !save.options.musique && !save.options.musiqueChoisie;

/** Écrite par une version plus récente du jeu : cette version-ci la lit, mais n'y écrit pas, pour ne rien abîmer. */
export const isReadOnly = (save) => versionOf(save) > VERSION;

export function loadSave() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return upgrade(null); // stockage interdit : sauvegarde en mémoire
  }
  try {
    return upgrade(JSON.parse(raw));
  } catch {
    // Illisible, ou un passage de version a échoué : on la met de côté sans y toucher, et on repart de zéro.
    try {
      localStorage.setItem(UNREAD, raw);
    } catch {
      // stockage plein : tant pis pour la copie
    }
    return upgrade(null);
  }
}

/**
 * Ce qu'un autre onglet a écrit entre-temps rejoint cette sauvegarde : l'union des découvertes, le meilleur record,
 * tout niveau terminé. Le reste (options, héros choisi) est à celui qui écrit en dernier.
 */
export function fold(save, other) {
  for (const key of other.decouvertes) if (!save.decouvertes.includes(key)) save.decouvertes.push(key);
  for (const [id, crowd] of Object.entries(other.records)) if (!(save.records[id] >= crowd)) save.records[id] = crowd;
  for (const [id, done] of Object.entries(other.termines)) if (done) save.termines[id] = true;
  return save;
}

/**
 * @param {object} save
 * @param {{erase?: boolean}} o  `erase` : le joueur efface sa progression, on ne reprend pas ce qui est stocké
 * @returns {boolean} vrai si la sauvegarde a été écrite
 */
export function storeSave(save, { erase = false } = {}) {
  if (isReadOnly(save)) return false;
  try {
    const now = JSON.parse(localStorage.getItem(KEY));
    if (shape(now) === 'object') {
      if (versionOf(now) > VERSION) {
        save.version = versionOf(now); // un onglet plus récent est passé par là : on n'écrase pas son travail
        return false;
      }
      if (!erase) fold(save, upgrade(now));
    }
  } catch {
    // rien de lisible à reprendre
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
    return true;
  } catch {
    return false; // tant pis : la partie reste jouable
  }
}

/** Le joueur efface sa progression ; ses options et son brouillon restent. */
export function eraseProgress(save) {
  Object.assign(save, { termines: {}, records: {}, decouvertes: [], vues: {}, heros: '' });
  return storeSave(save, { erase: true });
}

const key = (kind, id) => `${kind}:${id}`;

/** Cette carte (« heros », « ennemis », « citations »… + identifiant) a-t-elle déjà été rencontrée ? */
export const isFound = (save, kind, id) => save.decouvertes.includes(key(kind, id));

/** Note une découverte ; renvoie vrai si elle est nouvelle. */
export function discover(save, kind, id) {
  if (isFound(save, kind, id)) return false;
  save.decouvertes.push(key(kind, id));
  storeSave(save);
  return true;
}
