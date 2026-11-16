// Combien de parties le robot « mortel » gagne-t-il ? Un repère de difficulté, à refaire à l'identique :
//   npm run robot            quarante parties par niveau
//   npm run robot -- 100     cent parties par niveau
// Graines 7919, 15838, 23757… ; héros de départ : celui de la fiche du niveau ; un seul personnage au départ ;
// six minutes quarante de jeu au plus par partie. Le robot fonce et n'esquive rien : un humain fait mieux.

import { loadContent } from './content.mjs';
import { Game } from '../src/sim/game.js';
import { botActions } from '../src/sim/bot.js';

const { bundle, errors } = loadContent();
if (errors.length) {
  console.error('Le contenu a des erreurs : lance d’abord « npm run verifier ».');
  process.exit(1);
}
const games = Math.max(1, Number(process.argv[2]) || 40);
const LIMIT = 60 * 400;

for (const id of Object.keys(bundle.niveaux)) {
  const tally = { won: 0, lost: 0, playing: 0 };
  let deaths = 0;
  for (let n = 1; n <= games; n++) {
    const game = new Game(bundle, id, { seed: n * 7919 });
    const memory = {};
    for (let step = 0; step < LIMIT && game.status === 'playing'; step++) {
      game.step(botActions(game, memory));
      game.events.length = 0;
    }
    tally[game.status]++;
    deaths += game.stats.deaths;
  }
  console.log(`${bundle.niveaux[id].titre} : ${tally.won} victoires sur ${games}, ${tally.lost} défaites, ${tally.playing} parties non finies ; ${(deaths / games).toFixed(1)} personnages perdus par partie`);
}
