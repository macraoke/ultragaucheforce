// Les brouillons de l'Atelier : chaque niveau commencé reste dans le navigateur, sous sa propre clé.
// La sauvegarde du jeu (save.js) n'en dépend pas, et ils n'y touchent pas.
//
// Stockage refusé (navigation privée, réglage du navigateur) : les brouillons vivent en mémoire jusqu'à la
// fermeture de l'onglet. Stockage plein : ce qui est déjà enregistré reste, le reste attend en mémoire.
// Dans les deux cas, `status` le dit, et l'Atelier aussi.
//
// Chaque geste relit le stockage avant d'écrire : un autre onglet a pu y créer ou supprimer un brouillon.

import { readLevel, writeLevel, getField, setField } from './atelier-modele.js';

export const KEY = 'ugf:atelier:brouillons'; // préfixé, à part de la sauvegarde du jeu (`ugf:sauvegarde`)
const UNREAD = 'ugf:atelier:brouillons:illisible'; // un stockage qu'on n'a pas su lire reste ici, tel quel

/** Le format des brouillons. Il ne change qu'avec une fonction de passage dans `MIGRATIONS`. */
export const VERSION = 1;

/** `MIGRATIONS[n - 1]` fait passer les brouillons de la version n à la version n + 1. On n'en retire jamais. */
const MIGRATIONS = [];

const empty = () => ({ version: VERSION, ouvert: '', brouillons: [] });
const versionOf = (data) => (Number.isInteger(data?.version) && data.version >= 1 ? data.version : 1);
const isDraft = (d) => Boolean(d) && typeof d === 'object' && typeof d.id === 'string' && d.id !== '' && typeof d.texte === 'string';
const time = (value) => (Number.isFinite(value) ? value : 0);
/** Un identifiant qui ne dit rien du niveau : un autre onglet en crée peut-être un à la même milliseconde. */
const newId = (at) => `${at.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/**
 * Des brouillons lus, de n'importe quelle version, deviennent ceux d'aujourd'hui. Rien n'est retiré :
 * un champ inconnu reste, une entrée qu'on ne sait pas lire va dans `ecartes`.
 * Un brouillon : { id, texte, cree, modifie } ; `cree` et `modifie` en millisecondes.
 */
export function upgrade(stored) {
  let data = stored && typeof stored === 'object' && !Array.isArray(stored) ? { ...stored } : {};
  const from = versionOf(data);
  for (let v = from; v < VERSION; v++) data = MIGRATIONS[v - 1](data);
  const list = Array.isArray(data.brouillons) ? data.brouillons : [];
  const out = {
    ...data,
    version: Math.max(from, VERSION),
    ouvert: typeof data.ouvert === 'string' ? data.ouvert : '',
    brouillons: list.filter(isDraft).map((d) => ({ ...d, cree: time(d.cree), modifie: time(d.modifie) })),
  };
  const odd = [...list.filter((d) => !isDraft(d)), ...(data.brouillons !== undefined && !Array.isArray(data.brouillons) ? [data.brouillons] : [])];
  if (odd.length) out.ecartes = [...(Array.isArray(data.ecartes) ? data.ecartes : []), ...odd];
  return out;
}

/** Le stockage du navigateur, ou null : y accéder peut lever une erreur (cookies bloqués). */
export function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

const isQuota = (e) => e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e?.code === 22 || e?.code === 1014;

/** Le nom d'un brouillon : le titre de son niveau. */
export function nameOf(text) {
  const model = readLevel(text);
  return (model && getField(model, 'titre')) || 'Sans titre';
}

/** Le même niveau sous un autre titre ; le reste de la fiche ne bouge pas. */
export function retitle(text, name) {
  const model = readLevel(text);
  return model ? writeLevel(setField(model, 'titre', String(name).trim() || 'Sans titre')) : text;
}

/** `base`, ou `base 2`, `base 3`… : le premier nom qu'aucun brouillon ne porte. */
export function freeName(base, taken) {
  const names = new Set(taken);
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

/** « aujourd’hui, 14:32 », « hier, 09:05 », « 3 nov., 18:10 », « 3 nov. 2025, 18:10 ». */
export function when(ms, now = Date.now()) {
  if (!ms) return '';
  const date = new Date(ms);
  const today = new Date(now);
  const day = (d) => d.toDateString();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const hour = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (day(date) === day(today)) return `aujourd’hui, ${hour}`;
  if (day(date) === day(yesterday)) return `hier, ${hour}`;
  const year = date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {};
  return `${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...year })}, ${hour}`;
}

export class Drafts {
  /**
   * @param {{storage?: Storage | null, now?: () => number}} o  `storage` : le stockage du navigateur, ou un faux pour les tests
   */
  constructor({ storage = browserStorage(), now = () => Date.now() } = {}) {
    this.storage = storage;
    this.now = now;
    /** ok | refus (le navigateur refuse : en mémoire) | plein (stockage plein) | lecture (écrits par une version plus récente) */
    this.status = storage ? 'ok' : 'refus';
    this.data = empty();
    this.exists = false; // des brouillons ont déjà été enregistrés (ou, en mémoire, commencés)
    this.read();
  }

  /** Relit le stockage. Refusé, plein (en retard sur la mémoire) ou en lecture seule : la mémoire fait foi. */
  read() {
    if (this.status !== 'ok') return this.data;
    let raw;
    try {
      raw = this.storage.getItem(KEY);
    } catch {
      this.status = 'refus';
      return this.data;
    }
    if (raw === null) {
      this.data = empty();
      this.exists = false;
      return this.data;
    }
    try {
      this.data = upgrade(JSON.parse(raw));
    } catch {
      // Illisible : on le met de côté sans y toucher, et on repart d'une liste vide.
      try {
        this.storage.setItem(UNREAD, raw);
      } catch {
        // stockage plein : tant pis pour la copie
      }
      this.data = empty();
    }
    this.exists = true;
    this.status = this.data.version > VERSION ? 'lecture' : 'ok';
    return this.data;
  }

  write() {
    if (this.status === 'refus' || this.status === 'lecture') return false;
    try {
      this.storage.setItem(KEY, JSON.stringify(this.data));
      this.status = 'ok';
      return true;
    } catch (e) {
      // Plein alors qu'on n'a jamais rien pu y mettre : c'est un refus (ancienne navigation privée de Safari).
      this.status = isQuota(e) && this.exists ? 'plein' : 'refus';
      return false;
    }
  }

  /** Relit, applique `fn` aux données, écrit. `fn` renvoie false quand il n'a rien changé. */
  change(fn) {
    this.read();
    if (fn(this.data) === false) return this.status === 'ok';
    const saved = this.write();
    this.exists = this.exists || saved || this.status !== 'ok';
    return saved;
  }

  /** Les brouillons, le plus récent d'abord, avec leur nom. */
  list() {
    return [...this.read().brouillons].sort((a, b) => b.modifie - a.modifie).map((d) => ({ ...d, nom: nameOf(d.texte) }));
  }

  get(id) {
    return this.read().brouillons.find((d) => d.id === id) ?? null;
  }

  /** L'identifiant du brouillon ouvert dans l'Atelier, ou ''. */
  get open() {
    return this.read().ouvert;
  }

  select(id) {
    return this.change((data) => {
      if (data.ouvert === id) return false;
      data.ouvert = id;
      return true;
    });
  }

  /** Un nouveau brouillon, ouvert. */
  create(text) {
    const at = this.now();
    const draft = { id: newId(at), texte: text, cree: at, modifie: at };
    this.change((data) => {
      data.brouillons.push(draft);
      data.ouvert = draft.id;
    });
    return draft;
  }

  /**
   * L'enregistrement d'un brouillon. Supprimé entre-temps dans un autre onglet : il revient.
   * @returns vrai si le stockage a ce texte
   */
  save(id, text) {
    return this.change((data) => {
      const draft = data.brouillons.find((d) => d.id === id);
      if (draft?.texte === text) return false;
      const at = this.now();
      if (draft) Object.assign(draft, { texte: text, modifie: at });
      else data.brouillons.push({ id, texte: text, cree: at, modifie: at });
      return true;
    });
  }

  rename(id, name) {
    return this.change((data) => {
      const draft = data.brouillons.find((d) => d.id === id);
      if (!draft) return false;
      Object.assign(draft, { texte: retitle(draft.texte, name), modifie: this.now() });
      return true;
    });
  }

  /** Une copie, sous un nom libre ; le brouillon ouvert reste ouvert. */
  duplicate(id) {
    const source = this.get(id);
    if (!source) return null;
    const at = this.now();
    const name = freeName(`${nameOf(source.texte)} (copie)`, this.list().map((d) => d.nom));
    const copy = { id: newId(at), texte: retitle(source.texte, name), cree: at, modifie: at };
    this.change((data) => {
      data.brouillons.push(copy);
    });
    return copy;
  }

  /** @returns vrai s'il y avait ce brouillon (enregistré ou non : `status` le dit) */
  remove(id) {
    let found = false;
    this.change((data) => {
      found = data.brouillons.some((d) => d.id === id);
      data.brouillons = data.brouillons.filter((d) => d.id !== id);
      if (data.ouvert === id) data.ouvert = '';
      return found;
    });
    return found;
  }

  /**
   * L'ancien brouillon unique de l'Atelier (`save.brouillon`) devient le premier brouillon, une seule fois :
   * seulement si aucun brouillon n'a jamais été enregistré, et s'il n'est pas le niveau de départ intact.
   * @returns le brouillon créé, ou null
   */
  adopt(text, template) {
    if (this.exists || !text || text === template || !readLevel(text)) return null;
    return this.create(text);
  }
}
