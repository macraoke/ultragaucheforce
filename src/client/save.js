// Sauvegarde locale : progression, découvertes, options, brouillon de l'Atelier.
// Rien ne quitte l'appareil. Si le stockage est indisponible (navigation privée, quota),
// le jeu continue avec une sauvegarde en mémoire.

const KEY = 'ugf:sauvegarde'; // préfixé : le domaine peut être partagé avec d'autres pages

/** Le format de la sauvegarde. Il ne change qu'avec une fonction de passage dans `MIGRATIONS`. */
export const VERSION = 1;

/**
 * `MIGRATIONS[n - 1]` fait passer une sauvegarde de la version n à la version n + 1.
 * On n'en retire jamais : un joueur peut revenir après des mois. Chaque version garde une vraie
 * sauvegarde dans `tests/fixtures/sauvegardes/`, que les tests font remonter jusqu'à aujourd'hui.
 */
const MIGRATIONS = [];

const DEFAULTS = {
  termines: {}, // identifiant de niveau → vrai
  records: {}, // identifiant de niveau → la plus grande manif à l'arrivée
  decouvertes: [], // ce qui est débloqué dans la Collection : « rayon:identifiant ». Une clé inconnue reste : la fiche peut revenir
  vues: {}, // rayon de la Collection → nombre de découvertes lors de sa dernière visite (badge « Nouveau »)
  heros: '', // le héros de départ choisi ; vide : au hasard
  options: { son: true, musique: false, sobre: false }, // la musique (lecteur SoundCloud) ne se lance que sur demande
  brouillon: '',
};

/**
 * Une sauvegarde lue, de n'importe quelle version, devient celle d'aujourd'hui. Rien n'est retiré :
 * ce que cette version du jeu ne connaît pas (une fiche partie, un champ d'une version plus récente) est gardé tel quel.
 */
export function upgrade(stored) {
  let save = stored && typeof stored === 'object' ? stored : {};
  for (let v = save.version ?? 1; v < VERSION; v++) save = MIGRATIONS[v - 1](save);
  return {
    ...structuredClone(DEFAULTS), ...save,
    options: { ...DEFAULTS.options, ...save.options },
    version: Math.max(save.version ?? 1, VERSION),
  };
}

export function loadSave() {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(KEY));
  } catch {
    // stockage illisible ou interdit : on repart des valeurs par défaut
  }
  return upgrade(stored);
}

export function storeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // tant pis : la partie reste jouable
  }
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
