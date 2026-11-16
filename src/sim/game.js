// Une partie : l'état complet d'un niveau en cours et son avancée pas à pas.
//
// Simulation PURE : aucun DOM, aucune horloge, aucun Math.random. Même graine + mêmes actions
// = même partie, dans le navigateur comme dans Node (tests, robot de traversée).
//
// Le client lit l'état (hero, enemies, projectiles, props, cortege, boss, world…) pour dessiner,
// et vide `events` à chaque image pour jouer sons, secousses, bandeaux et cartons :
//   sfx {id, x} · shake {force} · headline {text} · heroCard {hero} · card {id} · debris {x, y, color, n}
//   bubble {x, y, text} · explosion {x, y, r} · panic {level} · checkpoint · death · respawn
//   boss {state: 'enter' | 'phase' | 'stand' | 'defeated'} · won · lost
//   hurt {x, y, kind, hp, max, dir} : le héros est touché (kind : 'tir' | 'gaz' | 'charge' | 'contact' | 'explosion')
//   parry {x, y, line} : un bouclier ou une ligne qui tient arrête un coup · down {x, y, end} : une unité hors service
//   recruit {id, n, crowd, x, y} · overrun {x, y, feet, need, crowd} : une ligne cède
//   blocked {x, y, feet, need, crowd, joined, dir} : le héros bute sur une ligne qui tient ; `joined` passants arrivent
//   dispersed {n, crowd, reason, x, y, gone} : la manif perd du monde (reason : 'charge' | 'gaz' | 'chute' | 'interpelle'
//     | 'touche' ; gone : où étaient les manifestants qui ne sont plus dessinés, six au plus)
//   kettle {state: 'start', x} puis {state: 'end', reason: 'out' | 'broken' | 'time'} · drop {x, y, n}
//   discover {kind: 'heros' | 'ennemi' | 'recrue' | 'boss' | 'mot', id} : une seule fois par partie
//
// La manif et le maintien de l'ordre :
//   crowd        nombre de manifestants (entier, jamais plafonné) ; `cortege` en dessine 40 au plus
//   recruits     [{ id, def, x, y, w, h, joined, animTime }] : à rejoindre en les touchant ou en leur tendant un tract
//   addCrowd(n)  des gens rejoignent · disperse(part, raison) en disperse une part · loseCrowd(n, raison) en retire n
//                (jamais sous 1 avec un cortège)
//   power()      multiplicateur des dégâts des projectiles du héros : le nombre fait la force
//   kettle       null | { x, t, limit, x0, x1 } : nasse en cours (x0, x1 = bords intérieurs des lignes)
//   Ennemis : blocking, aim, jet, beam, rush, rope (voir enemy.js) · boss.seated (voir boss.js)
//
// Repères : tout est en pixels, tuile = 16. Les boîtes (héros, ennemis, projectiles, accessoires, boss)
// ont x, y = coin haut-gauche. Cortège : x = centre, y = pieds. Décors : x, y = coin bas-gauche de la case.

import { makeRng } from './rng.js';
import { TILE } from './world.js';
import { hitsSolid, overlap } from './physics.js';
import { updateHero, setHeroDef, FEEL } from './hero.js';
import { createEnemy, updateEnemy, sturdy, LINE_REACH } from './enemy.js';
import { updateProjectiles } from './projectile.js';
import { updateBoss, hurtBoss } from './boss.js';
import { loadLevel, toList, playable } from './level.js';
import { updateProps } from './props.js';
import { updateRecruits, updateCortege, syncCortege, visibleCortege, updateKettle, drawSign, bringSigns } from './manif.js';

export const DT = 1 / 60;

export const PANIC_STEPS = [34, 67]; // seuils ALERTE puis HYSTÉRIE
const IGNITE_RANGE = 20 * TILE; // une poubelle ne prend feu qu'à cette distance du héros : on doit le voir
const MAX_REINFORCEMENTS = 4; // renforts bornés : la panique ne rend jamais un niveau infaisable
const FUSE = 0.12; // délai entre la destruction d'un tonneau et son explosion (réaction en chaîne)
export const START_LIVES = 1; // on part avec un seul personnage : les autres sortent des gardes à vue
const RESPAWN_DELAY = 0.8;
const TRAIL_LENGTH = 600;
const MAX_EVENTS = 400;
const NAG = 2; // secondes entre deux rappels « vous n'êtes pas assez nombreux »
const PASSERS = 0.04; // devant une ligne qui tient, à chaque rappel, cette part du nombre voulu rejoint la manif…
const PASSERS_BOOST = 64; // …et jusqu'à 64 fois plus quand la manif ne progresse plus (elle perd du monde en attendant)
const PARRY = 0.25; // secondes pendant lesquelles un coup paré se voit sur le bouclier ou la ligne

export class Game {
  /**
   * @param {object} bundle   contenu assemblé par `buildContent`
   * @param {string} levelId  identifiant dans `bundle.niveaux`
   * @param {{seed?: number, invincible?: boolean, level?: object, hero?: string, lives?: number}} opts
   *        `level` remplace `bundle.niveaux[levelId]` (Atelier, tests) ;
   *        `hero` : le héros de départ choisi par le joueur (sinon celui du niveau) ;
   *        `lives` : combien d'exemplaires de ce héros dans la pile de départ (un seul par défaut)
   */
  constructor(bundle, levelId, opts = {}) {
    const level = opts.level ?? bundle.niveaux?.[levelId];
    if (!level) throw new Error(`Niveau introuvable : « ${levelId} ».`);
    this.bundle = bundle;
    this.level = level;
    this.levelId = level.id ?? levelId;
    this.rng = makeRng(opts.seed ?? 1);
    this.invincible = Boolean(opts.invincible);
    this.choice = opts.hero ?? ''; // lu par loadLevel

    this.events = [];
    this.status = 'playing';
    this.time = 0;
    // Les vies sont des personnages, empilés : on joue celui du dessus. Une garde à vue libérée en pose un de plus ;
    // quand il tombe, on repart avec le suivant.
    this.stack = [];
    this.panic = 0;
    this.panicLevel = 0;
    this.sign = null;
    this.stats = {
      breakdownsByPlayer: 0, breakdownsBySelf: 0, gassed: 0, tiles: 0, rescues: 0, tracts: 0, deaths: 0,
      recruits: 0, dispersed: 0, overrun: 0, overrunOrder: 0, signs: 0,
    };

    this.enemies = [];
    this.projectiles = [];
    this.clouds = [];
    this.props = [];
    this.decors = [];
    this.cortege = [];
    this.signs = []; // les pancartes arrivées dans la manif pendant cette partie, dans l'ordre
    this.boss = null;
    this.crowd = 0; // la manif : nombre de manifestants
    this.recruits = [];
    this.nasses = []; // repères « N » de la carte
    this.fires = []; // les feux de poubelle allumés par la panique : { x, y } (centre, au sol)
    this.kettle = null;
    this.kettleClock = 0; // secondes depuis la dernière nasse (niveaux à `nasse.rythme`)

    this.fuses = []; // explosions à retardement
    this.trail = []; // trace du héros, suivie par le cortège et les doubles
    this.unlocked = []; // fiches « droits » déjà débloquées dans cette partie
    this.discovered = new Set(); // « genre:identifiant » déjà signalés dans cette partie
    this.reinforcements = 0;
    this.headlines = 0;
    this.respawnTimer = 0;
    this.held = { jump: false, special: false };

    loadLevel(this); // world, hero, checkpoint, enemies, props, decors, boss
    this.stack = Array(opts.lives ?? START_LIVES).fill(this.hero.def.id);
    this.recordTrail();
    this.addCrowd(level.manif ?? (level.cortege ? 10 : 0));
    this.discover('heros', this.hero.def.id);
  }

  // ------------------------------------------------------------ un pas de simulation

  /** @param {{left?: boolean, right?: boolean, jump?: boolean, fire?: boolean, special?: boolean}} actions */
  step(actions = {}) {
    if (this.status !== 'playing') return;
    const input = {
      left: Boolean(actions.left), right: Boolean(actions.right), jump: Boolean(actions.jump),
      up: Boolean(actions.up), down: Boolean(actions.down), fire: Boolean(actions.fire),
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
    this.blockHero();
    if (this.boss) updateBoss(this, this.boss, DT);
    updateProjectiles(this, DT);
    this.updateClouds();
    this.updateFuses();
    updateProps(this);
    updateRecruits(this, DT);
    updateKettle(this, DT);
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
        const away = Math.sign(e.x + e.w / 2 - x || 1);
        this.hurtEnemy(e, damage, credit === 'ordre' ? 'ordre' : 'luttes', away);
        if (e.state === 'done' || sturdy(e)) continue; // une ligne qui tient ou un véhicule : ni recul ni étourdissement
        if (push) e.kick = away * push;
        if (stun && e.state !== 'sleep') {
          e.state = 'stunned';
          e.stun = Math.max(e.stun, stun);
          e.daze = 'choc'; // sonné : des étoiles, pas des larmes
        }
      }
    }
    if (team !== 'ordre' && this.boss && near(this.boss)) this.hurtBoss(damage);
    if (team !== 'luttes' && !hero.dead && near(hero)) this.hurtHero(1, { x, kind: 'explosion' });
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
      if (e.state === 'done' || e.state === 'sleep' || sturdy(e) || !inGas(e)) continue;
      e.state = 'stunned';
      e.stun = Math.max(e.stun, 1);
      e.daze = 'gaz'; // gazé par ses propres grenades : il pleure et tousse, il ne fait plus rien
    }
    if (!hero.dead && inGas(hero)) {
      hero.gasTime += DT;
      if (hero.gasTime >= 1) {
        hero.gasTime = 0;
        this.hurtHero(1, { kind: 'gaz' });
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
      || this.props.some((p) => p.kind !== 'panneau' && overlap(box, p))
      || this.recruits.some((r) => !r.joined && overlap(box, r));
  }

  // ------------------------------------------------------------ coups reçus

  /**
   * Le héros est touché. `from` dit par quoi : `kind` ('tir', 'gaz', 'charge', 'contact', 'explosion')
   * et d'où (`x`, ou `dir` : le sens du coup). Il blanchit un instant, puis clignote le temps de souffler.
   * Le recul est dessiné par le client, dans le sens `dir` : la partie, elle, ne bouge pas le héros
   * (un vrai recul le jetait dans les trous et sous les charges : le robot gagnait un quart de parties en moins).
   */
  hurtHero(amount, from = {}) {
    const { hero } = this;
    if (hero.dead || amount <= 0 || this.invincible || hero.invuln > 0) return;
    // Un personnage encaisse quelques coups (`pv` de sa fiche) ; au dernier, le précédent de la pile prend sa place.
    hero.hp -= amount;
    hero.invuln = FEEL.hurtInvuln;
    hero.flash = FEEL.hurtFlash;
    const kind = from.kind || 'tir';
    const cx = hero.x + hero.w / 2;
    const dir = from.dir || Math.sign(cx - (from.x ?? cx)) || -hero.facing;
    this.emit('hurt', { x: cx, y: hero.y, kind, hp: Math.max(0, hero.hp), max: hero.def.pv, dir });
    this.sfx('degat', hero.x);
    this.emit('shake', { force: 5 });
    if (hero.hp <= 0) this.killHero();
  }

  /**
   * Un automate ne meurt pas : à zéro, il se met en grève ou tombe en panne.
   * `dir` : le sens du coup (le dessin recule d'un pixel de ce côté).
   */
  hurtEnemy(e, amount, team = 'luttes', dir = 0) {
    if (e.state === 'done' || amount <= 0) return;
    if (e.def.debordement > 0) {
      this.parry(e, e.x + e.w / 2, true); // la ligne tient : seul le nombre la fait céder
      return;
    }
    e.hp -= amount;
    e.flash = 0.12;
    e.hitDir = dir;
    if (e.state === 'sleep') e.state = 'patrol';
    if (e.hp > 0) return this.sfx('touche', e.x);
    const strike = e.def.fin === 'greve';
    e.hp = 0;
    e.state = 'done';
    e.kick = 0;
    e.framing = false;
    e.daze = null;
    e.flash = 0.2;
    e.bubble = { text: strike ? 'EN GRÈVE !' : 'EN PANNE', t: 2.5 };
    // Le bilan des « blessés » ne compte que les unités de l'ordre : ni un duplex, ni un ministre.
    if (e.def.camp === 'ordre') this.stats[team === 'ordre' ? 'breakdownsBySelf' : 'breakdownsByPlayer']++;
    this.sfx(strike ? 'greve' : 'panne', e.x);
    this.emit('down', { x: e.x + e.w / 2, y: e.y + e.h / 2, end: strike ? 'greve' : 'panne' });
    this.emit('debris', { x: e.x + e.w / 2, y: e.y + e.h / 2, color: 'h', n: 5 });
  }

  /** Un bouclier de face ou une ligne qui tient arrête le coup : ça se voit et ça s'entend, mais rien n'est entamé. */
  parry(e, x, line = false) {
    e.parry = PARRY;
    this.emit('parry', { x, y: e.y + e.h * 0.4, line });
    this.sfx('pare', x);
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

  /** Le nombre de vies : la hauteur de la pile de personnages. */
  get lives() {
    return this.stack.length;
  }

  killHero() {
    const { hero } = this;
    if (hero.dead) return;
    hero.dead = true;
    hero.clones = [];
    this.stats.deaths++;
    this.disperse(0.15, 'chute', { x: hero.x + hero.w / 2, y: hero.y }); // sans son héros, une partie de la manif se disperse
    this.emit('death', {});
    this.sfx('mort', hero.x);
    if (!this.invincible) this.stack.pop();
    if (this.lives <= 0) {
      this.status = 'lost';
      this.emit('lost', {});
      return;
    }
    this.respawnTimer = RESPAWN_DELAY;
  }

  respawn() {
    const { hero } = this;
    const next = this.bundle.heros?.[this.stack.at(-1)] || hero.def; // le personnage du dessus de la pile
    setHeroDef(hero, next, this.checkpoint.x, this.checkpoint.y);
    Object.assign(hero, { vx: 0, vy: 0, dead: false, invuln: 2, flash: 0, gasTime: 0, onGround: false });
    this.emit('respawn', { hero: next.id });
  }

  /** Libère le camarade d'une cage : +1 vie, changement de héros, fiche « droits ». Une seule fois par cage. */
  rescue(cage) {
    if (cage.on) return;
    cage.on = true;
    const { hero, bundle, level } = this;
    this.stats.rescues++;

    // Héros suivant : la liste du niveau s'il en a une, sinon un autre héros jouable au hasard.
    let next = toList(level.camarades).map((id) => bundle.heros?.[id])[this.stats.rescues - 1];
    if (!next || next === hero.def) {
      const others = playable(bundle).filter((h) => h !== hero.def);
      next = others.length ? this.rng.pick(others) : hero.def;
    }
    setHeroDef(hero, next);
    this.unstick(hero);
    hero.invuln = Math.max(hero.invuln, 1);

    this.stack.push(next.id); // une vie de plus, et c'est lui qu'on joue
    this.sfx('sauvetage', cage.x);
    this.emit('heroCard', { hero: next.id, x: cage.x + cage.w / 2, y: cage.y });
    this.discover('heros', next.id);
    const card = Object.values(bundle.fiches || {}).find((f) => f.theme === 'droits' && !this.unlocked.includes(f.id));
    if (card) {
      this.unlocked.push(card.id);
      this.emit('card', { id: card.id });
    }
    this.addPanic(10);
    if (this.stats.rescues > 1) this.headline(); // le premier sauvetage a déjà son carton
    this.addCrowd(20); // le camarade libéré ne repart pas seul
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
      const pool = this.banners();
      if (pool.length) this.headline(drawSign(this, pool)); // le premier tract fait la une, sans entamer les manchettes du niveau
    }
  }

  /**
   * Une alerte de PANIQUE TV : celle qu'on donne, sinon la suivante du niveau, sinon un bandeau du fonds commun
   * (`content/manchettes/` : de vrais bandeaux de chaînes d'info, avec leur crédit).
   */
  headline(text = null) {
    const own = this.level.manchette || [];
    const pool = this.banners();
    const pick = text ?? own[this.headlines++] ?? drawSign(this, pool);
    if (!pick) return;
    this.emit('headline', typeof pick === 'string' ? { text: pick } : { text: pick.texte, credit: pick.credit });
  }

  /** Le fonds commun des alertes. */
  banners() {
    return this.bundle.manchettes || [];
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
      // Une poubelle prend feu et une équipe télé vient la filmer : elle compte parmi les renforts du palier.
      this.reinforce(this.ignite() ? 1 : 2);
    }
  }

  /**
   * La panique monte : le décor inflammable (`brule`) le plus proche du héros prend feu, de préférence devant lui,
   * et une unité télé de la légende (réaction `cadre`, pas un plateau fixe) arrive pour filmer ce feu, pas la manif.
   * @returns {boolean} vrai si une équipe a été envoyée
   */
  ignite() {
    const { hero, world, bundle, level } = this;
    const cx = hero.x + hero.w / 2;
    const exit = this.props.find((p) => p.kind === 'sortie');
    const ahead = exit && exit.x < hero.x ? -1 : 1;
    const centre = (d) => d.x + (bundle.decors[d.id].sprites.image[0]?.length || TILE) / 2;
    const reach = (d) => Math.abs(centre(d) - cx) + ((centre(d) - cx) * ahead < 0 ? IGNITE_RANGE / 2 : 0); // derrière : moins volontiers
    const bin = this.decors
      .filter((d) => bundle.decors?.[d.id]?.brule && !d.fire && Math.abs(centre(d) - cx) <= IGNITE_RANGE && Math.abs(d.y - (hero.y + hero.h)) <= 6 * TILE)
      .sort((a, b) => reach(a) - reach(b))[0];
    if (!bin) return false;
    const fire = { x: centre(bin), y: bin.y };
    bin.fire = fire;
    this.fires.push(fire);
    this.emit('fire', { x: fire.x, y: fire.y });

    if (this.reinforcements >= MAX_REINFORCEMENTS) return false;
    const crews = Object.values(level.legende || {})
      .filter((ref) => ref.type === 'ennemi' && bundle.ennemis?.[ref.id]?.reaction === 'cadre')
      .map((ref) => bundle.ennemis[ref.id])
      .filter((def) => def.deplacement !== 'fixe');
    // À pied de préférence : on voit l'équipe arriver. Sinon un drone.
    const def = crews.find((d) => d.deplacement !== 'vol') || crews[0];
    if (!def) return false;
    const from = Math.max(TILE, Math.min(world.w * TILE - TILE, fire.x + ahead * 9 * TILE));
    let feet = fire.y - 4 * TILE; // un drone arrive par les airs
    if (def.deplacement !== 'vol') {
      const tx = Math.floor(from / TILE);
      let ty = Math.max(0, Math.floor(fire.y / TILE) - 4);
      while (ty < world.h && (world.solid(tx, ty) || !world.solid(tx, ty + 1))) ty++;
      if (ty >= world.h) return false; // pas de sol de ce côté : personne ne vient
      feet = (ty + 1) * TILE;
    }
    this.spawnEnemy(def.id, from, feet, { state: 'alert', film: fire });
    this.reinforcements++;
    return true;
  }

  /** Renforts : de préférence des drones de PANIQUE TV, posés à distance fixe devant le héros. */
  reinforce(count) {
    const { hero, world, bundle, level } = this;
    const defs = Object.values(level.legende || {})
      .filter((ref) => ref.type === 'ennemi' && bundle.ennemis?.[ref.id])
      .map((ref) => bundle.ennemis[ref.id])
      .filter((def) => !(def.debordement > 0)); // un barrage ne tombe pas du ciel
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

  // ------------------------------------------------------------ la manif

  /** Des gens rejoignent la manif (recrue, sauvetage, piquet de grève). */
  addCrowd(n) {
    if (!(n > 0)) return;
    this.crowd += Math.round(n);
    bringSigns(this, n);
    syncCortege(this);
  }

  /**
   * Personne ne meurt dans la manif : une charge, un nuage de gaz ou la chute du héros en « dispersent » une part.
   * `reason` dit pourquoi (voir l'événement `dispersed`), `at` où ({ x, y }). Renvoie le nombre de dispersés.
   */
  disperse(share, reason = 'charge', at = null) {
    if (!(share > 0)) return 0;
    return this.loseCrowd(Math.max(1, Math.round(this.crowd * share)), reason, at);
  }

  /**
   * La manif perd `n` personnes : dispersées, gazées, touchées ou interpellées.
   * Avec un cortège, il reste toujours au moins une personne. Renvoie le nombre de partis.
   */
  loseCrowd(n, reason = 'charge', at = null) {
    const floor = this.level.cortege ? 1 : 0;
    const lost = Math.min(this.crowd - floor, Math.round(n));
    if (!(lost > 0)) return 0;
    // Ceux qu'on ne dessinera plus : le client les fait partir en courant.
    const gone = this.cortege.slice(visibleCortege(this.crowd - lost)).slice(0, 6).map((m) => ({ x: m.x, y: m.y, facing: m.facing }));
    this.crowd -= lost;
    this.stats.dispersed += lost;
    syncCortege(this);
    const { hero } = this;
    const where = at ?? this.cortege[0] ?? { x: hero.x + hero.w / 2, y: hero.y };
    this.emit('dispersed', { n: lost, crowd: this.crowd, reason, x: where.x, y: where.y, gone });
    return lost;
  }

  /** Le nombre fait la force : multiplicateur des dégâts des projectiles du héros (1 quand il est seul). */
  power() {
    return 1 + Math.log10(1 + this.crowd) / 2;
  }

  /** Signale une découverte (personnage, mot, panneau…) : une seule fois par partie. */
  discover(kind, id, more = {}) {
    const key = `${kind}:${id}`;
    if (!id || this.discovered.has(key)) return;
    this.discovered.add(key);
    this.emit('discover', { kind, id, ...more });
  }

  /**
   * Les lignes qui tiennent et les véhicules sont pleins pour le héros : on l'écarte du côté où il se trouve.
   * Une ligne barre aussi le passage au-dessus d'elle (LINE_REACH) : on ne la saute pas, on la déborde.
   */
  blockHero() {
    const { hero, world } = this;
    if (hero.dead) return;
    for (const e of this.enemies) {
      if (e.state === 'done' || !sturdy(e)) continue;
      const top = e.blocking ? e.y - LINE_REACH : e.y;
      if (hero.x >= e.x + e.w || hero.x + hero.w <= e.x || hero.y >= e.y + e.h || hero.y + hero.h <= top) continue;
      // On l'écarte du côté où il se trouve ; si un mur l'en empêche, de l'autre ; coincé des deux côtés, on ne l'écrase pas.
      const sides = hero.x + hero.w / 2 < e.x + e.w / 2 ? [e.x - hero.w, e.x + e.w] : [e.x + e.w, e.x - hero.w];
      const x = sides.find((side) => !hitsSolid(world, side, hero.y, hero.w, hero.h));
      if (x === undefined) continue;
      hero.x = x;
      hero.vx = 0;
      if (e.def.debordement > 0 && e.nag <= 0) {
        e.nag = NAG;
        const need = e.def.debordement;
        // Jamais d'impasse : devant une ligne qui tient, des passants rejoignent la manif, peu à peu.
        // Si elle n'a pas grossi depuis (gazée, interpellée pendant qu'elle attend), il en vient deux fois plus,
        // puis quatre fois… : aucune perte ne peut la tenir indéfiniment sous le nombre voulu.
        let joined = 0;
        if (this.crowd < need) {
          e.boost = this.crowd > (e.best ?? -1) ? 1 : Math.min(PASSERS_BOOST, (e.boost || 1) * 2);
          e.best = Math.max(e.best ?? -1, this.crowd);
          const base = Math.ceil(need * PASSERS);
          joined = Math.max(base, Math.min(need - this.crowd, base * e.boost));
          this.addCrowd(joined);
        }
        this.emit('blocked', {
          x: e.x + e.w / 2, y: e.y, feet: hero.y + hero.h, need, crowd: this.crowd, joined,
          dir: Math.sign(hero.x + hero.w / 2 - (e.x + e.w / 2)) || -1, // de quel côté de la ligne est le héros
        });
      }
    }
  }
}

/** Couleur dominante d'une tuile (pour ses éclats) : le caractère au centre de son dessin. */
function tileColor(def) {
  const c = def.sprites?.image?.[8]?.[8];
  return c && c !== '.' ? c : 'g';
}
