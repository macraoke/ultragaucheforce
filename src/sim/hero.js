// Le héros : sensations de plateforme (course, saut, grimpe), tir et attaque spéciale.
// Tous les chiffres propres à un personnage viennent de sa fiche ; les constantes ci-dessous
// règlent le « ressenti » commun et sont vérifiées par tests/sim/feel.test.js.

import { TILE } from './world.js';
import { moveBox, grounded, wallAt, approach } from './physics.js';
import { WEAPONS, SPECIALS } from './behaviors.js';

export const FEEL = {
  apexTime: 0.35, // secondes pour atteindre le sommet d'un saut
  fallBoost: 1.6, // la chute est plus rapide que la montée
  maxFall: 520, // pixels par seconde
  coyote: 0.1, // on peut encore sauter juste après avoir quitté un bord
  buffer: 0.12, // un saut demandé juste avant d'atterrir est retenu
  jumpCut: 0.45, // relâcher le saut tôt raccourcit le bond
  slide: 45, // vitesse de glissade le long d'un mur
  wallJump: 0.8, // part du saut normal quand on rebondit sur un mur
  groundAccel: 14, // la vitesse de course est atteinte en 1/14 s
  airAccel: 9,
  // Touché : il devient blanc un instant, puis clignote sans rien craindre (le recul est dessiné par le client).
  hurtFlash: 0.15, // secondes de silhouette blanche
  hurtInvuln: 1.4, // secondes d'invulnérabilité, qui clignotent
};

export function createHero(def, cx, feetY) {
  const hero = {
    x: 0, y: 0, w: 0, h: 0, vx: 0, vy: 0, facing: 1, aim: 0, onGround: false, onWall: 0, hp: 0, invuln: 0, flash: 0,
    def: null, charges: 0, anim: 'repos', animTime: 0, clones: [], dead: false,
    coyote: 0, buffer: 0, cut: true, cooldown: 0, gasTime: 0, hitX: 0, hitY: 0, climbed: false,
  };
  setHeroDef(hero, def, cx, feetY);
  return hero;
}

/** Change de personnage sans bouger les pieds : nouvelle boîte, vie et charges pleines. */
export function setHeroDef(hero, def, cx = hero.x + hero.w / 2, feetY = hero.y + hero.h) {
  hero.def = def;
  hero.w = def.largeur;
  hero.h = def.hauteur;
  hero.x = cx - hero.w / 2;
  hero.y = feetY - hero.h;
  hero.hp = def.pv;
  hero.charges = def.speciale?.charges ?? 0;
  hero.cooldown = 0;
  hero.clones = [];
}

/**
 * @param input { left, right, up, down, jump, fire, jumpPressed, specialPressed }
 */
export function updateHero(game, hero, input, dt) {
  const { world } = game;
  const { def } = hero;
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir) hero.facing = dir;
  // Sans avancer, haut ou bas oriente le tir : c'est ainsi qu'on creuse sous ses pieds ou qu'on perce un plafond.
  hero.aim = dir === 0 ? (input.down ? 1 : 0) - (input.up ? 1 : 0) : 0;

  // Course : accélération franche, arrêt net.
  const accel = def.vitesse * (hero.onGround ? FEEL.groundAccel : FEEL.airAccel);
  hero.vx = approach(hero.vx, dir * def.vitesse, accel * dt);

  // Saut : hauteur donnée par la fiche (en tuiles), durée de montée commune.
  const height = def.saut * TILE;
  const gravity = (2 * height) / FEEL.apexTime ** 2;
  const impulse = (2 * height) / FEEL.apexTime;
  hero.coyote = hero.onGround ? FEEL.coyote : hero.coyote - dt;
  hero.buffer = input.jumpPressed ? FEEL.buffer : hero.buffer - dt;
  const cling = !hero.onGround && dir !== 0 && wallAt(world, hero, dir);
  hero.climbed = false; // vrai au pas d'un rebond contre le mur : la consigne du tuto « grimper » l'attend
  if (hero.buffer > 0 && (hero.coyote > 0 || cling)) {
    hero.climbed = hero.coyote <= 0;
    hero.vy = -impulse * (hero.coyote > 0 ? 1 : FEEL.wallJump); // accroché : on grimpe par petits bonds
    hero.coyote = 0;
    hero.buffer = 0;
    hero.cut = false;
    game.sfx('saut', hero.x);
  }
  if (!input.jump && hero.vy < 0 && !hero.cut) {
    hero.vy *= FEEL.jumpCut;
    hero.cut = true;
  }

  // Gravité en deux demi-pas : la hauteur de saut tombe juste, quel que soit le pas de temps.
  const pull = (hero.vy < 0 ? gravity : gravity * FEEL.fallBoost) * dt;
  hero.vy = Math.min(hero.vy + pull / 2, FEEL.maxFall);
  if (cling && hero.vy > FEEL.slide) hero.vy = FEEL.slide;
  moveBox(world, hero, dt);
  if (hero.hitX) hero.vx = 0;
  if (hero.hitY) hero.vy = 0;
  else hero.vy = Math.min(hero.vy + pull / 2, FEEL.maxFall);
  hero.onGround = hero.vy >= 0 && grounded(world, hero);
  hero.onWall = cling ? dir : 0;

  // Les doubles suivent la trace du héros.
  for (const clone of hero.clones) {
    const point = game.trail[Math.max(0, game.trail.length - 1 - clone.lag)];
    if (point) {
      clone.x = point.x - clone.w / 2;
      clone.y = point.y - clone.h;
    }
    clone.facing = hero.facing;
    clone.aim = hero.aim;
    clone.t -= dt;
  }
  hero.clones = hero.clones.filter((c) => c.t > 0);

  // Tir : continu tant que le bouton est tenu, devant soi, ou à la verticale quand on vise.
  hero.cooldown -= dt;
  if (input.fire && hero.cooldown <= 0 && def.arme) {
    const weapon = WEAPONS[def.arme.type];
    weapon.fire(game, hero, def.arme, 'luttes');
    for (const clone of hero.clones) weapon.fire(game, clone, def.arme, 'luttes');
    hero.cooldown = 1 / def.arme.cadence;
    game.onHeroShot();
  }

  // Spéciale : une charge par appui.
  if (input.specialPressed && hero.charges > 0 && def.speciale) {
    if (SPECIALS[def.speciale.type].use(game, hero, def.speciale)) {
      hero.charges--;
      game.sfx(def.speciale.son || 'speciale', hero.x);
      if (def.speciale.nom) game.emit('bubble', { x: hero.x + hero.w / 2, y: hero.y - 6, text: def.speciale.nom });
    }
  }

  const anim = !hero.onGround ? 'saut' : Math.abs(hero.vx) > 10 ? 'marche' : 'repos';
  hero.animTime = anim === hero.anim ? hero.animTime + dt : 0;
  hero.anim = anim;
  hero.invuln = Math.max(0, hero.invuln - dt);
  hero.flash = Math.max(0, hero.flash - dt);
}
