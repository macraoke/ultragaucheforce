// Les automates de l'ordre : UNE seule mise en œuvre, entièrement pilotée par la fiche
// (déplacement, réaction, vue, bouclier, arme, répliques, sommations, débordement).
// États : sleep → patrol ⇄ alert, stunned (étourdi), done (en grève, en panne ou débordé : décor inoffensif).
//
// Ce que le client peut dessiner en plus du personnage :
//   blocking  la ligne tient : infranchissable pour le héros, sur LINE_REACH pixels au-dessus d'elle
//   aim       { x, y, t } pendant une visée (LBD) : le tir part vers ce point dans t secondes
//   jet       { x, y, length, dir } pendant un jet de canon à eau
//   beam      { x, y, w, lit } faisceau du projecteur : centré en x, posé au sol en y ; lit = le héros est dedans
//   rush      { phase: 'sommation' | 'ruee' | 'pause' } pendant une charge
//   rope      { x, y } tant qu'il descend à la corde depuis ce point

import { TILE } from './world.js';
import { moveBox, wallAt, overlap, hitsSolid } from './physics.js';
import { WEAPONS } from './behaviors.js';

const GRAVITY = 900;
const MAX_FALL = 500;
const WAKE_X = 300; // distances FIXES de réveil : jamais la taille de l'écran,
const WAKE_Y = 170; // pour que la partie soit la même sur tous les appareils
const FRAME_RANGE = 70; // portée du cadrage du drone
export const LINE_REACH = 112; // hauteur du barrage au-dessus d'une ligne qui tient : aucun saut ne passe
const OVERRUN_RANGE = 72; // une ligne cède quand la manif, assez nombreuse, arrive à cette distance
const PASS = 200; // une moto dépasse le héros d'autant avant de faire demi-tour
const SOMMATION = 1; // secondes par sommation
const WIND_UP = 0.5; // élan avant une charge sans sommation
const AIM_LOCK = 0.25; // la visée se fige juste avant le tir : on peut l'esquiver
const ROPE_SPEED = 140; // descente à la corde, pixels par seconde
const SPOT_TIME = 1.5; // secondes passées dans le faisceau avant une dépose de renforts

export function createEnemy(def, cx, feetY, extra = {}) {
  return {
    x: cx - def.largeur / 2, y: feetY - def.hauteur, w: def.largeur, h: def.hauteur, vx: 0, vy: 0, facing: -1,
    def, state: 'sleep', hp: def.pv, animTime: 0, flash: 0, bubble: null,
    home: { x: cx - def.largeur / 2, y: feetY - def.hauteur }, cooldown: 0.6, stun: 0, kick: 0, lost: 0, talk: 0,
    framing: false, onGround: false, hitX: 0, hitY: 0,
    blocking: def.debordement > 0, aim: null, jet: null, beam: null, rush: null, rope: null,
    warned: false, known: false, turn: 0, nag: 0, spot: 0, drops: 0, ...extra,
  };
}

const say = (e, text, t = 2) => {
  e.bubble = { text, t };
};

/** Ni recul ni étourdissement pour une ligne qui tient ou un véhicule. */
export const sturdy = (e) => e.blocking || e.def.deplacement === 'vehicule';

/** La ligne se range (débordée, ou nasse levée) : un décor inoffensif de plus, sans passer par la panne. */
export function standDown(e) {
  Object.assign(e, { state: 'done', blocking: false, kettle: 0, kick: 0, framing: false, aim: null, rush: null, rope: null });
}

function fall(world, e, dt) {
  e.vy = Math.min(e.vy + GRAVITY * dt, MAX_FALL);
  moveBox(world, e, dt);
  e.onGround = e.hitY > 0;
  if (e.hitY) e.vy = 0;
}

/** Le héros est-il à portée de vue, sans mur entre les deux ? (`tall` : voit aussi loin en hauteur) */
function sees(game, e, dx, dy, tall) {
  if (game.hero.dead) return false;
  const reach = e.def.vue;
  if (Math.abs(dx) > reach || Math.abs(dy) > (tall ? reach : 40)) return false;
  const ox = e.x + e.w / 2;
  const oy = e.y + e.h / 2;
  const steps = Math.ceil(Math.hypot(dx, dy) / 8);
  for (let i = 1; i < steps; i++) {
    if (game.world.solid(Math.floor((ox + (dx * i) / steps) / TILE), Math.floor((oy + (dy * i) / steps) / TILE))) return false;
  }
  return true;
}

const groundAhead = (world, e) =>
  world.solid(Math.floor((e.facing > 0 ? e.x + e.w + 2 : e.x - 2) / TILE), Math.floor((e.y + e.h + 2) / TILE));

const blockedAhead = (world, e) => e.onGround && (wallAt(world, e, e.facing) || !groundAhead(world, e));

export function updateEnemy(game, e, dt) {
  const { world, hero } = game;
  const { def } = e;
  const flying = def.deplacement === 'vol';
  e.animTime += dt;
  e.flash = Math.max(0, e.flash - dt);
  e.nag = Math.max(0, e.nag - dt);
  if (e.bubble && (e.bubble.t -= dt) <= 0) e.bubble = null;
  e.jet = null; // recalculés à chaque pas
  e.beam = null;
  const dx = hero.x + hero.w / 2 - (e.x + e.w / 2);
  const dy = hero.y + hero.h / 2 - (e.y + e.h / 2);

  if (e.state === 'done') {
    Object.assign(e, { vx: 0, blocking: false, aim: null, rush: null, rope: null });
    return fall(world, e, dt); // même un drone en panne finit par terre
  }

  // Une ligne qui tient (débordement, nasse) : insensible et infranchissable.
  // Elle cède quand la manif, assez nombreuse, arrive sur elle.
  e.blocking = def.debordement > 0 || Boolean(e.kettle);
  if (def.debordement > 0 && game.crowd >= def.debordement && Math.abs(dx) < OVERRUN_RANGE && Math.abs(dy) < LINE_REACH) {
    standDown(e);
    game.stats.overrun++;
    if (def.camp === 'ordre') game.stats.overrunOrder++;
    game.emit('overrun', { x: e.x + e.w / 2, y: e.y });
    game.sfx('debordement', e.x);
    game.discover('ennemi', def.id);
    return;
  }
  if (e.rope) {
    // Déposé par l'hélicoptère : il descend tout droit, puis agit comme les autres.
    e.vx = 0;
    e.vy = ROPE_SPEED;
    moveBox(world, e, dt);
    if (e.hitY > 0 || e.y > world.h * TILE) e.rope = null;
    return;
  }
  if (e.state === 'sleep') {
    if (Math.abs(dx) < WAKE_X && Math.abs(dy) < WAKE_Y) e.state = 'patrol';
    else return flying ? undefined : fall(world, e, dt);
  }
  if (e.state === 'stunned') {
    e.aim = null;
    e.rush = null;
    e.stun -= dt;
    if (e.stun <= 0) e.state = 'patrol';
    e.vx = e.kick;
    e.kick *= 0.85;
    if (flying) e.x += e.vx * dt;
    else fall(world, e, dt);
    return;
  }

  // Vue : alerte tant que le héros est visible, retour à la patrouille peu après l'avoir perdu.
  const seen = sees(game, e, dx, dy, flying || def.arme?.vise > 0);
  if (seen || e.kettle) {
    e.lost = 0;
    if (e.state === 'patrol') e.state = 'alert';
  } else if (e.state === 'alert' && (e.lost += dt) > 1.5) {
    e.state = 'patrol';
  }
  const alert = e.state === 'alert';
  const react = def.reaction;
  if (alert && !e.known) {
    e.known = true;
    game.discover('ennemi', def.id);
  }
  e.talk -= dt;
  if (alert && e.talk <= 0 && def.replique.length && !e.rush) {
    say(e, game.rng.pick(def.replique));
    e.talk = 4 + game.rng.next() * 3;
  }

  if (flying) {
    // Drone : survole son poste, ou vient se placer au-dessus du héros.
    let tx = e.home.x + Math.sin(e.animTime * 0.8) * 40;
    let ty = e.home.y + Math.sin(e.animTime * 2) * 4;
    if (alert && react === 'projecteur') {
      tx = hero.x + hero.w / 2 - e.w / 2; // l'hélicoptère suit de haut, sans quitter son altitude
    } else if (alert && (react === 'cadre' || react === 'fonce')) {
      tx = hero.x + hero.w / 2 - e.w / 2;
      ty = react === 'cadre' ? hero.y - 44 : hero.y;
    }
    const gap = Math.hypot(tx - e.x, ty - e.y);
    const reach = Math.min(gap, def.vitesse * (alert ? 1.5 : 1) * dt);
    if (gap > 0.01) {
      e.x += ((tx - e.x) / gap) * reach;
      e.y += ((ty - e.y) / gap) * reach;
    }
    if (alert) e.facing = Math.sign(dx) || e.facing;
    if (react === 'projecteur') spotlight(game, e, dt);
  } else {
    let vx = 0;
    const move = def.deplacement;
    if (e.blocking) {
      vx = holdLine(game, e, dx);
    } else if (move === 'moto') {
      vx = ride(world, e, dx, dt);
    } else if (react === 'charge' && (alert || e.rush)) {
      vx = charge(game, e, dt, dx, alert);
    } else if (move === 'marche' || move === 'vehicule') {
      const heavy = move === 'vehicule';
      if (alert && react === 'tire') {
        e.facing = Math.sign(dx) || e.facing; // s'arrête et fait face
      } else if (alert && react === 'fonce') {
        e.facing = Math.sign(dx) || e.facing;
        vx = e.facing * def.vitesse * (heavy ? 1 : 2.2); // un véhicule avance à son pas et pousse
        if (!heavy && e.onGround && wallAt(world, e, e.facing)) e.vy = -260; // petit bond par-dessus l'obstacle
      } else {
        if (blockedAhead(world, e)) e.facing = -e.facing;
        vx = e.facing * def.vitesse;
      }
    } else if (alert && react !== 'rien') {
      e.facing = Math.sign(dx) || e.facing;
    }
    e.vx = vx + e.kick;
    e.kick = Math.abs(e.kick) < 1 ? 0 : e.kick * 0.85;
    fall(world, e, dt);
  }

  // Le drone de PANIQUE TV « cadre » le héros : la panique monte tant qu'il le tient dans le champ.
  e.framing = alert && react === 'cadre' && seen && Math.abs(dx) < FRAME_RANGE;
  if (e.framing) {
    game.addPanic(def.panique * dt);
    if (!e.bubble) say(e, '● REC', 1.2);
  }

  const weapon = def.arme && WEAPONS[def.arme.type];
  const firing = alert && react === 'tire' && Boolean(weapon);
  if (weapon?.update) weapon.update(game, e, def.arme, dt, firing); // arme continue : le jet
  else if (firing) shoot(game, e, dt);
  else e.aim = null;

  const touch = e.rush?.phase === 'ruee' ? Math.max(1, def.contact) : def.contact;
  if (touch > 0 && !hero.dead && hero.invuln <= 0 && overlap(e, hero)) {
    game.hurtHero(touch);
    if (def.deplacement === 'moto' || sturdy(e)) return; // la moto file, la ligne et le véhicule ne reculent pas
    // Après avoir bousculé le héros, l'automate recule et reste sonné : on a le temps de réagir.
    e.kick = Math.sign(e.x + e.w / 2 - (hero.x + hero.w / 2) || 1) * 160;
    e.state = 'stunned';
    e.stun = Math.max(e.stun, 1.6);
  }
}

/** Une ligne qui tient ne recule pas ; dans une nasse, elle se referme lentement autour du repère. */
function holdLine(game, e, dx) {
  const k = game.kettle;
  if (!e.kettle || !k) {
    e.facing = Math.sign(dx) || e.facing;
    return 0;
  }
  e.facing = -e.kettle;
  const goal = k.x + e.kettle * (k.gap + e.rank * (e.w + 2)) - e.w / 2;
  return Math.abs(goal - e.x) > 1 ? Math.sign(goal - e.x) * k.speed : 0;
}

/** Moto : traverse à toute allure, dépasse le héros, fait demi-tour et revient. */
function ride(world, e, dx, dt) {
  e.turn = Math.max(0, e.turn - dt);
  if (blockedAhead(world, e)) {
    e.facing = -e.facing;
    e.turn = 1; // le temps de repartir, sans hésiter au bord
  } else if (e.turn <= 0 && Math.abs(dx) > PASS && Math.sign(dx) !== e.facing) {
    e.facing = Math.sign(dx);
  }
  return e.facing * e.def.vitesse;
}

/**
 * Charge : les sommations, une par une (la première fois seulement), puis une ruée en ligne droite, puis une pause.
 * Renvoie la vitesse horizontale voulue.
 */
function charge(game, e, dt, dx, alert) {
  const { def } = e;
  const c = def.charge;
  if (!e.rush) e.rush = { phase: 'sommation', line: 0, t: e.warned || !def.sommation.length ? WIND_UP : 0, dir: 0, left: 0, hit: false };
  const r = e.rush;
  if (r.phase === 'sommation') {
    if (!alert) {
      e.rush = null; // le héros a filé : on recommencera
      return 0;
    }
    e.facing = Math.sign(dx) || e.facing;
    r.t -= dt;
    if (r.t > 0) return 0;
    if (!e.warned && r.line < def.sommation.length) {
      say(e, def.sommation[r.line++], SOMMATION);
      r.t = SOMMATION;
      return 0;
    }
    e.warned = true;
    Object.assign(r, { phase: 'ruee', dir: e.facing, left: c.distance });
    game.sfx('charge', e.x);
  }
  if (r.phase === 'ruee') {
    e.facing = r.dir;
    r.left -= c.vitesse * dt;
    if (r.left <= 0 || blockedAhead(game.world, e)) {
      Object.assign(r, { phase: 'pause', t: c.pause });
      return 0;
    }
    // La charge traverse le cortège : une part de la manif se disperse (une fois par charge).
    if (!r.hit && game.cortege.some((m) => m.x > e.x && m.x < e.x + e.w && m.y > e.y && m.y - 16 < e.y + e.h)) {
      r.hit = true;
      game.disperse(c.disperse / 100);
    }
    return r.dir * c.vitesse;
  }
  r.t -= dt;
  if (r.t <= 0) e.rush = null;
  return 0;
}

/** Tir : immédiat, ou précédé d'une visée que le joueur voit venir (LBD). */
function shoot(game, e, dt) {
  const { hero } = game;
  const w = e.def.arme;
  const target = () => ({ x: hero.x + hero.w / 2, y: hero.y + hero.h / 2 });
  if (e.aim) {
    e.aim.t -= dt;
    if (e.aim.t > AIM_LOCK) Object.assign(e.aim, target()); // le point suit le héros, puis se fige
    if (e.aim.t > 0) return;
    WEAPONS[w.type].fire(game, e, w, 'ordre', e.aim);
    e.aim = null;
    e.cooldown = 1 / w.cadence;
    return;
  }
  e.cooldown -= dt;
  if (e.cooldown > 0) return;
  if (w.vise > 0 && w.visee > 0) {
    e.aim = { ...target(), t: w.visee };
    game.sfx('visee', e.x);
    return;
  }
  WEAPONS[w.type].fire(game, e, w, 'ordre');
  e.cooldown = 1 / w.cadence;
}

/**
 * Projecteur de l'hélicoptère : un cône de lumière balaie le sol. Tant que le héros est dedans, la panique monte ;
 * s'il y reste, des renforts descendent à la corde près de lui (un nombre de fois borné par la fiche).
 */
function spotlight(game, e, dt) {
  const { world, hero } = game;
  const { faisceau, renfort, panique } = e.def;
  const ox = e.x + e.w / 2;
  const oy = e.y + e.h;
  const x = ox + Math.sin(e.animTime * 1.3) * faisceau.balayage;
  const tx = Math.floor(x / TILE);
  let ty = Math.max(0, Math.floor(oy / TILE));
  while (ty < world.h && !world.solid(tx, ty)) ty++; // le faisceau s'arrête au premier sol
  const y = ty * TILE;
  const depth = y - oy;
  const d = hero.y + hero.h / 2 - oy;
  const lit = !hero.dead && depth > 0 && d > 0 && d <= depth
    && Math.abs(hero.x + hero.w / 2 - (ox + ((x - ox) * d) / depth)) <= (faisceau.largeur / 2) * Math.max(0.25, d / depth) + hero.w / 2;
  e.beam = { x, y, w: faisceau.largeur, lit };
  if (!lit) return;
  game.addPanic(panique * dt);
  e.spot += dt;
  if (e.spot < SPOT_TIME || e.drops >= renfort.max || !game.bundle.ennemis?.[renfort.ennemi]) return;
  e.spot = 0;
  e.drops++;
  const unit = game.bundle.ennemis[renfort.ennemi];
  let dropped = 0;
  for (let i = 0; i < renfort.nombre; i++) {
    // De part et d'autre du héros, sans sortir de la carte ni tomber dans un mur.
    const wanted = hero.x + hero.w / 2 + (i % 2 ? 1 : -1) * (28 + 16 * Math.floor(i / 2));
    const cx = Math.max(TILE, Math.min(world.w * TILE - TILE, wanted));
    if (hitsSolid(world, cx - unit.largeur / 2, oy, unit.largeur, unit.hauteur)) continue;
    game.spawnEnemy(unit.id, cx, oy + unit.hauteur, { state: 'alert', rope: { x: cx, y: oy } });
    dropped++;
  }
  if (dropped) {
    game.emit('drop', { x: ox, y: oy, n: dropped });
    game.sfx('renfort', ox);
  }
}
