// Une partie : l'état complet d'un niveau en cours et son avancée pas à pas.
//
// Simulation PURE : aucun DOM, aucune horloge, aucun Math.random. Même graine + mêmes actions
// = même partie, dans le navigateur comme dans Node (tests, robot de traversée).
//
// Le client lit l'état (hero, enemies, projectiles, props, cortege, boss, world…) pour dessiner,
// et vide `events` à chaque image pour jouer sons, secousses, bandeaux et cartons :
//   sfx {id, x} · shake {force} · headline {text} · heroCard {hero} · card {id} · debris {x, y, color, n}
//   bubble {x, y, text} · explosion {x, y, r} · panic {level} · checkpoint · death · respawn
//   boss {state: 'enter' | 'phase' | 'defeated'} · won · lost
//
// Repères : tout est en pixels, tuile = 16. Les boîtes (héros, ennemis, projectiles, accessoires, boss)
// ont x, y = coin haut-gauche. Cortège : x = centre, y = pieds. Décors : x, y = coin bas-gauche de la case.

import { makeRng } from './rng.js';
import { TILE } from './world.js';
import { hitsSolid, overlap } from './physics.js';
import { updateHero, setHeroDef } from './hero.js';
import { createEnemy, updateEnemy } from './enemy.js';
import { updateProjectiles } from './projectile.js';
import { updateBoss, hurtBoss } from './boss.js';
import { loadLevel, toList, playable } from './level.js';
import { updateProps, updateCortege, growCortege } from './props.js';

export const DT = 1 / 60;

const PANIC_STEPS = [34, 67]; // seuils ALERTE puis HYSTÉRIE
const MAX_REINFORCEMENTS = 4; // renforts bornés : la panique ne rend jamais un niveau infaisable
const FUSE = 0.12; // délai entre la destruction d'un tonneau et son explosion (réaction en chaîne)
const RESPAWN_DELAY = 0.8;
const TRAIL_LENGTH = 600;
const MAX_EVENTS = 400;

export class Game {
  /**
   * @param {object} bundle   contenu assemblé par `buildContent`
   * @param {string} levelId  identifiant dans `bundle.niveaux`
   * @param {{seed?: number, invincible?: boolean, level?: object}} opts
   *        `level` remplace `bundle.niveaux[levelId]` (Atelier, tests)
   */
  constructor(bundle, levelId, opts = {}) {
    const level = opts.level ?? bundle.niveaux?.[levelId];
    if (!level) throw new Error(`Niveau introuvable : « ${levelId} ».`);
    this.bundle = bundle;
    this.level = level;
    this.rng = makeRng(opts.seed ?? 1);
    this.invincible = Boolean(opts.invincible);

    this.events = [];
    this.status = 'playing';
    this.time = 0;
    this.lives = 3;
    this.panic = 0;
    this.panicLevel = 0;
    this.sign = null;
    this.stats = { breakdownsByPlayer: 0, breakdownsBySelf: 0, gassed: 0, tiles: 0, rescues: 0, tracts: 0, deaths: 0 };

    this.enemies = [];
    this.projectiles = [];
    this.clouds = [];
    this.props = [];
    this.decors = [];
    this.cortege = [];
    this.boss = null;

    this.fuses = []; // explosions à retardement
    this.trail = []; // trace du héros, suivie par le cortège et les doubles
    this.unlocked = []; // fiches « droits » déjà débloquées dans cette partie
    this.reinforcements = 0;
    this.headlines = 0;
    this.respawnTimer = 0;
    this.held = { jump: false, special: false };
    this.signOffset = this.rng.int(1000);

    loadLevel(this); // world, hero, checkpoint, enemies, props, decors, boss
    this.recordTrail();
    growCortege(this, 3);
  }

  // ------------------------------------------------------------ un pas de simulation

  /** @param {{left?: boolean, right?: boolean, jump?: boolean, fire?: boolean, special?: boolean}} actions */
  step(actions = {}) {
    if (this.status !== 'playing') return;
    const input = {
      left: Boolean(actions.left), right: Boolean(actions.right), jump: Boolean(actions.jump),
      fire: Boolean(actions.fire),
      jumpPressed: Boolean(actions.jump) && !this.held.jump,
      specialPressed: Boolean(actions.special) && !this.held.special,
    };
    this.held = { jump: input.jump, special: Boolean(actions.special) };
    this.time += DT;

    const { hero } = this;
    if (hero.dead) {
      this.respawnTimer -= DT;
      if (this.respawnTimer <= 0) this.respawn();
    } else {
      updateHero(this, hero, input, DT);
      this.recordTrail();
      if (hero.y > this.world.h * TILE + 48) this.killHero(); // tombé sous la carte
    }
    for (const e of this.enemies) updateEnemy(this, e, DT);
    if (this.boss) updateBoss(this, this.boss, DT);
    updateProjectiles(this, DT);
    this.updateClouds();
    this.updateFuses();
    updateProps(this);
    updateCortege(this, DT);
    this.world.flush(
      (tx, ty, def, team) => this.tileDestroyed(tx, ty, def, team),
      (tx, ty, def) => this.emit('debris', { x: tx * TILE + 8, y: ty * TILE + 8, color: tileColor(def), n: 2 }),
    );
    if (this.events.length > MAX_EVENTS) this.events.splice(0, this.events.length - MAX_EVENTS);
  }

  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  sfx(id, x = 0) {
    this.emit('sfx', { id, x });
  }

  // ------------------------------------------------------------ décor et explosions

  tileDestroyed(tx, ty, def, team) {
    const x = tx * TILE + TILE / 2;
    const y = ty * TILE + TILE / 2;
    this.stats.tiles++;
    this.emit('debris', { x, y, color: tileColor(def), n: 6 });
    if (def.explose > 0) this.fuses.push({ x, y, r: def.explose, t: FUSE, credit: team });
  }

  updateFuses() {
    for (const f of this.fuses) f.t -= DT;
    const ready = this.fuses.filter((f) => f.t <= 0);
    this.fuses = this.fuses.filter((f) => f.t > 0);
    // Un tonneau blesse tout le monde ; on retient qui l'a fait sauter.
    for (const f of ready) this.explode(f.x, f.y, f.r, { team: 'neutre', credit: f.credit, damage: 3, terrain: 3 });
  }

  /**
   * Explosion (ou onde) centrée en (x, y).
   * `team` : 'luttes' épargne le héros, 'ordre' épargne les automates (sauf `friendly`), 'neutre' touche tout le monde.
   * `credit` : camp à qui attribuer les pannes dans les statistiques.
   */
  explode(x, y, r, { team = 'neutre', credit = team, friendly = false, damage = 2, terrain = 2, push = 0, stun = 0, quiet = false } = {}) {
    this.emit('explosion', { x, y, r });
    this.emit('shake', { force: Math.min(10, r / 6) });
    if (!quiet) this.sfx('explosion', x);
    if (!quiet && r >= 32) this.addPanic(2);

    const { world, hero } = this;
    const reach = Math.ceil(r / TILE);
    const cx = Math.floor(x / TILE);
    const cy = Math.floor(y / TILE);
    for (let ty = cy - reach; ty <= cy + reach; ty++) {
      for (let tx = cx - reach; tx <= cx + reach; tx++) {
        if (Math.hypot(tx * TILE + 8 - x, ty * TILE + 8 - y) <= r) world.damage(tx, ty, terrain, credit);
      }
    }
    const near = (b) => Math.hypot(b.x + b.w / 2 - x, b.y + b.h / 2 - y) <= r + Math.min(b.w, b.h) / 2;
    if (team !== 'ordre' || friendly) {
      for (const e of this.enemies) {
        if (e.state === 'done' || !near(e)) continue;
        this.hurtEnemy(e, damage, credit === 'ordre' ? 'ordre' : 'luttes');
        if (e.state === 'done') continue;
        if (push) e.kick = Math.sign(e.x + e.w / 2 - x || 1) * push;
        if (stun && e.state !== 'sleep') {
          e.state = 'stunned';
          e.stun = Math.max(e.stun, stun);
        }
      }
    }
    if (team !== 'ordre' && this.boss && near(this.boss)) this.hurtBoss(damage);
    if (team !== 'luttes' && !hero.dead && near(hero)) this.hurtHero(1);
    if (team !== 'ordre') {
      for (const cage of this.props) {
        if (cage.kind !== 'cage' || cage.on || !near(cage)) continue;
        cage.hp -= Math.max(1, damage);
        if (cage.hp <= 0) this.rescue(cage);
      }
    }
  }

  updateClouds() {
    const { hero } = this;
    for (const c of this.clouds) c.t -= DT;
    this.clouds = this.clouds.filter((c) => c.t > 0);
    const inGas = (b) => this.clouds.some((c) => Math.hypot(c.x - (b.x + b.w / 2), c.y - (b.y + b.h / 2)) < c.r);
    // Le gaz ne choisit pas son camp : il étourdit aussi ceux qui l'ont lancé.
    for (const e of this.enemies) {
      if (e.state === 'done' || e.state === 'sleep' || !inGas(e)) continue;
      e.state = 'stunned';
      e.stun = Math.max(e.stun, 1);
    }
    if (!hero.dead && inGas(hero)) {
      hero.gasTime += DT;
      if (hero.gasTime >= 1) {
        hero.gasTime = 0;
        this.hurtHero(1);
      }
    } else {
      hero.gasTime = Math.max(0, hero.gasTime - DT);
    }
  }

  /** Y a-t-il un personnage dans ce rectangle ? (pour ne jamais faire pousser un mur sur quelqu'un) */
  actorsIn(box) {
    return overlap(box, this.hero)
      || this.enemies.some((e) => overlap(box, e))
      || Boolean(this.boss && this.boss.state !== 'gone' && overlap(box, this.boss))
      || this.props.some((p) => p.kind !== 'panneau' && overlap(box, p));
  }

  // ------------------------------------------------------------ coups reçus

  hurtHero(amount) {
    const { hero } = this;
    if (hero.dead || amount <= 0 || this.invincible || hero.invuln > 0) return;
    hero.hp -= amount;
    hero.invuln = 1;
    this.sfx('degat', hero.x);
    this.emit('shake', { force: 4 });
    if (hero.hp <= 0) this.killHero();
  }

  /** Un automate ne meurt pas : à zéro, il se met en grève ou tombe en panne. */
  hurtEnemy(e, amount, team = 'luttes') {
    if (e.state === 'done' || amount <= 0) return;
    e.hp -= amount;
    e.flash = 0.12;
    if (e.state === 'sleep') e.state = 'patrol';
    if (e.hp > 0) return this.sfx('impact', e.x);
    const strike = e.def.fin === 'greve';
    e.hp = 0;
    e.state = 'done';
    e.kick = 0;
    e.framing = false;
    e.bubble = { text: strike ? 'EN GRÈVE !' : 'EN PANNE', t: 2.5 };
    this.stats[team === 'ordre' ? 'breakdownsBySelf' : 'breakdownsByPlayer']++;
    this.sfx(strike ? 'greve' : 'panne', e.x);
    this.emit('debris', { x: e.x + e.w / 2, y: e.y + e.h / 2, color: 'h', n: 5 });
  }

  hurtBoss(amount) {
    if (this.boss) hurtBoss(this, this.boss, amount);
  }

  spawnEnemy(id, cx, feetY, extra = {}) {
    const def = this.bundle.ennemis?.[id];
    if (!def) return null;
    const e = createEnemy(def, cx, feetY, extra);
    this.enemies.push(e);
    return e;
  }

  // ------------------------------------------------------------ vies, sauvetages, reprises

  killHero() {
    const { hero } = this;
    if (hero.dead) return;
    hero.dead = true;
    hero.clones = [];
    this.stats.deaths++;
    this.emit('death', {});
    this.sfx('mort', hero.x);
    if (!this.invincible) this.lives--;
    if (this.lives <= 0) {
      this.status = 'lost';
      this.emit('lost', {});
      return;
    }
    this.respawnTimer = RESPAWN_DELAY;
  }

  respawn() {
    const { hero } = this;
    setHeroDef(hero, hero.def, this.checkpoint.x, this.checkpoint.y);
    Object.assign(hero, { vx: 0, vy: 0, dead: false, invuln: 2, gasTime: 0, onGround: false });
    this.emit('respawn', {});
  }

  /** Libère le camarade d'une cage : +1 vie, changement de héros, fiche « droits ». Une seule fois par cage. */
  rescue(cage) {
    if (cage.on) return;
    cage.on = true;
    const { hero, bundle, level } = this;
    this.stats.rescues++;
    this.lives++;

    // Héros suivant : la liste du niveau s'il en a une, sinon un autre héros jouable au hasard.
    let next = toList(level.camarades).map((id) => bundle.heros?.[id])[this.stats.rescues - 1];
    if (!next || next === hero.def) {
      const others = playable(bundle).filter((h) => h !== hero.def);
      next = others.length ? this.rng.pick(others) : hero.def;
    }
    setHeroDef(hero, next);
    this.unstick(hero);
    hero.invuln = Math.max(hero.invuln, 1);

    this.sfx('sauvetage', cage.x);
    this.emit('heroCard', { hero: next.id });
    const card = Object.values(bundle.fiches || {}).find((f) => f.theme === 'droits' && !this.unlocked.includes(f.id));
    if (card) {
      this.unlocked.push(card.id);
      this.emit('card', { id: card.id });
    }
    this.addPanic(10);
    if (this.stats.rescues > 1) this.headline(); // le premier sauvetage a déjà son carton
    growCortege(this, 2);
  }

  /** Après un changement de gabarit, écarte le héros d'un mur qu'il chevaucherait. */
  unstick(hero) {
    for (const shift of [0, -2, 2, -4, 4, -6, 6, -8, 8]) {
      if (!hitsSolid(this.world, hero.x + shift, hero.y, hero.w, hero.h)) {
        hero.x += shift;
        return;
      }
    }
  }

  recordTrail() {
    const { hero, trail } = this;
    const x = hero.x + hero.w / 2;
    const y = hero.y + hero.h;
    const last = trail.at(-1);
    if (last && Math.hypot(x - last.x, y - last.y) < 2) return;
    trail.push({ x, y, ground: hero.onGround });
    if (trail.length > TRAIL_LENGTH) trail.shift();
  }

  // ------------------------------------------------------------ PANIQUE TV

  onHeroShot() {
    this.stats.tracts++;
    if (this.stats.tracts === 1) {
      this.addPanic(6);
      this.headline('ALERTE MAXIMALE : UN TRACT A ÉTÉ DISTRIBUÉ SANS AUTORISATION DES MARCHÉS');
    }
  }

  /** Une manchette de PANIQUE TV : celle qu'on donne, sinon la suivante du niveau, sinon une du fonds commun. */
  headline(text = null) {
    const own = this.level.manchette || [];
    const pool = this.bundle.manchettes || [];
    const pick = text ?? own[this.headlines++] ?? (pool.length ? this.rng.pick(pool) : null);
    if (pick) this.emit('headline', { text: pick });
  }

  /** La panique ne redescend jamais ; chaque palier franchi déclenche une manchette et des renforts bornés. */
  addPanic(points) {
    if (points <= 0 || this.status !== 'playing') return;
    this.panic = Math.min(100, this.panic + points);
    while (this.panicLevel < PANIC_STEPS.length && this.panic >= PANIC_STEPS[this.panicLevel]) {
      this.panicLevel++;
      this.emit('panic', { level: this.panicLevel });
      this.sfx('palier', this.hero.x);
      this.headline();
      this.reinforce(2);
    }
  }

  /** Renforts : de préférence des drones de PANIQUE TV, posés à distance fixe devant le héros. */
  reinforce(count) {
    const { hero, world, bundle, level } = this;
    const defs = Object.values(level.legende || {})
      .filter((ref) => ref.type === 'ennemi' && bundle.ennemis?.[ref.id])
      .map((ref) => bundle.ennemis[ref.id]);
    const pool = defs.some((d) => d.reaction === 'cadre') ? defs.filter((d) => d.reaction === 'cadre') : defs;
    if (!pool.length) return;
    const exit = this.props.find((p) => p.kind === 'sortie');
    const ahead = exit && exit.x < hero.x ? -1 : 1;
    for (let i = 0; i < count && this.reinforcements < MAX_REINFORCEMENTS; i++) {
      const def = this.rng.pick(pool);
      const cx = Math.max(TILE, Math.min(world.w * TILE - TILE, hero.x + ahead * (170 + i * 36)));
      let feet = hero.y - 24; // un drone arrive par les airs
      if (def.deplacement !== 'vol') {
        const tx = Math.floor(cx / TILE);
        let ty = Math.max(0, Math.floor(hero.y / TILE) - 3);
        while (ty < world.h && (world.solid(tx, ty) || !world.solid(tx, ty + 1))) ty++;
        if (ty >= world.h) continue; // pas de sol à cet endroit : pas de renfort
        feet = (ty + 1) * TILE;
      }
      this.spawnEnemy(def.id, cx, feet, { state: 'alert' });
      this.reinforcements++;
    }
  }

  /** Le nombre de « blessés » annoncé par PANIQUE TV : il gonfle avec la panique, pas avec les faits. */
  announced() {
    const s = this.stats;
    return Math.round(this.panic * 8.47 + (s.breakdownsByPlayer + s.breakdownsBySelf) * 47 + s.tracts * 0.5);
  }
}

/** Couleur dominante d'une tuile (pour ses éclats) : le caractère au centre de son dessin. */
function tileColor(def) {
  const c = def.sprites?.image?.[8]?.[8];
  return c && c !== '.' ? c : 'g';
}
