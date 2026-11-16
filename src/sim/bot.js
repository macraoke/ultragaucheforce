// Un robot simplet qui joue à notre place : il sert de test « anti-blocage ».
// S'il arrive au bout d'un niveau, un humain y arrivera aussi.
//
// Stratégie : viser le boss tant qu'il est debout, sinon la sortie ; tirer sans arrêt ;
// sauter devant un trou, un mur, ou quand il s'y accroche ; reculer un peu s'il n'avance plus.
// Tombé sous terre, il creuse droit devant lui ; arrivé sous son but, il perce le plafond et remonte.

import { TILE } from './world.js';
import { wallAt } from './physics.js';

/**
 * @param {import('./game.js').Game} game
 * @param {object} memory  objet vide au départ, conservé d'un pas à l'autre
 */
export function botActions(game, memory) {
  const m = memory;
  m.t = (m.t ?? 0) + 1;
  m.hold = Math.max(0, (m.hold ?? 0) - 1);
  m.back = Math.max(0, (m.back ?? 0) - 1);
  const act = { left: false, right: false, jump: false, fire: true, special: false };
  const h = game.hero;
  if (h.dead) return act;

  const cx = h.x + h.w / 2;
  const boss = game.boss;
  const fighting = Boolean(boss && boss.active && boss.state !== 'ejecting' && boss.state !== 'gone');
  const exit = game.props.find((p) => p.kind === 'sortie');
  const goal = fighting ? boss.x + boss.w / 2 : exit ? exit.x + exit.w / 2 : cx + 100;
  const toward = Math.sign(goal - cx) || 1;
  const dist = Math.abs(goal - cx);

  // Sous la sortie (au fond d'un cratère, d'une galerie), ou calé sous terre contre un mur qui ne se creuse pas :
  // on perce au-dessus de soi, puis on grimpe par bonds.
  const under = !fighting && exit && dist < 20 && h.y + h.h > exit.y + exit.h + 2; // même un cratère d'une tuile
  m.climb = Math.max(0, (m.climb ?? 0) - 1);
  if (m.climb > 0 || under) {
    const phase = m.t % 90;
    const col = Math.floor(cx / TILE);
    const top = Math.floor(h.y / TILE);
    let roof = false; // reste-t-il quelque chose à percer au-dessus de la tête ?
    for (let k = 1; k <= 30 && !roof; k++) roof = game.world.solid(col, top - k);
    if (roof && phase < 40) return { ...act, up: true }; // quarante pas à tirer vers le haut, sans bouger
    act.fire = false; // puis on grimpe sans abîmer la paroi ; puits ouvert jusqu'au ciel : on ne s'arrête plus
    act[toward > 0 ? 'right' : 'left'] = true;
    // Du fond : un vrai saut, tenu jusqu'au bout. En l'air contre la paroi : de petits bonds répétés.
    if (h.onGround && m.hold === 0) m.hold = 22;
    else if (!h.onGround && wallAt(game.world, h, toward) && m.hold === 0 && m.t % 9 === 0) m.hold = 6;
    act.jump = m.hold > 0;
    return act;
  }

  // Avance-t-on ? Sinon, on recule un instant et on tente la spéciale.
  if (m.fighting !== fighting || m.best === undefined || dist < m.best - 4) {
    m.best = dist;
    m.since = 0;
    m.fighting = fighting;
  } else if (++m.since > 240 && !fighting) {
    m.since = 0;
    m.best = dist + 40;
    const tx = Math.floor(cx / TILE);
    const head = Math.floor(h.y / TILE);
    let roofed = false; // un plafond au-dessus de la tête : on est sous terre
    for (let k = 1; k <= 14; k++) if (game.world.solid(tx, head - k)) roofed = true;
    const wall = game.world.at(Math.floor((cx + toward * (h.w / 2 + 3)) / TILE), Math.floor((h.y + h.h / 2) / TILE));
    if (roofed && wall?.pv === 0) m.climb = 270; // et devant, un mur qui ne se creuse pas : on remonte
    else {
      m.back = 45;
      act.special = true;
    }
  }

  // Face au boss : s'il n'encaisse plus rien depuis un moment, on change d'angle (on s'approche, on saute).
  if (fighting) {
    if (m.bossHp !== boss.hp) m.stale = 0;
    m.bossHp = boss.hp;
    m.stale = (m.stale ?? 0) + 1;
    if (m.stale > 240 && m.stale % 120 === 0) act.special = true;
  }
  const pressing = fighting && m.stale > 240;

  const dir = m.back > 0 ? -toward : toward;
  const holdPosition = fighting && !pressing && dist < 80 && h.facing === toward; // à bonne distance du boss : on tient et on tire
  if (!holdPosition) act[dir > 0 ? 'right' : 'left'] = true;

  // Saut : trou devant les pieds, mur, ou accroché à une paroi (on grimpe par bonds répétés).
  const tx = Math.floor((cx + dir * 10) / TILE);
  const ty = Math.floor((h.y + h.h - 1) / TILE);
  let gap = true;
  for (let k = 1; k <= 4; k++) if (game.world.solid(tx, ty + k)) gap = false;
  const blocked = wallAt(game.world, h, dir);
  if (h.onGround && (gap || blocked) && m.hold === 0) m.hold = 22;
  else if (!h.onGround && blocked && m.hold === 0 && m.t % 9 === 0) m.hold = 6;
  if (pressing && h.onGround && m.hold === 0 && m.t % 50 === 0) m.hold = 22; // passe par-dessus les gardes du corps
  act.jump = m.hold > 0;

  if (m.t % 400 === 200) act.special = true;
  return act;
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
