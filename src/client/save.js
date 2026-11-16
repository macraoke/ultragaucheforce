// Sauvegarde locale : progression, découvertes, options, brouillon de l'Atelier.
// Rien ne quitte l'appareil. Si le stockage est indisponible (navigation privée, quota),
// le jeu continue avec une sauvegarde en mémoire.

const KEY = 'ugf:sauvegarde:v1'; // préfixé : le domaine peut être partagé avec d'autres pages

const DEFAULTS = {
  termines: {}, // identifiant de niveau → vrai
  records: {}, // identifiant de niveau → la plus grande manif à l'arrivée
  decouvertes: [], // ce qui est débloqué dans la Collection : « rayon:identifiant »
  vues: {}, // rayon de la Collection → nombre de découvertes lors de sa dernière visite (badge « Nouveau »)
  heros: '', // le héros de départ choisi ; vide : celui que le niveau propose
  options: { son: true, musique: false, sobre: false }, // la musique (lecteur SoundCloud) ne se lance que sur demande
  brouillon: '',
};

export function loadSave() {
  let stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    // stockage illisible ou interdit : on repart des valeurs par défaut
  }
  return { ...structuredClone(DEFAULTS), ...stored, options: { ...DEFAULTS.options, ...stored.options } };
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
