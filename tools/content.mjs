// Lecture du dossier `content/` : la seule porte d'entrée pour le serveur local, la validation,
// le build et les tests.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { buildContent } from '../src/content/rules.js';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** @returns {{path: string, text: string | null}[]} chemins relatifs à la racine, avec des « / » */
export function readContentFiles(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.txt')) out.push({ path, text: readFileSync(join(root, path), 'utf8') });
      else if (!entry.name.endsWith('.md')) out.push({ path, text: null });
    }
  };
  walk('content');
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export const loadContent = (root = ROOT) => buildContent(readContentFiles(root));
