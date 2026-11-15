// Lecture d'un niveau : la carte en caractères devient un monde, des accessoires et des personnages.

import { TILE, World } from './world.js';
import { createHero } from './hero.js';
import { createEnemy } from './enemy.js';
import { createBoss } from './boss.js';
import { createRecruit } from './manif.js';

/** « a | b » ou ['a', 'b'] → ['a', 'b'] */
export const toList = (v) => (Array.isArray(v) ? v : String(v || '').split('|').map((s) => s.trim()).filter(Boolean));

export const playable = (bundle) => Object.values(bundle.heros || {}).filter((h) => h.statut !== 'test');

export function loadLevel(game) {
  const { level, bundle } = game;
  game.world = new World(level.carte, bundle.tuiles || {});
  let start = { x: TILE * 1.5, y: TILE };
  let bossAt = null;

  level.carte.forEach((row, ty) => {
    for (let tx = 0; tx < row.length; tx++) {
      const c = row[tx];
      const x = tx * TILE;
      const cx = x + TILE / 2;
      const feet = (ty + 1) * TILE;
      const prop = (kind, more = {}) => game.props.push({ kind, x, y: ty * TILE, w: TILE, h: TILE, on: false, text: '', ...more });
      if (c === 'D') start = { x: cx, y: feet };
      else if (c === 'S') prop('sortie', { y: feet - 32, w: 48, h: 32, on: !level.boss });
      else if (c === 'K') prop('cage', { hp: 3 });
      else if (c === 'Q') prop('piquet');
      else if (c === 'Y') bossAt = { x: cx, y: feet };
      else if (c === 'N') game.nasses.push({ x: cx, y: feet, on: false });
      else if (c >= '1' && c <= '9') prop('panneau', { text: level.panneaux?.[c] ?? '', n: c });
      else {
        const ref = level.legende?.[c]; // tout autre signe : la légende du niveau (ennemi, recrue ou décor)
        if (ref?.type === 'ennemi' && bundle.ennemis?.[ref.id]) game.enemies.push(createEnemy(bundle.ennemis[ref.id], cx, feet));
        else if (ref?.type === 'recrue' && bundle.recrues?.[ref.id]) game.recruits.push(createRecruit(bundle.recrues[ref.id], cx, feet));
        else if (ref?.type === 'decor') game.decors.push({ id: ref.id, x, y: feet });
      }
    }
  });

  // Héros de départ : celui que le joueur a choisi, sinon celui que le niveau demande, sinon le premier héros jouable.
  const chosen = Object.hasOwn(bundle.heros || {}, game.choice) ? bundle.heros[game.choice] : null;
  const wanted = toList(level.heros).map((id) => bundle.heros?.[id]).find(Boolean);
  const def = (chosen?.statut !== 'test' && chosen) || wanted || playable(bundle)[0] || Object.values(bundle.heros || {})[0];
  if (!def) throw new Error('Aucun héros dans le contenu : ajoute une fiche dans content/heros/.');
  game.hero = createHero(def, start.x, start.y);
  game.checkpoint = start;

  const bossDef = level.boss && bundle.boss?.[level.boss];
  if (bossDef && bossAt) game.boss = createBoss(bossDef, bossAt.x, bossAt.y);
  else for (const p of game.props) if (p.kind === 'sortie') p.on = true;
}
