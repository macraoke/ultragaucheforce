// `npm run verifier` : vérifie tout le contenu et explique chaque problème en français.
// En CI, les erreurs sont annotées directement sur la ligne fautive de la PR.

import { appendFileSync } from 'node:fs';
import { loadContent } from './content.mjs';
import { formatError } from '../src/content/rules.js';

const { bundle, errors } = loadContent();
const count = (dir) => Object.keys(bundle[dir]).length;
const summary = [
  `${count('niveaux')} niveaux, ${count('heros')} héros, ${count('ennemis')} ennemis, ${count('boss')} boss, ${count('drapeaux')} drapeaux`,
  `${count('citations')} citations, ${count('fiches')} fiches, ${bundle.manchettes.length} manchettes, ${bundle.pancartes.length} pancartes, ${count('sons')} bruitages`,
];

for (const e of errors) {
  console.error(formatError(e));
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error file=${e.file},line=${e.line}${e.col ? `,col=${e.col}` : ''}::${e.message.replaceAll('\n', ' ')}`);
  }
}

const verdict = errors.length
  ? `❌ ${errors.length} problème(s) dans le contenu.`
  : '✅ Contenu valide.';
console.log(`${verdict}\n${summary.join('\n')}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = [`## ${verdict}`, '', ...summary.map((s) => `- ${s}`), ''];
  if (errors.length) lines.push('| Fichier | Ligne | Problème |', '|---|---|---|', ...errors.map((e) => `| \`${e.file}\` | ${e.line} | ${e.message} |`));
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
}

process.exit(errors.length ? 1 : 0);
