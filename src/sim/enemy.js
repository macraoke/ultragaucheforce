// Les automates de l'ordre : UNE seule mise en œuvre, entièrement pilotée par la fiche
// (déplacement, réaction, vue, bouclier, arme, répliques).
// États : sleep → patrol ⇄ alert, stunned (étourdi), done (en grève ou en panne : décor inoffensif).

import { TILE } from './world.js';
import { moveBox, wallAt, overlap } from './physics.js';
import { WEAPONS } from './behaviors.js';

const GRAVITY = 900;
const MAX_FALL = 500;
const WAKE_X = 300; // distances FIXES de réveil : jamais la taille de l'écran,
const WAKE_Y = 170; // pour que la partie soit la même sur tous les appareils
const FRAME_RANGE = 70; // portée du cadrage du drone

export function createEnemy(def, cx, feetY, extra = {}) {
  return {
    x: cx - def.largeur / 2, y: feetY - def.hauteur, w: def.largeur, h: def.hauteur, vx: 0, vy: 0, facing: -1,
    def, state: 'sleep', hp: def.pv, animTime: 0, flash: 0, bubble: null,
    home: { x: cx - def.largeur / 2, y: feetY - def.hauteur }, cooldown: 0.6, stun: 0, kick: 0, lost: 0, talk: 0,
    framing: false, onGround: false, hitX: 0, hitY: 0, ...extra,
  };
}

const say = (e, text, t = 2) => {
  e.bubble = { text, t };
};

function fall(world, e, dt) {
  e.vy = Math.min(e.vy + GRAVITY * dt, MAX_FALL);
  moveBox(world, e, dt);
  e.onGround = e.hitY > 0;
  if (e.hitY) e.vy = 0;
}

/** Le héros est-il à portée de vue, sans mur entre les deux ? */
function sees(game, e, dx, dy, flying) {
  if (game.hero.dead) return false;
  const reach = e.def.vue;
  if (Math.abs(dx) > reach || Math.abs(dy) > (flying ? reach : 40)) return false;
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

export function updateEnemy(game, e, dt) {
  const { world, hero } = game;
  const { def } = e;
  const flying = def.deplacement === 'vol';
  e.animTime += dt;
  e.flash = Math.max(0, e.flash - dt);
  if (e.bubble && (e.bubble.t -= dt) <= 0) e.bubble = null;
  const dx = hero.x + hero.w / 2 - (e.x + e.w / 2);
  const dy = hero.y + hero.h / 2 - (e.y + e.h / 2);

  if (e.state === 'done') {
    e.vx = 0;
    return fall(world, e, dt); // même un drone en panne finit par terre
  }
  if (e.state === 'sleep') {
    if (Math.abs(dx) < WAKE_X && Math.abs(dy) < WAKE_Y) e.state = 'patrol';
    else return flying ? undefined : fall(world, e, dt);
  }
  if (e.state === 'stunned') {
    e.stun -= dt;
    if (e.stun <= 0) e.state = 'patrol';
    e.vx = e.kick;
    e.kick *= 0.85;
    if (flying) e.x += e.vx * dt;
    else fall(world, e, dt);
    return;
  }

  // Vue : alerte tant que le héros est visible, retour à la patrouille peu après l'avoir perdu.
  const seen = sees(game, e, dx, dy, flying);
  if (seen) {
    e.lost = 0;
    if (e.state === 'patrol') e.state = 'alert';
  } else if (e.state === 'alert' && (e.lost += dt) > 1.5) {
    e.state = 'patrol';
  }
  const alert = e.state === 'alert';
  const react = def.reaction;
  e.talk -= dt;
  if (alert && e.talk <= 0 && def.replique.length) {
    say(e, game.rng.pick(def.replique));
    e.talk = 4 + game.rng.next() * 3;
  }

  if (flying) {
    // Drone : survole son poste, ou vient se placer au-dessus du héros.
    let tx = e.home.x + Math.sin(e.animTime * 0.8) * 40;
    let ty = e.home.y + Math.sin(e.animTime * 2) * 4;
    if (alert && (react === 'cadre' || react === 'fonce')) {
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
  } else {
    let vx = 0;
    if (def.deplacement === 'marche') {
      if (alert && react === 'tire') {
        e.facing = Math.sign(dx) || e.facing; // s'arrête et fait face
      } else if (alert && react === 'fonce') {
        e.facing = Math.sign(dx) || e.facing;
        vx = e.facing * def.vitesse * 2.2;
        if (e.onGround && wallAt(world, e, e.facing)) e.vy = -260; // petit bond par-dessus l'obstacle
      } else {
        if (e.onGround && (wallAt(world, e, e.facing) || !groundAhead(world, e))) e.facing = -e.facing;
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

  if (alert && react === 'tire' && def.arme) {
    e.cooldown -= dt;
    if (e.cooldown <= 0) {
      WEAPONS[def.arme.type].fire(game, e, def.arme, 'ordre');
      e.cooldown = 1 / def.arme.cadence;
    }
  }
  if (def.contact > 0 && !hero.dead && hero.invuln <= 0 && overlap(e, hero)) {
    game.hurtHero(def.contact);
    // Après avoir bousculé le héros, l'automate recule et reste sonné : on a le temps de réagir.
    e.kick = Math.sign(e.x + e.w / 2 - (hero.x + hero.w / 2) || 1) * 160;
    e.state = 'stunned';
    e.stun = Math.max(e.stun, 1.6);
  }
}
