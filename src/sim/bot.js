// Un robot simplet qui joue à notre place : il sert de test « anti-blocage ».
// S'il arrive au bout d'un niveau, un humain y arrivera aussi.
//
// Stratégie : viser le boss tant qu'il est debout (même endormi : il faut aller le réveiller), sinon la sortie ;
// tirer sans arrêt ; sauter devant un trou, un mur, ou quand il s'y accroche ; reculer un peu s'il n'avance plus.
// Tombé sous terre, il creuse droit devant lui. Au fond d'un trou sous son but, calé sous terre contre un mur
// qui ne se creuse pas, ou en contrebas d'un boss qu'il ne touche plus, il remonte : il gagne une paroi,
// y grimpe par bonds, et perce le plafond en tirant vers le haut dès que son tir y porte.
// Il n'a que les commandes d'un joueur, et relâche le saut entre deux bonds, comme un joueur.

import { TILE } from './world.js';
import { wallAt } from './physics.js';

const JUMP = 22; // pas tenus pour un saut complet
const HOP = 6; // pas tenus pour un petit bond contre une paroi
const RISE = 1500; // pas au plus pour remonter par une paroi ; ensuite on essaie l'autre

/**
 * @param {import('./game.js').Game} game
 * @param {object} memory  objet vide au départ, conservé d'un pas à l'autre
 */
export function botActions(game, memory) {
  const m = memory;
  m.t = (m.t ?? 0) + 1;
  m.hold = Math.max(0, (m.hold ?? 0) - 1);
  m.back = Math.max(0, (m.back ?? 0) - 1);
  m.rest = Math.max(0, (m.rest ?? 0) - 1);
  m.straight = Math.max(0, (m.straight ?? 0) - 1);
  const act = { left: false, right: false, up: false, jump: false, fire: true, special: false };
  const h = game.hero;
  if (h.dead) {
    m.rise = 0; // on repartira du point de reprise
    return done(m, act);
  }

  const { world } = game;
  const cx = h.x + h.w / 2;
  const feet = h.y + h.h;
  const boss = game.boss;
  const standing = Boolean(boss && boss.state !== 'ejecting' && boss.state !== 'gone');
  const fighting = standing && boss.active;
  const exit = game.props.find((p) => p.kind === 'sortie');
  const target = standing ? boss : exit;
  const goal = target ? target.x + target.w / 2 : cx + 100;
  const toward = Math.sign(goal - cx) || 1;
  const dist = Math.abs(goal - cx);
  // Un nouveau saut n'est possible que bouton relâché : un joueur qui tient la touche ne ressaute pas.
  const free = () => m.hold === 0 && !m.jumped;

  // Face au boss : depuis combien de pas n'encaisse-t-il plus rien ? À quelle hauteur était-on à son réveil ?
  if (fighting) {
    if (m.bossHp !== boss.hp) m.stale = 0;
    m.bossHp = boss.hp;
    m.stale = (m.stale ?? 0) + 1;
    m.arena ??= feet;
  } else {
    m.stale = 0;
    m.arena = undefined;
  }

  // Remonter : au fond d'un trou sous son but (cratère, galerie, puits ; sous un boss endormi aussi, qu'on ne réveille
  // pas de si bas), ou, face à un boss qu'on ne touche plus, sous terre en contrebas de lui ou au fond d'un trou de l'arène.
  const below = Boolean(target) && feet > target.y + target.h + 2; // même un cratère d'une tuile
  const roof = ceiling(world, h);
  const roofed = roof.gap < 3 * TILE; // un plafond bas : galerie, tunnel, puits
  if (!m.rise && !m.rest && below) {
    if (!fighting && dist < Math.max(20, target.w / 2)) rise(m, 'but');
    else if (fighting && m.stale > 300 && (roofed ? dist < 8 * TILE || m.since > 240 : feet > m.arena + 2 * TILE)) rise(m, 'combat');
  }
  if (m.rise > 0) {
    const risen = m.why === 'but' ? !below || fighting || dist > 30 * TILE // arrivé, boss réveillé, ou parti trop loin
      : m.why === 'combat' ? !fighting || (!roofed && feet <= m.arena + TILE) // revenu à hauteur de l'arène
        : !buried(world, h) && h.onGround && !wallAt(world, h, m.side); // 'mur' : sorti du puits, à l'air libre
    if (--m.rise === 0 || risen) {
      m.rise = 0;
      m.rest = m.why === 'combat' ? 240 : 0; // face au boss, on lui laisse sa chance avant de recommencer
      m.flip = -(m.lastSide || 1); // s'il faut recommencer, ce sera par l'autre paroi
    }
  }
  if (m.rise > 0) {
    // Une paroi, et une seule : sous le but, `toward` change de signe à chaque pixel et l'on ne s'accrocherait à rien.
    if (!m.side) m.side = pickSide(world, h, m.flip || toward);
    m.lastSide = m.side;
    m.flip = 0;
    act.fire = false; // on grimpe sans abîmer la paroi
    // Du sol, la sortie juste au-dessus, à portée d'un saut, sans plafond entre les deux : on saute droit dessus.
    const lift = h.y - (target ? target.y + target.h : h.y) + 4;
    if (h.onGround && target === exit && dist < target.w / 2 && lift < h.def.saut * TILE * 0.9 && roof.gap > lift && free()) {
      m.hold = JUMP;
      m.straight = JUMP + 8;
    }
    if (m.straight > 0) {
      act.jump = m.hold > 0;
      return done(m, act);
    }
    const atWall = wallAt(world, h, m.side);
    if (atWall && roof.tile?.pv > 0 && roof.gap <= upReach(h.def) && (h.onGround || h.cooldown <= 0)) {
      // Le tir atteint le plafond : on lâche tout et on tire vers le haut (en l'air, le temps d'un tir).
      m.hold = 0;
      return done(m, { ...act, up: true, fire: true });
    }
    act[m.side > 0 ? 'right' : 'left'] = true;
    // Du fond : un vrai saut, tenu jusqu'au bout. En l'air contre la paroi : de petits bonds répétés.
    if (h.onGround && free()) m.hold = JUMP;
    else if (!h.onGround && atWall && free() && m.t % 9 === 0) m.hold = HOP;
    act.jump = m.hold > 0;
    return done(m, act);
  }

  // Avance-t-on vers le but ? Sinon, on recule un instant et on tente la spéciale ;
  // calé sous terre contre un mur qui ne se creuse pas, on remonte.
  const key = fighting ? 'combat' : standing ? 'boss' : 'sortie';
  if (m.key !== key || m.best === undefined || dist < m.best - 4) {
    m.best = dist;
    m.since = 0;
    m.key = key;
  } else if (++m.since > 240 && !fighting) {
    m.since = 0;
    m.best = dist + 40;
    const wall = world.at(Math.floor((cx + toward * (h.w / 2 + 3)) / TILE), Math.floor((h.y + h.h / 2) / TILE));
    if (buried(world, h) && wall?.pv === 0) rise(m, 'mur');
    else {
      m.back = 45;
      act.special = true;
    }
  }

  // Face au boss : s'il n'encaisse plus rien depuis un moment, on change d'angle (on s'approche, on saute).
  if (fighting && m.stale > 240 && m.stale % 120 === 0) act.special = true;
  const pressing = fighting && m.stale > 240;

  const dir = m.back > 0 ? -toward : toward;
  const holdPosition = fighting && !pressing && dist < 80 && h.facing === toward; // à bonne distance du boss : on tient et on tire
  if (!holdPosition) act[dir > 0 ? 'right' : 'left'] = true;

  // Saut : trou devant les pieds, mur, ou accroché à une paroi (on grimpe par bonds répétés).
  const tx = Math.floor((cx + dir * 10) / TILE);
  const ty = Math.floor((feet - 1) / TILE);
  let gap = true;
  for (let k = 1; k <= 4; k++) if (world.solid(tx, ty + k)) gap = false;
  const blocked = wallAt(world, h, dir);
  if (h.onGround && (gap || blocked) && free()) m.hold = JUMP;
  else if (!h.onGround && blocked && free() && m.t % 9 === 0) m.hold = HOP;
  if (pressing && h.onGround && free() && m.t % 50 === 0) m.hold = JUMP; // passe par-dessus les gardes du corps
  act.jump = m.hold > 0;

  if (m.t % 400 === 200) act.special = true;
  return done(m, act);
}

/** Commence à remonter ; `why` dit quand s'arrêter. */
function rise(m, why) {
  m.rise = RISE;
  m.why = why;
  m.side = 0;
}

/**
 * La paroi où grimper : celle qu'on touche (de préférence du côté `prefer`), sinon la plus proche à hauteur du torse,
 * à vingt-quatre tuiles au plus ; à défaut, le côté `prefer`.
 */
function pickSide(world, h, prefer) {
  if (wallAt(world, h, prefer)) return prefer;
  if (wallAt(world, h, -prefer)) return -prefer;
  const ty = Math.floor((h.y + h.h / 2) / TILE);
  const col = Math.floor((h.x + h.w / 2) / TILE);
  for (let k = 1; k <= 24; k++) {
    if (world.solid(col + prefer * k, ty)) return prefer;
    if (world.solid(col - prefer * k, ty)) return -prefer;
  }
  return prefer;
}

/** Retient si le saut était tenu : il faudra le relâcher avant le prochain. */
function done(m, act) {
  m.jumped = act.jump;
  return act;
}

/** Sous terre : une tuile pleine dans les quatorze rangées au-dessus de la tête. */
function buried(world, h) {
  return ceiling(world, h).gap < 14 * TILE;
}

/**
 * Le plafond au-dessus du héros, dans la colonne où part son tir vers le haut :
 * `gap` = pixels entre le haut de la tête et le dessous de la première tuile pleine, `tile` = sa fiche (null : ciel ouvert).
 */
export function ceiling(world, h) {
  const col = Math.floor((h.x + h.w / 2) / TILE);
  const top = Math.floor((h.y - 0.001) / TILE);
  for (let ty = top; ty >= Math.max(0, top - 40); ty--) {
    if (world.solid(col, ty)) return { gap: h.y - (ty + 1) * TILE, tile: world.at(col, ty) };
  }
  return { gap: Infinity, tile: null };
}

/** Jusqu'où monte un tir à la verticale : la portée, ou le sommet de la cloche si l'arme retombe. */
export function upReach(def) {
  const w = def.arme;
  if (!w) return 0;
  const apex = w.gravite > 0 ? (w.vitesse * w.vitesse) / (2 * w.gravite) : Infinity;
  return Math.min(w.portee, apex) * 0.9;
}

/** Fait jouer le robot jusqu'à la victoire ou l'épuisement du budget de pas. */
export function runBot(game, maxSteps) {
  const memory = {};
  let steps = 0;
  while (game.status === 'playing' && steps < maxSteps) {
    game.step(botActions(game, memory));
    game.events.length = 0;
    steps++;
  }
  return steps;
}

/** Carte en caractères avec la position du héros (@), pour comprendre où le robot a calé. */
export function dumpMap(game) {
  const { world, hero } = game;
  const hx = Math.floor((hero.x + hero.w / 2) / TILE);
  const hy = Math.floor((hero.y + hero.h / 2) / TILE);
  const rows = [];
  for (let ty = 0; ty < world.h; ty++) {
    let row = '';
    for (let tx = 0; tx < world.w; tx++) {
      const def = world.at(tx, ty);
      row += tx === hx && ty === hy ? '@' : def ? def.symbole : '.';
    }
    rows.push(row);
  }
  return rows.join('\n');
}
