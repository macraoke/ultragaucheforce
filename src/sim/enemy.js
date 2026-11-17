// Les automates de l'ordre : UNE seule mise en œuvre, entièrement pilotée par la fiche
// (déplacement, réaction, vue, bouclier, arme, répliques, sommations, ligne).
// États : sleep → patrol ⇄ alert, stunned (étourdi), done (en grève, en panne ou cassée : décor inoffensif).
//
// Ce que le client peut dessiner en plus du personnage :
//   flash     secondes de silhouette blanche : un coup qui porte (hitDir : son sens, -1 ou 1)
//   parry     secondes pendant lesquelles un coup arrêté par le bouclier ou la ligne se voit
//   daze      pendant l'étourdissement : 'choc' (onde, bousculade) ou 'gaz' (ses propres lacrymogènes)
//   blocking  la ligne tient : infranchissable pour le héros et les unités au sol d'en face, sur LINE_REACH pixels
//             au-dessus d'elle (une ligne de nasse : sur son étage, KETTLE_FLOOR) ; les tirs qui la touchent s'y
//             écrasent, les grenades en cloche passent par-dessus
//   push      une ligne (`ligne.vie`) que la manif pousse : les points de vie qu'elle perd par seconde (0 sinon) ;
//             `hp` est sa vie, sur `def.ligne.vie`
//   aim       { x, y, t } pendant une visée (LBD) : le tir part vers ce point dans t secondes
//   jet       { x, y, length, dir } pendant un jet de canon à eau
//   beam      { x, y, w, lit } faisceau du projecteur : centré en x, posé au sol en y ; lit = le héros est dedans
//   rush      { phase: 'sommation' | 'ruee' | 'pause' } pendant une charge
//   rope      { x, y } tant qu'il descend à la corde depuis ce point
//   film      { x, y } le feu de poubelle qu'une équipe télé est venue filmer (elle ne s'occupe pas du héros)

import { TILE } from './world.js';
import { moveBox, wallAt, overlap, hitsSolid, holds } from './physics.js';
import { WEAPONS } from './behaviors.js';

const GRAVITY = 900;
const MAX_FALL = 500;
const WAKE_X = 300; // distances FIXES de réveil : jamais la taille de l'écran,
const WAKE_Y = 170; // pour que la partie soit la même sur tous les appareils
const FRAME_RANGE = 70; // portée du cadrage du drone
export const LINE_REACH = 112; // hauteur du barrage au-dessus d'une ligne qui tient : aucun saut ne passe
export const KETTLE_FLOOR = 4 * TILE; // une nasse ne tient que l'étage de ses lignes : de leur sol à un étage au-dessus
const PUSH_RANGE = 72; // la manif pousse une ligne quand le héros arrive à cette distance
const PASS = 200; // une moto dépasse le héros d'autant avant de faire demi-tour
const SOMMATION = 1; // secondes par sommation
const WIND_UP = 0.5; // élan avant une charge sans sommation
const AIM_LOCK = 0.25; // la visée se fige juste avant le tir : on peut l'esquiver
const ROPE_SPEED = 140; // descente à la corde, pixels par seconde
const SPOT_TIME = 1.5; // secondes passées dans le faisceau avant une dépose de renforts
const FILM_DISTANCE = 34; // l'équipe télé se plante à cette distance du feu qu'elle filme
const FILM_PANIC = 0.3; // filmer un feu fait monter la panique, mais doucement : cette part de `panique`
const ARREST_PAUSE = 2.5; // secondes entre deux interpellations d'une même unité

/** Une ligne (`ligne.vie` sur sa fiche) : un obstacle qui a une vie, qu'on entame et qu'on pousse. */
export const isLine = (def) => def.ligne?.vie > 0;

export function createEnemy(def, cx, feetY, extra = {}) {
  return {
    x: cx - def.largeur / 2, y: feetY - def.hauteur, w: def.largeur, h: def.hauteur, vx: 0, vy: 0, facing: -1,
    def, state: 'sleep', hp: isLine(def) ? def.ligne.vie : def.pv, animTime: 0, flash: 0, hitDir: 0, parry: 0, daze: null,
    arrest: 0, bubble: null, home: { x: cx - def.largeur / 2, y: feetY - def.hauteur }, cooldown: 0.6, stun: 0, kick: 0,
    lost: 0, talk: 0, framing: false, onGround: false, hitX: 0, hitY: 0,
    blocking: isLine(def), push: 0, aim: null, jet: null, beam: null, rush: null, rope: null,
    warned: false, known: false, turn: 0, spot: 0, drops: 0, ...extra,
  };
}

/** Combien de secondes une bulle reste lisible : 0,3 s par mot, jamais moins que `t` (12 mots : environ 3,5 s). */
export const bubbleTime = (text, t = 2) => Math.max(t, 0.3 * text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length);

const say = (e, text, t = 2) => {
  e.bubble = { text, t: bubbleTime(text, t) };
};

/** Ni recul ni étourdissement pour une ligne qui tient ou un véhicule. */
export const sturdy = (e) => e.blocking || e.def.deplacement === 'vehicule';

/**
 * Une ligne perd de la vie : sous les coups de la manif (tracts, souffle, spéciales) ou poussée par elle.
 * À zéro, elle cède et s'ouvre. Rien d'autre ne la fait céder : ni un nombre atteint, ni les coups de son propre camp.
 */
export function wearLine(game, e, amount) {
  if (!(amount > 0) || e.state === 'done') return;
  e.hp -= amount;
  if (e.hp > 0) return;
  e.hp = 0;
  standDown(e);
  e.push = 0;
  e.overrun = true; // cassée : le client l'ouvre en grand
  game.stats.overrun++;
  if (e.def.camp === 'ordre') game.stats.overrunOrder++;
  game.emit('overrun', { x: e.x + e.w / 2, y: e.y, feet: e.y + e.h, crowd: game.crowd });
  game.sfx('debordement', e.x);
  game.discover('ennemi', e.def.id);
}

/** La ligne se range (débordée, ou nasse levée) : un décor inoffensif de plus, sans passer par la panne. */
export function standDown(e) {
  Object.assign(e, { state: 'done', blocking: false, kettle: 0, kick: 0, framing: false, aim: null, rush: null, rope: null });
}

function fall(game, e, dt) {
  const x0 = e.x;
  e.vy = Math.min(e.vy + GRAVITY * dt, MAX_FALL);
  moveBox(game.world, e, dt);
  e.onGround = e.hitY > 0;
  if (e.hitY) e.vy = 0;
  stopAtLines(game, e, x0);
}

/**
 * Le haut du barrage d'une ligne qui tient : LINE_REACH pixels au-dessus d'elle. Une ligne de nasse ne barre que
 * son étage (KETTLE_FLOOR depuis son sol) : à l'étage au-dessus, on passe.
 */
export const barrierTop = (l) => (l.kettle ? l.y + l.h - KETTLE_FLOOR : l.y - LINE_REACH);

/** La zone qu'une ligne qui tient barre : sa largeur, de son pied au haut de son barrage. */
const barred = (l, y, h) => y < l.y + l.h && y + h > barrierTop(l);

/**
 * Une ligne qui tient arrête les unités au sol d'en face comme le héros (voir `Game.blockHero`) : charge, ruée,
 * marche, recul. Une unité qui arrive d'un côté y reste, même lancée à toute vitesse. Une qui la chevauchait déjà
 * (descendue à la corde) en sort du côté de son centre ; rattrapée par une ligne de nasse qui se referme, elle reste
 * dehors, du côté opposé au héros, ou sur place : jamais poussée vers le centre de la nasse. Ce qui vole passe au-dessus.
 */
function stopAtLines(game, e, x0) {
  if (e.state === 'done' || e.blocking || e.def.deplacement === 'vol') return;
  for (const l of game.lines) {
    if (l === e || !holds(l) || !barred(l, e.y, e.h)) continue;
    if (Math.max(x0, e.x) + e.w <= l.x || Math.min(x0, e.x) >= l.x + l.w) continue; // ni dessus, ni passée au travers
    const from = x0 + e.w <= l.x + 0.01 ? -1 : x0 >= l.x + l.w - 0.01 ? 1 : 0;
    const centre = e.x + e.w / 2 < l.x + l.w / 2 ? -1 : 1;
    const side = (dir) => (dir < 0 ? l.x - e.w : l.x + l.w);
    // `l.kettle` : le côté de la nasse où se tient la ligne, donc le dehors.
    const tries = from ? [side(from), x0] : l.kettle ? [side(l.kettle)] : [side(centre), side(-centre)];
    const x = tries.find((at) => !hitsSolid(game.world, at, e.y, e.w, e.h));
    if (x !== undefined) e.x = x;
  }
}

/**
 * La manif pousse une ligne quand le héros arrive dessus : à moins de PUSH_RANGE, à son niveau ou plus haut qu'elle
 * tant que sa barrière le retient (une ligne enfoncée dans son cratère, le héros au bord), jamais depuis le dessous,
 * et sans rien de plein entre la poitrine du héros et le haut de la ligne : ni un sol, ni un plafond, ni un mur.
 */
function pushes(game, e, dx) {
  const { hero, world } = game;
  const feet = hero.y + hero.h;
  if (hero.dead || Math.abs(dx) >= PUSH_RANGE || feet > e.y + e.h + TILE || feet < barrierTop(e)) return false;
  const ox = hero.x + hero.w / 2;
  const oy = hero.y + hero.h / 2;
  const tx = e.x + e.w / 2;
  const ty = e.y;
  const steps = Math.ceil(Math.hypot(tx - ox, ty - oy) / 4);
  for (let i = 1; i < steps; i++) {
    if (world.solid(Math.floor((ox + ((tx - ox) * i) / steps) / TILE), Math.floor((oy + ((ty - oy) * i) / steps) / TILE))) return false;
  }
  return true;
}

/** Une ligne qui tient, collée à l'unité du côté `dir` : un mur, pour elle aussi. */
const lineAt = (game, e, dir) => game.lines.some((l) => l !== e && holds(l) && barred(l, e.y, e.h)
  && Math.abs(dir > 0 ? l.x - (e.x + e.w) : e.x - (l.x + l.w)) <= 1);

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

const blockedAhead = (game, e) => e.onGround && (wallAt(game.world, e, e.facing) || !groundAhead(game.world, e) || lineAt(game, e, e.facing));

export function updateEnemy(game, e, dt) {
  const { world, hero } = game;
  const { def } = e;
  const flying = def.deplacement === 'vol';
  e.animTime += dt;
  e.flash = Math.max(0, e.flash - dt);
  e.parry = Math.max(0, e.parry - dt);
  e.arrest = Math.max(0, e.arrest - dt);
  if (e.bubble && (e.bubble.t -= dt) <= 0) e.bubble = null;
  e.jet = null; // recalculés à chaque pas
  e.beam = null;
  const dx = hero.x + hero.w / 2 - (e.x + e.w / 2);
  const dy = hero.y + hero.h / 2 - (e.y + e.h / 2);

  if (e.state === 'done') {
    Object.assign(e, { vx: 0, blocking: false, aim: null, rush: null, rope: null });
    return fall(game, e, dt); // même un drone en panne finit par terre
  }

  // Une ligne qui tient (`ligne.vie`, ou une nasse) : infranchissable.
  // Une ligne à vie : quand le héros arrive dessus, la manif pousse, d'autant plus fort qu'elle est nombreuse.
  e.blocking = isLine(def) || Boolean(e.kettle);
  e.push = isLine(def) && pushes(game, e, dx) ? (def.ligne.poussee * game.crowd) / 100 : 0;
  if (e.push > 0) {
    wearLine(game, e, e.push * dt);
    if (e.state === 'done') return;
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
    else return flying ? undefined : fall(game, e, dt);
  }
  if (e.state === 'stunned') {
    e.aim = null;
    e.rush = null;
    e.stun -= dt;
    if (e.stun <= 0) {
      e.state = 'patrol';
      e.daze = null;
    }
    e.vx = e.kick;
    e.kick *= 0.85;
    if (flying) e.x += e.vx * dt;
    else fall(game, e, dt);
    return;
  }

  // Le boss vaincu, l'ordre cesse le feu : chacun reste où il est, sans attaquer ni rien dire de plus.
  if (game.truce) return standBy(game, e, dt);

  // Une équipe télé venue pour un feu de poubelle : c'est lui qu'elle filme, pas la manif.
  if (e.film) return film(game, e, dt);

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
      vx = ride(game, e, dx, dt);
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
        if (blockedAhead(game, e)) e.facing = -e.facing;
        vx = e.facing * def.vitesse;
      }
    } else if (alert && react !== 'rien') {
      e.facing = Math.sign(dx) || e.facing;
    }
    e.vx = vx + e.kick;
    e.kick = Math.abs(e.kick) < 1 ? 0 : e.kick * 0.85;
    fall(game, e, dt);
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

  // Une unité qui « interpelle » (la BAC) et atteint le cortège emmène quelques manifestants, puis souffle un peu.
  if (def.interpelle > 0 && e.arrest <= 0 && game.cortege.some((m) => m.x > e.x && m.x < e.x + e.w && m.y > e.y && m.y - 16 < e.y + e.h)) {
    e.arrest = ARREST_PAUSE;
    game.loseCrowd(def.interpelle, 'interpelle', { x: e.x + e.w / 2, y: e.y });
  }

  const rushing = e.rush?.phase === 'ruee';
  const touch = rushing ? Math.max(1, def.contact) : def.contact;
  if (touch > 0 && !hero.dead && hero.invuln <= 0 && overlap(e, hero)) {
    game.hurtHero(touch, { x: e.x + e.w / 2, kind: rushing ? 'charge' : 'contact' });
    if (def.deplacement === 'moto' || sturdy(e)) return; // la moto file, la ligne et le véhicule ne reculent pas
    // Après avoir bousculé le héros, l'automate recule et reste sonné : on a le temps de réagir.
    e.kick = Math.sign(e.x + e.w / 2 - (hero.x + hero.w / 2) || 1) * 160;
    e.state = 'stunned';
    e.stun = Math.max(e.stun, 1.6);
    e.daze = 'choc';
  }
}

/**
 * Cessez-le-feu : ni tir, ni visée, ni jet, ni charge, ni contact, ni interpellation, ni dépose de renforts, ni réplique.
 * L'unité reste sur place ; au sol, elle finit son recul et tombe si le sol se dérobe.
 */
function standBy(game, e, dt) {
  Object.assign(e, { state: 'patrol', aim: null, rush: null, framing: false }); // plus en alerte : ni « ! », ni caméra qui tourne
  if (e.def.deplacement === 'vol') return;
  e.vx = e.kick;
  e.kick = Math.abs(e.kick) < 1 ? 0 : e.kick * 0.85;
  fall(game, e, dt);
}

/**
 * L'équipe télé va jusqu'au feu, se plante devant et le cadre. Tant qu'elle filme, la panique monte doucement.
 * Ce qu'elle dit reste ses répliques : de vrais bandeaux.
 */
function film(game, e, dt) {
  const { def, film: fire } = e;
  e.state = 'alert';
  e.aim = null;
  if (!e.known) {
    e.known = true;
    game.discover('ennemi', def.id);
  }
  if (def.deplacement === 'vol') {
    // Un drone se place au-dessus des flammes.
    const tx = fire.x - e.w / 2;
    const ty = fire.y - 60;
    const gap = Math.hypot(tx - e.x, ty - e.y);
    const reach = Math.min(gap, def.vitesse * 1.5 * dt);
    if (gap > 0.01) {
      e.x += ((tx - e.x) / gap) * reach;
      e.y += ((ty - e.y) / gap) * reach;
    }
    e.facing = Math.sign(fire.x - (e.x + e.w / 2)) || e.facing;
    e.framing = gap < 12;
  } else {
    const gap = fire.x - (e.x + e.w / 2);
    const far = Math.abs(gap) > FILM_DISTANCE;
    e.facing = Math.sign(gap) || e.facing;
    if (far && e.onGround && wallAt(game.world, e, e.facing)) e.vy = -260; // un petit bond par-dessus l'obstacle
    e.vx = (far ? e.facing * def.vitesse * 1.6 : 0) + e.kick;
    e.kick = Math.abs(e.kick) < 1 ? 0 : e.kick * 0.85;
    fall(game, e, dt);
    e.framing = !far;
  }
  if (!e.framing) return;
  game.addPanic(def.panique * FILM_PANIC * dt);
  e.talk -= dt;
  if (e.talk <= 0 && def.replique.length) {
    say(e, game.rng.pick(def.replique));
    e.talk = 4 + game.rng.next() * 3;
  } else if (!e.bubble) say(e, '● REC', 1.2);
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
function ride(game, e, dx, dt) {
  e.turn = Math.max(0, e.turn - dt);
  if (blockedAhead(game, e)) {
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
    if (blockedAhead(game, e)) {
      // Contre un mur ou une ligne qui tient, pas de ruée ni son bruit : il attend sa pause et réessaie.
      Object.assign(r, { phase: 'pause', t: c.pause });
      return 0;
    }
    Object.assign(r, { phase: 'ruee', dir: e.facing, left: c.distance });
    game.sfx('charge', e.x);
  }
  if (r.phase === 'ruee') {
    e.facing = r.dir;
    r.left -= c.vitesse * dt;
    if (r.left <= 0 || blockedAhead(game, e)) {
      Object.assign(r, { phase: 'pause', t: c.pause });
      return 0;
    }
    // La charge traverse le cortège : une part de la manif se disperse (une fois par charge).
    if (!r.hit && game.cortege.some((m) => m.x > e.x && m.x < e.x + e.w && m.y > e.y && m.y - 16 < e.y + e.h)) {
      r.hit = true;
      game.disperse(c.disperse / 100, 'charge', { x: e.x + e.w / 2, y: e.y });
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
