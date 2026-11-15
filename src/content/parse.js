// Format « fiche texte » : le seul format de contenu du jeu.
//
//   # commentaire
//   clé: valeur            une par ligne ; une même clé peut être répétée (liste)
//   --- nom                ouvre une section : les lignes suivantes sont une grille de caractères
//
// Ce module ne dépend de rien : il tourne à l'identique dans le navigateur, dans Node et en CI.

export class Fiche {
  /** @param {string} text */
  constructor(text) {
    this.fields = []; // [{ key, value, line }]
    this.sections = {}; // nom → { rows: string[], line }
    this.errors = []; // [{ line, message }]
    let section = null;
    const lines = String(text).replace(/^﻿/, '').split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = i + 1;
      const head = raw.match(/^---\s*(.*)$/);
      if (head) {
        const name = head[1].trim();
        if (!name) this.errors.push({ line, message: 'Il manque un nom après « --- » (exemple : « --- carte »).' });
        if (this.sections[name]) this.errors.push({ line, message: `La section « ${name} » existe déjà plus haut.` });
        section = this.sections[name] = { rows: [], line: line + 1 };
        return;
      }
      if (section) {
        section.rows.push(raw.replace(/\s+$/, ''));
        return;
      }
      if (!raw.trim() || raw.trimStart().startsWith('#')) return;
      const m = raw.match(/^\s*([^:\s][^:]*?)\s*:\s?(.*)$/);
      if (!m) {
        this.errors.push({ line, message: 'Ligne illisible : écris « clé: valeur ».' });
        return;
      }
      this.fields.push({ key: m[1], value: m[2].trim(), line });
    });
    for (const s of Object.values(this.sections)) {
      while (s.rows.length && !s.rows.at(-1)) s.rows.pop();
    }
  }

  /** Dernière valeur donnée à une clé, ou undefined. */
  get(key) {
    return this.fields.findLast((f) => f.key === key)?.value;
  }

  /** Toutes les valeurs d'une clé répétée. */
  all(key) {
    return this.fields.filter((f) => f.key === key && f.value).map((f) => f.value);
  }

  lineOf(key) {
    return this.fields.findLast((f) => f.key === key)?.line ?? 1;
  }

  has(key) {
    return this.fields.some((f) => f.key === key);
  }
}

/** Fichier « une ligne = une contribution » (manchettes, pancartes, campagne). */
export function parseLines(text) {
  return String(text)
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .map((raw, i) => ({ text: raw.trim(), line: i + 1 }))
    .filter((l) => l.text && !l.text.startsWith('#'));
}
