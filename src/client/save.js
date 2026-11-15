// Sauvegarde locale : progression, découvertes, options, brouillon de l'Atelier.
// Rien ne quitte l'appareil. Si le stockage est indisponible (navigation privée, quota),
// le jeu continue avec une sauvegarde en mémoire.

const KEY = 'ugf:sauvegarde:v1'; // préfixé : le domaine peut être partagé avec d'autres pages

const DEFAULTS = {
  termines: {}, // identifiant de niveau → vrai
  decouvertes: [], // identifiants de fiches, citations et drapeaux rencontrés
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

/** Note une découverte ; renvoie vrai si elle est nouvelle. */
export function discover(save, id) {
  if (save.decouvertes.includes(id)) return false;
  save.decouvertes.push(id);
  storeSave(save);
  return true;
}
