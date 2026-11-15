// La manif : les recrues qui la rejoignent, le cortège qu'on voit derrière le héros,
// et la nasse qui se referme sur elle.
//
// `game.crowd` est le nombre de manifestants : il n'est jamais plafonné. Le cortège dessiné en est
// l'image : un manifestant pour dix au début, quarante au plus.

import { TILE } from './world.js';
import { moveBox, overlap } from './physics.js';
import { standDown } from './enemy.js';

const MAX_CORTEGE = 40;
const SPACING = 7; // points de trace entre deux manifestants
const KINDS = ['pancarte', 'drapeau', 'fanfare'];
const INSTRUMENTS = ['tambour', 'trompette', 'soubassophone'];
const GRAVITY = 900;
const PUSH_REACH = 64; // un manifestant repoussé par le canon à eau ne s'éloigne pas plus de sa place

const NASSE_DISTANCE = 140; // les lignes apparaissent à cette distance du repère, de chaque côté…
const NASSE_GAP = 40; // …et s'arrêtent à celle-ci : on n'écrase personne
const NASSE_TIME = 20; // secondes avant que la nasse soit levée, quoi qu'il arrive
const NASSE_HEIGHT = 6 * TILE; // le repère se déclenche jusqu'à cette hauteur au-dessus de lui

// ---------------------------------------------------------------- recrues

export function createRecruit(def, cx, feetY) {
  return {
    id: def.id, def, x: cx - def.largeur / 2, y: feetY - def.hauteur, w: def.largeur, h: def.hauteur,
    vx: 0, vy: 0, joined: false, animTime: 0, hitX: 0, hitY: 0,
  };
}

/** Une recrue attend sur place ; elle rejoint la manif dès que le héros la touche. */
export function updateRecruits(game, dt) {
  const { hero, world } = game;
  for (const r of game.recruits) {
    if (r.joined) continue;
    r.animTime += dt;
    if (r.y < world.h * TILE) {
      r.vy = Math.min(r.vy + GRAVITY * dt, 500); // si on creuse sous ses pieds, elle descend
      moveBox(world, r, dt);
      if (r.hitY) r.vy = 0;
    }
    if (!hero.dead && overlap(hero, r)) joinRecruit(game, r);
  }
}

/** Une seule fois par recrue : la manif grossit (apport) ou se multiplie (assemblée générale). */
export function joinRecruit(game, r) {
  if (r.joined) return;
  r.joined = true;
  const { def } = r;
  const n = def.multiplie > 0 ? Math.max(1, Math.round(game.crowd * def.multiplie) - game.crowd) : def.apport;
  const x = r.x + r.w / 2;
  game.stats.recruits++;
  game.addCrowd(n);
  // Un medic soigne : il rend des points de vie au héros, sans dépasser son maximum.
  const { hero } = game;
  const healed = def.soin > 0 && !hero.dead ? Math.min(def.soin, hero.def.pv - hero.hp) : 0;
  hero.hp += healed;
  game.emit('recruit', { id: def.id, n, crowd: game.crowd, x, y: r.y, healed });
  if (def.slogan.length) game.emit('bubble', { x, y: r.y - 6, text: def.slogan[(game.stats.recruits - 1) % def.slogan.length] });
  game.sfx('recrue', x);
  game.discover('recrue', def.id);
  game.addPanic(2);
}

// ---------------------------------------------------------------- cortège

/** Combien de manifestants on dessine pour une foule donnée : jamais plus qu'il n'y en a, quarante au plus. */
export const visibleCortege = (crowd) => Math.max(0, Math.min(crowd, MAX_CORTEGE, 2 + Math.ceil(crowd / 10)));

/** Ajuste le cortège dessiné au nombre de manifestants (seulement si le niveau a un cortège). */
export function syncCortege(game) {
  if (!game.level.cortege) return;
  const { hero, bundle, cortege } = game;
  const wanted = visibleCortege(game.crowd);
  if (cortege.length > wanted) cortege.length = wanted;
  // Le cortège porte de vraies pancartes (celles qui ont un crédit), s'il y en a ; seules les courtes
  // restent lisibles, les autres vivent dans la Collection.
  const sourced = (bundle.pancartes || []).filter((p) => p.credit);
  const all = sourced.length ? sourced : bundle.pancartes || [];
  const short = all.filter((p) => p.texte.length <= 26);
  const signs = short.length ? short : all;
  const flags = Object.keys(bundle.drapeaux || {});
  while (cortege.length < wanted) {
    const n = cortege.length;
    const kind = KINDS[n % KINDS.length];
    const turn = Math.floor(n / KINDS.length);
    let label = INSTRUMENTS[turn % INSTRUMENTS.length];
    if (kind === 'pancarte') label = signs.length ? signs[(game.signOffset + turn) % signs.length].texte : '';
    if (kind === 'drapeau') label = flags.length ? flags[turn % flags.length] : '';
    cortege.push({
      x: hero.x + hero.w / 2, y: hero.y + hero.h, facing: hero.facing, kind, label, gassed: 0, pushed: 0, shove: 0,
      animTime: n * 0.13, counted: false,
    });
  }
}

/**
 * Le cortège rejoue la trace du héros : chaque manifestant vise un point plus ancien.
 * Position d'un manifestant : `x` = centre, `y` = pieds.
 */
export function updateCortege(game, dt) {
  const { trail } = game;
  if (!trail.length) return;
  let clouds = 0;
  game.cortege.forEach((m, i) => {
    let k = Math.max(0, trail.length - 1 - (i + 1) * SPACING);
    while (k < trail.length - 1 && !trail[k].ground) k++; // jamais figé en l'air
    const target = trail[k];
    const dx = target.x - m.x;
    const dy = target.y - m.y;
    m.pushed = Math.max(0, m.pushed - dt);
    if (m.pushed > 0) {
      // Repoussé par le canon à eau : il recule, et ne reprend sa marche qu'une fois le jet passé.
      const x = m.x + m.shove * dt;
      if (Math.abs(target.x - x) <= PUSH_REACH) m.x = x;
    } else if (Math.abs(dx) > 96 || Math.abs(dy) > 96) {
      m.x = target.x;
      m.y = target.y;
    } else {
      m.x += Math.max(-4, Math.min(4, dx));
      m.y += Math.max(-5, Math.min(5, dy));
    }
    if (Math.abs(dx) > 0.5) {
      m.facing = Math.sign(dx);
      m.animTime += dt;
    }
    m.gassed = Math.max(0, m.gassed - dt);
    const cloud = m.gassed <= 0 && game.clouds.find((c) => Math.hypot(c.x - m.x, c.y - (m.y - 8)) < c.r);
    if (!cloud) return;
    m.gassed = 3;
    if (!m.counted) {
      m.counted = true;
      game.stats.gassed++; // chaque manifestant gazé compte une fois
    }
    if (!cloud.dispersed) {
      cloud.dispersed = true; // un nuage disperse une fois, pas à chaque manifestant qu'il touche
      clouds++;
    }
  });
  for (let i = 0; i < clouds; i++) game.disperse(0.03);
}

// ---------------------------------------------------------------- nasse

/** Pieds posés au sol dans la colonne de `cx`, en cherchant à partir d'un peu au-dessus de `nearY`. */
export function standingAt(world, cx, nearY) {
  const tx = Math.floor(cx / TILE);
  let ty = Math.max(0, Math.floor(nearY / TILE) - 4);
  while (ty < world.h && (world.solid(tx, ty) || !world.solid(tx, ty + 1))) ty++;
  return ty < world.h ? (ty + 1) * TILE : null;
}

/**
 * La nasse : quand le héros passe un repère « N », des lignes apparaissent des deux côtés et se referment.
 * Avec `nasse.rythme` dans l'en-tête du niveau, elle revient aussi d'elle-même, toutes les tant de secondes,
 * là où le héros se trouve (au sol, hors combat de boss).
 * Jamais une impasse : elle prend fin si le héros en sort par le haut, si une ligne cède, ou au bout de NASSE_TIME.
 * `game.kettle` = null | { x, t, limit, x0, x1 } (x0 et x1 : bords intérieurs des deux lignes).
 */
export function updateKettle(game, dt) {
  const { hero } = game;
  const cx = hero.x + hero.w / 2;
  const k = game.kettle;
  if (!k) {
    if (hero.dead) return;
    const feet = hero.y + hero.h;
    const mark = game.nasses.find((n) => !n.on && Math.abs(n.x - cx) <= TILE / 2 && feet <= n.y + TILE && feet >= n.y - NASSE_HEIGHT);
    const pace = game.level.nasse?.rythme || 0;
    game.kettleClock += dt;
    if (mark) startKettle(game, mark);
    else if (pace > 0 && game.kettleClock >= pace && hero.onGround && !game.boss?.active) startKettle(game, { x: cx, y: feet });
    if (game.kettle) game.kettleClock = 0;
    return;
  }
  k.t += dt;
  const standing = (side) => k.units.filter((e) => e.kettle === side && e.state !== 'done');
  const left = standing(-1);
  const right = standing(1);
  k.x0 = left.length ? Math.max(...left.map((e) => e.x + e.w)) : k.x - NASSE_DISTANCE;
  k.x1 = right.length ? Math.min(...right.map((e) => e.x)) : k.x + NASSE_DISTANCE;
  const outerLeft = left.length ? Math.min(...left.map((e) => e.x)) : k.x0;
  const outerRight = right.length ? Math.max(...right.map((e) => e.x + e.w)) : k.x1;

  let reason = null;
  if (k.t >= k.limit) reason = 'time';
  else if ((k.closed.left && !left.length) || (k.closed.right && !right.length)) reason = 'broken';
  else if (!hero.dead && (cx < outerLeft || cx > outerRight)) reason = 'out';
  if (!reason) return;
  for (const e of k.units) if (e.state !== 'done') standDown(e); // la nasse est levée : les lignes se rangent
  game.kettle = null;
  game.emit('kettle', { state: 'end', reason });
}

function startKettle(game, mark) {
  mark.on = true;
  const { level, bundle, world } = game;
  const def = bundle.ennemis?.[level.nasse?.ennemi];
  if (!def) return;
  const units = [];
  for (const side of [-1, 1]) {
    for (let rank = 0; rank < level.nasse.nombre; rank++) {
      const x = mark.x + side * (NASSE_DISTANCE + rank * (def.largeur + 2));
      if (x < TILE || x > world.w * TILE - TILE) continue;
      const feet = standingAt(world, x, mark.y);
      if (feet === null) continue; // pas de sol à cet endroit : personne
      units.push(game.spawnEnemy(def.id, x, feet, { state: 'alert', kettle: side, rank, facing: -side }));
    }
  }
  if (!units.length) return;
  game.kettle = {
    x: mark.x, t: 0, limit: NASSE_TIME, gap: NASSE_GAP, speed: level.nasse.vitesse, units,
    x0: mark.x - NASSE_DISTANCE, x1: mark.x + NASSE_DISTANCE,
    closed: { left: units.some((e) => e.kettle < 0), right: units.some((e) => e.kettle > 0) },
  };
  game.emit('kettle', { state: 'start', x: mark.x });
  game.sfx('nasse', mark.x);
}
