// Rendu : lit l'état d'une partie (src/sim/game.js) et le dessine. Ne modifie jamais la simulation.
//
// Deux calques superposés : `canvas` en basse résolution (pixels nets, agrandis en CSS)
// et `textCanvas` en pleine résolution pour les textes du monde (pancartes, mots, bulles).

import { crown, hand, seated, sprite } from './sprites.js';
import { withKeys } from './input.js';

const TILE = 16;
export const SIGN_LINGER = 1.6; // secondes pendant lesquelles un panneau dépassé reste lisible, en s'effaçant
const FONT = "Impact, Haettenschweiler, 'Arial Narrow Bold', 'HelveticaNeue-CondensedBlack', 'Roboto Condensed', sans-serif";
export const SKIES = {
  campagne: ['#6fc4ee', '#d5f0f7'],
  ville: ['#8ea2c0', '#e3e6ee'],
  citadelle: ['#2b1741', '#b13e53'],
};
const MAX_PARTICLES = 260;
// Ce qu'on lit au-dessus du héros touché : par quoi.
const HURT_WORDS = { gaz: 'GAZÉ', charge: 'CHARGÉ', contact: 'BOUSCULÉ' };
// Ce qu'on lit quand la manif perd du monde : pourquoi (au singulier, au pluriel).
const LOSS_WORDS = {
  charge: ['dispersé', 'dispersés'], chute: ['dispersé', 'dispersés'], gaz: ['gazé', 'gazés'],
  interpelle: ['interpellé', 'interpellés'], touche: ['touché', 'touchés'],
};
const WARNS = new Set(['tire', 'fonce', 'charge', 'projecteur']); // les réactions qui annoncent un danger par un « ! »
const BLOOM = 0.3; // secondes pour que la fleur d'une unité hors service pousse
const MAX_FLOATERS = 4; // textes flottants à l'écran en même temps, au plus : le plus ancien s'efface
const FADE = 0.25; // secondes pour qu'un texte flottant évincé s'efface
const MIN_TEXT = 11; // taille d'un texte du monde à l'écran, en pixels CSS, au moins : lisible sur téléphone
const SIGN_UP = 1; // une pancarte levée le reste au moins une seconde…
const SIGN_DOWN = 0.5; // … et une pancarte baissée attend une demi-seconde avant de se relever
const NEAR_HERO = 14; // un manifestant plus près que cela du héros passe en transparence
const REC = '● REC'; // le cadre de la caméra l'affiche déjà : pas de bulle en double
const SIGN_TURN = 6; // secondes d'un tour : les porteurs lèvent leur pancarte à tour de rôle…
const SIGN_FRESH = 3; // secondes pendant lesquelles une pancarte qui vient d'arriver reste levée, hors de son tour
const SIGN_SHARE = 2; // … un tour sur deux chacun : la moitié des pancartes levées à la fois, toutes à leur tour
const SLOGAN_GAP = 3; // secondes entre deux slogans de recrues : les autres recrues rejoignent sans crier
const PROP_FLOOR = 7 * TILE; // « GARDE À VUE », « PIQUET DE GRÈVE » : écrits pour un accessoire à l'étage du héros (à 7 tuiles près)
// L'étiquette d'un accessoire : son texte, son style, sa hauteur au-dessus de lui (« GARDE À VUE » : écrite seulement à son étage).
const TAGS = {
  cage: { text: 'GARDE À VUE', dy: -8, opts: { size: 4.5, color: '#f4f4f4', bg: '#333c57' } },
  piquet: { text: 'PIQUET DE GRÈVE', dy: -8, opts: { size: 4.5, color: '#1a1c2c', bg: '#f6c21c' } },
  sortie: { text: 'SORTIE ▶', dy: -9, opts: { size: 6, color: '#1a1c2c', bg: '#f6c21c' } },
};
const TAG_OUT = 96; // pixels au-delà du bord de l'image : une étiquette écrite y sort avec son accessoire, puis s'oublie
/**
 * Une étiquette couvre-t-elle un dessin de plus de deux pixels dans les deux sens ? `box` : sa boîte de texte (`textBox`),
 * dont son fond dessiné laisse un pixel de chaque côté, un en haut et deux en bas.
 */
const covers = (box, art) => Math.min(box.x1 - 1, art.x1) - Math.max(box.x0 + 1, art.x0) > 2
  && Math.min(box.y1 - 2, art.y1) - Math.max(box.y0 + 1, art.y0) > 2;
const GROUP = { x: 40, y: 24 }; // des unités identiques aussi proches font un groupe : un seul « ! », un seul « KOF ! »
const SAFE_TOP = 100; // pixels CSS en haut de l'écran laissés au HUD, au moins (bandeau au pouce, barre de vie du boss) ; plus s'il descend plus bas

export class Renderer {
  constructor(canvas, textCanvas, bundle) {
    this.canvas = canvas;
    this.textCanvas = textCanvas;
    this.ctx = canvas.getContext('2d');
    this.tctx = textCanvas.getContext('2d');
    this.bundle = bundle;
    this.palette = bundle.palette;
    this.bySymbol = Object.fromEntries(Object.values(bundle.tuiles).map((t) => [t.symbole, t]));
    this.cam = { x: 0, y: 0 };
    this.viewW = 384;
    this.viewH = 216;
    this.scale = 2;
    this.ratio = 3; // pixels CSS par pixel du monde (3 sur ordinateur, 5/3 sur téléphone)
    this.hudBottom = 0; // où descend le HUD, en pixels CSS depuis le haut (main.js le mesure)
    this.groups = new Map(); // à chaque image, où chaque genre de texte a déjà été écrit pour un groupe d'unités (`first`)
    this.lastSlogan = -Infinity;
    this.propSay = new WeakMap(); // accessoire en entier dans l'image → son étiquette est-elle écrite (muette → écrite, jamais l'inverse)
    this.propSpot = new WeakMap(); // accessoire → { dx, dy } : son étiquette, écartée d'une gêne, tant qu'il est à l'écran (`placeTags`)
    this.layout = null; // où s'écrit l'étiquette de chaque accessoire du niveau (`tagLayout`)
    this.propHidden = new WeakSet(); // accessoires cachés sous la bande du HUD : sans étiquette tant qu'ils n'en sont pas sortis
    this.held = new WeakMap(); // porteur de pancarte du cortège → { up, since, label } : levée ou baissée, depuis quand
    this.raised = new Set(); // les porteurs dont la pancarte est levée à cette image
    this.particles = [];
    this.floaters = [];
    this.runners = []; // manifestants qui quittent la manif en courant (dispersés, interpellés)
    this.rings = []; // le « pop » d'une unité qui passe hors service
    this.flowers = []; // [x, y, poussée] : la fleur de chaque unité hors service à cette image
    this.hurt = null; // { t, hp, max } : le héros vient d'être touché (ce qu'il lui reste s'affiche au-dessus de lui)
    this.edge = 0; // liseré rouge autour de l'image quand le héros est touché
    this.lastParry = -1;
    this.watch = new WeakMap(); // état précédent de chaque unité, pour le « ! » quand elle repère le héros
    this.shake = 0;
    this.reduced = false;
    this.anchor = 0.62; // hauteur des pieds du héros à l'écran (0 = haut, 1 = bas) : on voit ce qu'il y a sous terre
    this.demo = false; // démo du menu : pas de panneaux par-dessus le titre
    this.device = 'clavier'; // l'appareil dont les panneaux disent les touches : clavier, manette ou pouce
    this.signTop = 30; // hauteur du panneau à l'écran, en pixels du jeu (main.js la règle selon la mise en page)
    this.sign = { text: '', t: 0 }; // le dernier panneau lu, et combien de temps il reste à l'écran
    this.clock = 0;
  }

  /** Adapte la taille interne à la zone d'affichage : échelle entière, pixels nets, aucun bord perdu. */
  resize() {
    const box = this.canvas.parentElement; // sa taille de mise en page : la même quand tout l'écran pivote
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(160, Math.floor(box.clientWidth * dpr));
    const H = Math.max(120, Math.floor(box.clientHeight * dpr));
    let scale = Math.max(1, Math.min(Math.round(H / 216), Math.floor(W / 300)));
    while (H / scale > 280) scale++;
    this.scale = scale;
    this.ratio = scale / dpr;
    this.viewW = Math.ceil(W / scale);
    this.viewH = Math.ceil(H / scale);
    for (const [cvs, k] of [[this.canvas, 1], [this.textCanvas, scale]]) {
      cvs.width = this.viewW * k;
      cvs.height = this.viewH * k;
      cvs.style.width = `${(this.viewW * scale) / dpr}px`;
      cvs.style.height = `${(this.viewH * scale) / dpr}px`;
    }
    this.ctx.imageSmoothingEnabled = false;
  }

  /** Place la caméra directement sur le héros (début de niveau, reprise). */
  snap(game) {
    this.particles = [];
    this.floaters = [];
    this.runners = [];
    this.rings = [];
    this.hurt = null;
    this.edge = 0;
    this.shake = 0;
    this.sign = { text: '', t: 0 };
    const t = this.target(game);
    this.cam.x = t.x;
    this.cam.y = t.y;
  }

  target(game) {
    const { hero, world } = game;
    const maxX = Math.max(0, world.w * TILE - this.viewW);
    const maxY = world.h * TILE - this.viewH;
    const x = hero.x + hero.w / 2 - this.viewW / 2 + hero.facing * 28;
    // Quand le héros vise en haut ou en bas, la vue se décale du même côté : on voit où l'on creuse.
    const y = hero.y + hero.h - this.viewH * this.anchor + (hero.aim || 0) * this.viewH * 0.22;
    return { x: Math.min(maxX, Math.max(0, x)), y: maxY < 0 ? maxY : Math.min(maxY, Math.max(0, y)) };
  }

  // ---------------------------------------------------------------- effets (hors simulation)

  /** Transforme les événements de la simulation en particules, textes flottants et secousses. */
  absorb(events) {
    let prev = null;
    for (const e of events) {
      if (e.type === 'debris') this.burst(e.x, e.y, this.palette[e.color] || '#fff', e.n || 6, 70);
      else if (e.type === 'explosion') {
        this.burst(e.x, e.y, '#ffe08a', 14, 60 + e.r * 3);
        this.burst(e.x, e.y, '#ef7d57', 10, 40 + e.r * 2);
        this.burst(e.x, e.y, '#566c86', 8, 30 + e.r);
        this.shake = Math.max(this.shake, Math.min(9, e.r / 5));
      } else if (e.type === 'shake') this.shake = Math.max(this.shake, e.force);
      else if (e.type === 'fire') {
        this.burst(e.x, e.y - 14, '#ef7d57', 12, 70);
        this.burst(e.x, e.y - 14, '#f6c21c', 8, 50);
      } else if (e.type === 'bubble') {
        // Le slogan d'une recrue suit son « + n » : un seul toutes les SLOGAN_GAP secondes, les suivantes rejoignent sans crier.
        const slogan = prev?.type === 'recruit' && prev.x === e.x;
        if (!slogan || this.clock - this.lastSlogan >= SLOGAN_GAP) {
          if (slogan) this.lastSlogan = this.clock;
          this.float({ x: e.x, y: e.y, text: e.text, t: 1.6, color: e.color || '#f4f4f4' });
        }
      }
      else if (e.type === 'recruit') {
        this.float({ x: e.x, y: e.y - 14, text: `+ ${e.n.toLocaleString('fr-FR')}`, n: e.n, t: 1.8, color: '#f6c21c', size: 11, gain: true });
        if (e.healed) this.float({ x: e.x, y: e.y - 28, text: 'SOIGNÉ', t: 1.8, color: '#38b764', size: 9, gain: true });
        this.burst(e.x, e.y, '#f6c21c', 10, 80);
        this.burst(e.x, e.y, '#e43b44', 8, 60);
      } else if (e.type === 'heroCard' && e.x !== undefined) {
        // Un camarade libéré : une vie de plus, comme dans Broforce.
        this.float({ x: e.x, y: e.y - 10, text: '+1', t: 2.4, color: '#f6c21c', size: 20, gain: true });
        this.burst(e.x, e.y, '#f6c21c', 14, 90);
      } else if (e.type === 'overrun') {
        // La ligne cède, sa vie à zéro : le cri, des confettis, et elle s'ouvre (voir `opening`).
        // Au pouce, le haut de l'image est aux notes de déblocage : tout se dit au pied de la ligne, sans monter.
        const low = this.thumbs && e.feet;
        this.float({ x: e.x, y: low ? e.feet + 18 : e.y - 22, rise: low ? 0 : 14, text: 'ON EST LÀ !', t: 2.2, color: '#f6c21c', size: 12, keep: true }); // « On est là, même si Macron le veut pas »
        this.rings.push({ x: e.x, y: e.y + 10, t: 0.3, color: '#f6c21c' });
        this.burst(e.x, e.y, '#94b0c2', 10, 70);
        this.burst(e.x, e.y, '#f6c21c', 12, 110);
        this.burst(e.x, e.y, '#f4f4f4', 8, 90);
        this.shake = Math.max(this.shake, 5);
      } else if (e.type === 'checkpoint') {
        // Le piquet de grève rejoint la manif, et c'est d'ici qu'on repartira.
        this.float({ x: e.x + TILE / 2, y: e.y - 14, text: '+ 10', t: 1.8, color: '#f6c21c', size: 11, gain: true });
        this.float({ x: e.x + TILE / 2, y: e.y - 28, text: 'ON REPART D’ICI', t: 2.2, color: '#f4f4f4', size: 8 });
        this.burst(e.x + TILE / 2, e.y, '#f6c21c', 10, 70);
      } else if (e.type === 'respawn') {
        this.hurt = null;
      } else if (e.type === 'hurt') {
        // Le héros touché : par quoi au-dessus de lui, ce qu'il lui reste, un liseré rouge, des éclats du côté du coup.
        this.hurt = { t: 1.2, hp: e.hp, max: e.max, dir: e.kind === 'gaz' ? 0 : e.dir };
        this.edge = 0.35;
        this.float({ x: e.x, y: e.y - 16, text: HURT_WORDS[e.kind] || 'TOUCHÉ', t: 1, color: '#e43b44', size: 8, keep: true });
        this.burst(e.x - e.dir * 4, e.y + 8, '#f4f4f4', 6, 70); // des éclats blancs et jaunes : rien qui ressemble à du sang
        this.burst(e.x - e.dir * 4, e.y + 8, '#f6c21c', 6, 50);
      } else if (e.type === 'parry') {
        // Paré : des étincelles sur le bouclier ; on le dit une fois de temps en temps, pas à chaque tract.
        this.burst(e.x, e.y, '#f4f4f4', 4, 60);
        this.burst(e.x, e.y, '#94b0c2', 3, 40);
        if (!e.line && this.clock - this.lastParry > 0.8) {
          this.lastParry = this.clock;
          this.float({ x: e.x, y: e.y - 6, text: 'PARÉ', t: 0.8, color: '#f4f4f4', size: 6.5 });
        }
      } else if (e.type === 'down') {
        this.rings.push({ x: e.x, y: e.y, t: 0.3, color: e.end === 'greve' ? '#f6c21c' : '#f4f4f4' });
        this.burst(e.x, e.y, e.end === 'greve' ? '#f6c21c' : '#94b0c2', 8, 80);
      } else if (e.type === 'dispersed') {
        // La manif perd du monde : combien et pourquoi, au même style que les « + 20 », et ceux qui s'en vont.
        const [one, many] = LOSS_WORDS[e.reason] || LOSS_WORDS.charge;
        // Hors de l'image (la queue du cortège) : le texte attend au bord de l'écran, avec une flèche (voir `combatBefore`).
        // Une perte de plus, pour la même raison et au même endroit, s'ajoute au même texte : « − 19 gazés », pas deux.
        const loss = (n) => `− ${n.toLocaleString('fr-FR')} ${n > 1 ? many : one}`;
        const same = this.floaters.find((g) => g.reason === e.reason && g.t > FADE && Math.abs(g.wx - e.x) < 120);
        if (same) Object.assign(same, { lost: same.lost + e.n, t: Math.max(same.t, 1.8) }, { base: loss(same.lost + e.n), text: loss(same.lost + e.n) });
        else this.float({ x: e.x, y: e.y - 8, wx: e.x, edge: true, reason: e.reason, lost: e.n, text: loss(e.n), t: 1.8, color: '#e43b44', size: 9, keep: true });
        for (const m of e.gone || []) {
          const dir = e.reason === 'interpelle' ? Math.sign(e.x - m.x) || 1 : Math.sign(m.x - e.x) || -m.facing || 1;
          this.runners.push({ x: m.x, y: m.y, dir, t: 0.9, n: this.runners.length });
        }
      }
      prev = e;
    }
  }

  /**
   * Un texte flottant naît : deux gains au même endroit font un seul nombre, un texte déjà là ne se répète pas
   * (il dure un peu plus), et il n'en reste jamais plus de MAX_FLOATERS à la fois : le plus ancien s'efface.
   * Un texte `keep` (ce que dit un coup, une ligne qui cède) n'est jamais évincé, et garde la place qu'on lui a donnée.
   * La place des autres se règle au dessin (`placeFloaters`).
   */
  float(f) {
    f.size ??= 7;
    f.born = this.clock;
    const near = (g) => g.t > FADE && Math.abs(g.x - f.x) < 60 && Math.abs(g.y - f.y) < 40;
    if (f.n !== undefined) {
      const twin = this.floaters.find((g) => g.n !== undefined && near(g) && this.clock - g.born < 0.6);
      if (twin) {
        twin.n += f.n;
        twin.text = `+ ${twin.n.toLocaleString('fr-FR')}`;
        twin.t = Math.max(twin.t, f.t);
        return;
      }
    }
    const same = this.floaters.find((g) => g.text === f.text && near(g));
    if (same) {
      same.t = Math.max(same.t, f.t);
      return;
    }
    this.floaters.push(f);
    const alive = this.floaters.filter((g) => g.t > FADE);
    const loose = alive.filter((g) => !g.keep);
    // Un gain (« + 20 », « +1 », « SOIGNÉ ») passe après un slogan ou un nom de spéciale : on le lit en premier.
    const out = loose.find((g) => !g.gain) ?? loose[0];
    if (alive.length > MAX_FLOATERS && out) out.t = FADE;
  }

  burst(x, y, color, n, speed) {
    for (let i = 0; i < n && this.particles.length < MAX_PARTICLES; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, t: 0.35 + Math.random() * 0.5, color, s: Math.random() < 0.3 ? 2 : 1 });
    }
  }

  tick(dt) {
    this.clock += dt;
    this.shake = Math.max(0, this.shake - dt * 22);
    for (const p of this.particles) {
      p.t -= dt;
      p.vy += 420 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.t > 0);
    for (const f of this.floaters) {
      f.t -= dt;
      f.y -= (f.rise ?? 14) * dt;
    }
    this.floaters = this.floaters.filter((f) => f.t > 0);
    for (const r of this.runners) {
      r.t -= dt;
      r.x += r.dir * 70 * dt;
    }
    this.runners = this.runners.filter((r) => r.t > 0);
    for (const r of this.rings) r.t -= dt;
    this.rings = this.rings.filter((r) => r.t > 0);
    if (this.hurt && (this.hurt.t -= dt) <= 0) this.hurt = null;
    this.edge = Math.max(0, this.edge - dt);
  }

  // ---------------------------------------------------------------- dessin

  draw(game, dt = 1 / 60) {
    const { ctx, tctx } = this;
    const goal = this.target(game);
    this.cam.x += (goal.x - this.cam.x) * Math.min(1, dt * 9);
    this.cam.y += (goal.y - this.cam.y) * Math.min(1, dt * 7);
    const jolt = this.reduced ? 0 : this.shake;
    const cx = Math.round(this.cam.x + (Math.random() - 0.5) * jolt);
    const cy = Math.round(this.cam.y + (Math.random() - 0.5) * jolt);
    this.cx = cx;
    this.cy = cy;

    this.background(game.level?.fond || 'campagne', cx, cy);
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, this.textCanvas.width, this.textCanvas.height);
    tctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);

    this.heroBox = game.hero;
    this.boxes = []; // les pancartes déjà posées à cette image : aucune ne recouvre l'autre
    this.groups.clear();
    this.backRows = game.level?.murs;
    this.backWalls(game, cx, cy);
    for (const d of game.decors) if (!this.bundle.decors[d.id]?.devant) this.decor(d);
    for (const e of game.enemies) if (e.beam) this.beam(e);
    this.tiles(game.world, cx, cy);
    // Le panneau lu, les écritures des décors (déjà réservées), puis les étiquettes des accessoires : chacun a sa place,
    // aucun ne recouvre l'autre, et les pancartes du cortège passent autour.
    const board = this.signBoard(game, dt);
    if (board) this.boxes.push(board.box);
    this.placeTags(game.props.map((p) => this.prop(p)).filter(Boolean), game.props);
    const gains = this.boxes.length;
    for (const r of game.recruits || []) this.recruit(r);
    // Une seule voix à la fois : une sommation d'abord (le danger arrive), sinon la plus proche.
    const warns = (e) => (e.rush?.phase === 'sommation' ? 1 : 0);
    const talker = game.enemies.filter((e) => e.bubble && e.state !== 'done' && e.bubble.text !== REC)
      .sort((a, b) => warns(b) - warns(a) || Math.abs(a.x - game.hero.x) - Math.abs(b.x - game.hero.x))[0];
    // Rien ne la recouvre : ni texte flottant, ni pancarte du cortège.
    this.voice = talker ? this.textBox(talker.bubble.text, talker.x + talker.w / 2 - cx, talker.y - 10 - cy, 5.5, 80) : null;
    if (this.voice) this.boxes.push(this.voice);
    this.combatBefore(game); // les coups se lisent : les pancartes du cortège s'effacent devant eux
    // La bulle du boss a sa place avant les textes flottants et les pancartes : ils passent autour d'elle.
    this.bossSay = this.bossBubble(game.boss);
    if (this.bossSay) this.boxes.push(this.bossSay.box);
    const fixed = this.boxes.slice(gains); // gains des recrues, voix, coups : les textes flottants passent autour
    if (board) fixed.push(board.box); // et autour du panneau lu
    // Le héros se lit au premier coup d'œil : aucune pancarte ne se lève devant lui ni juste au-dessus de sa tête.
    const { hero } = game;
    if (!hero.dead) this.boxes.push({ x0: hero.x - 3 - cx, x1: hero.x + hero.w + 3 - cx, y0: hero.y - 8 - cy, y1: hero.y + hero.h - cy });
    this.placeFloaters(fixed);
    this.raiseSigns(game.cortege);
    game.cortege.forEach((m, i) => this.marcher(m, i));
    for (const e of game.enemies) this.enemy(e, e === talker);
    this.combatMiddle(); // ceux qui quittent la manif ou la rejoignent
    if (game.boss) this.boss(game.boss);
    this.hero(game.hero);
    for (const p of game.projectiles) this.projectile(p);
    for (const c of game.clouds) this.cloud(c);
    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - cx), Math.round(p.y - cy), p.s, p.s);
    }
    this.combatAfter(); // larmes par-dessus le gaz, fleurs et « pop » des unités hors service, liseré du coup reçu
    for (const d of game.decors) if (this.bundle.decors[d.id]?.devant) this.decor(d);

    for (const f of this.floaters) {
      this.label(f.text, f.x - cx, f.y - cy, { size: f.size || 7, color: f.color, bg: f.bg, alpha: Math.min(1, f.t * 2), width: 150 });
    }
    if (board) this.board(board.text, this.viewW / 2, board.y, { alpha: Math.min(1, this.sign.t * 2) });
  }

  /**
   * Le panneau devant lequel on passe, avec les touches de l'appareil en cours ; dépassé, il reste lisible un instant.
   * Un panneau long passe à la ligne vers le bas : il ne monte jamais sur le HUD. Rend son texte, sa place et sa boîte.
   */
  signBoard(game, dt) {
    if (game.sign) this.sign = { text: game.sign, t: SIGN_LINGER };
    else this.sign.t = Math.max(0, this.sign.t - dt);
    if (this.sign.t <= 0 || this.demo) return null;
    const text = withKeys(this.sign.text, this.device);
    const lines = this.wrap(text, 7, 190).length;
    const y = this.signTop + (lines - 1) * 7 * 1.1;
    return { text, y, box: this.textBox(text, this.viewW / 2, y, 7, 190) };
  }

  // ---------------------------------------------------------------- les coups, lisibles

  /** Avant le cortège : ce qui dit un coup garde sa place ; les pancartes s'effacent devant. */
  combatBefore(game) {
    const { cx, cy } = this;
    const { hero } = game;
    this.thumbs = document.body.classList.contains('tactile');
    this.weepers = []; // les gazés : leurs larmes passent par-dessus le nuage (voir `combatAfter`)
    this.flowers = []; // les fleurs des unités hors service : par-dessus leur fumée (voir `combatAfter`)
    // Une perte hors de l'image : son texte se pose au bord, du côté où elle a eu lieu, avec une flèche.
    for (const f of this.floaters) {
      if (!f.edge) continue;
      f.base ??= f.text;
      this.tctx.font = `${f.size || 7}px ${FONT}`;
      const half = this.tctx.measureText(`◀ ${f.base}`).width / 2 + 4;
      const side = f.wx < cx + half ? -1 : f.wx > cx + this.viewW - half ? 1 : 0;
      f.x = Math.max(cx + half, Math.min(cx + this.viewW - half, f.wx));
      f.y = Math.max(cy + 40, Math.min(cy + this.viewH - 30, f.y));
      f.text = side < 0 ? `◀ ${f.base}` : side > 0 ? `${f.base} ▶` : f.base;
    }
    for (const f of this.floaters) if (f.keep) this.reserve(f.text, f.x - cx, f.y - cy, f.size || 7, 150);
    if (this.hurt && !hero.dead) this.reserve('■ ■ ■', hero.x + hero.w / 2 - cx, hero.y - 14 - cy, 7, 0);
  }

  /** Après les unités : les manifestants qui s'en vont ou accourent. */
  combatMiddle() {
    for (const r of this.runners) this.runner(r);
  }

  /** Par-dessus tout le reste du monde. */
  combatAfter() {
    for (const [e, x, top] of this.weepers) this.tears(e, x, top);
    for (const [x, y, grown] of this.flowers) this.flower(x, y, grown);
    for (const r of this.rings) this.ring(r);
    if (this.edge > 0) this.redEdge();
  }

  background(kind, cx, cy) {
    const { ctx, viewW: W, viewH: H } = this;
    const [top, bottom] = SKIES[kind] || SKIES.campagne;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, top);
    sky.addColorStop(1, bottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    const horizon = Math.round(H * 0.72 - cy * 0.15);
    if (kind === 'campagne') {
      // Collines du Limousin, en deux plans.
      for (const [speed, color, amp, base] of [[0.15, '#8fd19e', 22, 0], [0.3, '#5fb37a', 16, 26]]) {
        ctx.fillStyle = color;
        for (let x = 0; x < W; x += 2) {
          const wx = x + cx * speed;
          const h = Math.sin(wx / 61) * amp + Math.sin(wx / 23) * amp * 0.35;
          ctx.fillRect(x, horizon + base - h, 2, H);
        }
      }
    } else {
      // Immeubles (ville) ou tours du luxe (citadelle).
      const tower = kind === 'citadelle';
      for (const [speed, color, lit, unit] of tower
        ? [[0.12, '#4a2152', '#f6c21c', 46], [0.28, '#33173f', '#ffe08a', 64]]
        : [[0.12, '#aab6cc', '#e3e6ee', 38], [0.28, '#7d8aa6', '#ffe08a', 52]]) {
        const first = Math.floor((cx * speed) / unit) - 1;
        for (let i = first; i < first + W / unit + 3; i++) {
          const seed = Math.abs(Math.sin(i * 12.9898 + unit) * 43758.5453) % 1;
          const bw = unit - 6;
          const bh = 40 + seed * (tower ? 120 : 70);
          const x = Math.round(i * unit - cx * speed);
          ctx.fillStyle = color;
          ctx.fillRect(x, horizon + 30 - bh, bw, H);
          ctx.fillStyle = lit;
          for (let wy = horizon + 36 - bh; wy < H; wy += 9) {
            for (let wx = x + 4; wx < x + bw - 4; wx += 7) {
              if ((Math.sin(wx * 3.1 + wy * 7.7 + i) + 1) / 2 > 0.62) ctx.fillRect(wx, wy, 3, 4);
            }
          }
        }
      }
    }
  }

  /** Les murs du fond (section « --- murs » du niveau) : assombris, sans collision. */
  backWalls(game, cx, cy) {
    const rows = game.level?.murs;
    if (!rows?.length) return;
    const { world } = game;
    const x0 = Math.max(0, Math.floor(cx / TILE));
    const y0 = Math.max(0, Math.floor(cy / TILE));
    const x1 = Math.min(world.w - 1, Math.floor((cx + this.viewW) / TILE));
    const y1 = Math.min(rows.length - 1, Math.floor((cy + this.viewH) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const def = this.bySymbol[rows[ty][tx]];
        if (def && !world.tiles[ty * world.w + tx]) {
          this.ctx.drawImage(sprite(def.sprites.image, this.palette, false, false, true), tx * TILE - cx, ty * TILE - cy);
        }
      }
    }
  }

  tiles(world, cx, cy) {
    const { ctx } = this;
    const back = this.backRows;
    const x0 = Math.max(0, Math.floor(cx / TILE));
    const y0 = Math.max(0, Math.floor(cy / TILE));
    const x1 = Math.min(world.w - 1, Math.floor((cx + this.viewW) / TILE));
    const y1 = Math.min(world.h - 1, Math.floor((cy + this.viewH) / TILE));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const index = world.tiles[ty * world.w + tx];
        if (!index) continue;
        const def = world.defs[index];
        const x = tx * TILE - cx;
        const y = ty * TILE - cy;
        ctx.drawImage(sprite(def.sprites.image, this.palette), x, y);
        // L'herbe ne pousse qu'à ciel ouvert : pas au fond d'une cave (là où il y a un mur du fond au-dessus).
        const cellar = back?.[ty - 1]?.[tx] && back[ty - 1][tx] !== '.';
        if (def.id === 'terre' && !cellar && (ty === 0 || !world.tiles[(ty - 1) * world.w + tx])) {
          ctx.fillStyle = '#38b764';
          ctx.fillRect(x, y, TILE, 3);
          ctx.fillStyle = '#a7f070';
          ctx.fillRect(x + ((tx * 7) % 11), y, 2, 1);
          ctx.fillRect(x + ((tx * 5) % 13), y + 1, 1, 1);
        }
        const hp = world.hp[ty * world.w + tx];
        if (def.pv > 1 && hp < def.pv) {
          // Fissures : plus la tuile est abîmée, plus elles s'étendent.
          ctx.fillStyle = 'rgb(26 28 44 / .55)';
          const cracks = Math.ceil((1 - hp / def.pv) * 5);
          for (let k = 0; k < cracks; k++) {
            ctx.fillRect(x + 2 + ((k * 5 + tx * 3) % 11), y + 2 + ((k * 7 + ty) % 9), 1, 4);
            ctx.fillRect(x + 3 + ((k * 5 + tx * 3) % 11), y + 5 + ((k * 7 + ty) % 9), 3, 1);
          }
        }
      }
    }
  }

  /**
   * Dessine un sprite posé au sol, centré sur la boîte de collision de son acteur. `dim` : assombri (vrai), ou apaisé
   * (`'calm'`). Rend le coin haut gauche du dessin à l'écran, ou null s'il est hors de l'image.
   */
  actor(a, rows, { flip = a.facing < 0, flash = false, alpha = 1, dx = 0, dy = 0, dim = false } = {}) {
    if (!rows) return null;
    const img = sprite(rows, this.palette, flip, flash, flash ? false : dim);
    const x = Math.round(a.x + a.w / 2 - img.width / 2 - this.cx + dx);
    const y = Math.round(a.y + a.h - img.height - this.cy + dy);
    if (x > this.viewW || y > this.viewH || x + img.width < 0 || y + img.height < 0) return null;
    if (alpha !== 1) this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(img, x, y);
    if (alpha !== 1) this.ctx.globalAlpha = 1;
    return { x, y };
  }

  frames(sprites, moving, time, rate = 9) {
    if (!moving) return sprites.repos;
    return (Math.floor(time * rate) % 2 ? sprites.marche2 : sprites.marche1) || sprites.marche1 || sprites.repos;
  }

  hero(h) {
    if (h.dead) return;
    const s = h.def.sprites;
    const rows = h.anim === 'saut' ? s.saut || s.marche1 || s.repos : this.frames(s, h.anim === 'marche', h.animTime);
    for (const c of h.clones || []) this.actor(c, rows, { flip: c.facing < 0, alpha: 0.55 });
    // Touché : blanc un instant, puis il pâlit et revient, lentement, tant qu'il ne craint rien. Il ne disparaît jamais.
    // Effets réduits : il reste pâle, sans clignoter, et ne sursaute pas.
    const safe = h.flash <= 0 && h.invuln > 0;
    const pale = safe && (this.reduced || Math.floor(this.clock * 7) % 2);
    // Et son dessin recule de quelques pixels, à l'opposé du coup, avec un petit sursaut, le temps d'un quart de seconde.
    const jolt = this.hurt && !this.reduced ? Math.max(0, this.hurt.t - 0.95) / 0.25 : 0;
    const dx = Math.round((this.hurt?.dir || 0) * 4 * jolt);
    const dy = -Math.round(3 * Math.sin(jolt * Math.PI));
    this.actor(h, rows, { flash: h.flash > 0, alpha: pale ? (this.reduced ? 0.6 : 0.4) : 1, dx, dy });
    if (this.hurt) this.pips(h, rows.length);
  }

  /** Ce qu'il reste au héros qui vient d'être touché : un carré par coup encaissable, le dernier perdu clignote. */
  pips(h, height) {
    const { ctx } = this;
    const { hp, max } = this.hurt;
    const size = 3;
    const width = max * (size + 1) - 1;
    const x0 = Math.round(h.x + h.w / 2 - width / 2 - this.cx);
    const y0 = Math.round(h.y + h.h - height - 6 - this.cy);
    ctx.fillStyle = '#1a1c2c';
    ctx.fillRect(x0 - 1, y0 - 1, width + 2, size + 2);
    for (let i = 0; i < max; i++) {
      const lost = i >= hp;
      if (lost && i === hp && !this.reduced && Math.floor(this.clock * 10) % 2) continue; // celui qu'on vient de perdre clignote
      ctx.fillStyle = lost ? '#e43b44' : '#38b764';
      if (lost && i > hp) ctx.fillStyle = '#566c86';
      ctx.fillRect(x0 + i * (size + 1), y0, size, size);
    }
  }

  enemy(e, speaks = false) {
    const s = e.def.sprites;
    const cx = e.x + e.w / 2 - this.cx;
    if (e.state === 'done') {
      // Une ligne cassée s'ouvre (voir `opening`) ; les autres posent les armes (voir `down`).
      if (e.overrun) {
        this.opening(e, s.fin || s.repos);
        return;
      }
      this.down(e);
      if (e.def.fin === 'panne' && Math.floor(this.clock * 3 + e.x) % 3 === 0) this.burst(e.x + e.w / 2, e.y, '#94b0c2', 1, 12);
      return;
    }
    const moving = e.state === 'patrol' || e.state === 'alert' || e.def.deplacement === 'vol';
    if (e.rope) this.line(e.rope.x, e.rope.y, e.x + e.w / 2, e.y, '#1a1c2c');
    if (e.jet) this.jet(e.jet);
    // Un plateau de télé ne se retourne pas : son enseigne resterait à l'envers.
    const set = e.def.deplacement === 'fixe' && e.def.reaction === 'cadre';
    const stunned = e.state === 'stunned';
    const rows = this.frames(s, moving && !stunned, e.animTime, e.def.deplacement === 'vol' ? 14 : 7);
    // Touché : blanc, et le dessin recule d'un pixel ou deux dans le sens du coup. Gazé : il tousse, il tremble.
    const still = this.reduced; // effets réduits : le blanc suffit, le dessin ne bouge pas
    const flinch = e.flash > 0 && !still ? (e.hitDir || 0) * (e.flash > 0.06 ? 2 : 1) : 0;
    const cough = !still && stunned && e.daze === 'gaz' && Math.floor(this.clock * 12 + e.x) % 3 === 0 ? 1 : 0;
    const shoved = !still && e.push > 0 && Math.floor(this.clock * 16) % 2 ? 1 : 0; // une ligne que la manif pousse tremble
    this.actor(e, rows, { flash: e.flash > 0, dx: flinch + cough + shoved, ...(set && { flip: false }) });
    const top = e.y + e.h - (rows?.length || e.h) - this.cy;
    if (e.aim) this.aim(e);
    if (e.rush?.phase === 'ruee') {
      this.ctx.fillStyle = '#f4f4f4';
      for (let k = 0; k < 3; k++) this.ctx.fillRect(Math.round(e.x + (e.facing > 0 ? -8 - k * 5 : e.w + 4 + k * 5) - this.cx), Math.round(e.y + 3 + k * 5 - this.cy), 4, 1);
    }
    // Une ligne (`ligne.vie`) : sa vie est dans la barre du haut, comme celle du boss (voir ui.js).
    if (!(e.def.ligne?.vie > 0) && e.hp < e.def.pv && e.hp > 0) this.gauge(e, cx, top - 5);
    if (stunned && e.daze === 'gaz') this.weepers.push([e, cx, top]); // dessinés par-dessus le nuage qui les a gazés
    else if (stunned) this.stars(e, cx, top);
    else this.warn(e, cx, top);
    if (e.def.reaction === 'cadre' && e.state === 'alert' && (!e.film || e.framing)) this.viewfinder(e);
    if (speaks) this.label(e.bubble.text, cx, e.y - 10 - this.cy, { size: 5.5, color: '#1a1c2c', bg: '#f4f4f4', width: 80 });
  }

  /**
   * Une unité hors service : rien d'écrit au-dessus d'elle, le dessin suffit. Son dessin de fin, sinon le sien, apaisé,
   * presque gris ; en grève, elle s'assoit en tailleur ; et une petite fleur pousse : assise, dans sa main ; sinon,
   * plantée sur elle.
   */
  down(e) {
    const s = e.def.sprites;
    const rows = s.fin || s.repos;
    const sit = e.def.fin === 'greve' ? seated(rows) : null;
    const drawn = sit || rows;
    // Un plateau de télé ne se retourne pas, hors service non plus : son enseigne resterait à l'envers.
    const flip = e.def.deplacement === 'fixe' && e.def.reaction === 'cadre' ? false : e.facing < 0;
    const at = this.actor(e, drawn, { flip, flash: e.flash > 0, dim: !s.fin && 'calm' });
    const seen = this.watch.get(e) ?? { state: e.state, at: -9 };
    seen.down ??= this.clock;
    this.watch.set(e, seen);
    if (!at) return;
    const spot = (sit && hand(drawn)) || crown(drawn);
    const x = flip ? drawn[0].length - 1 - spot.x : spot.x;
    this.flowers.push([at.x + x, at.y + spot.y - 1, this.reduced ? 1 : (this.clock - seen.down) / BLOOM]);
  }

  /** Une marguerite de cinq pixels de haut, le pied de la tige en (x, y) : la tige d'abord, puis la corolle (`grown` de 0 à 1). */
  flower(x, y, grown = 1) {
    const { ctx } = this;
    if (grown <= 0) return;
    ctx.fillStyle = '#38b764';
    ctx.fillRect(x, y - 1, 1, 2);
    if (grown < 1) return;
    ctx.fillRect(x + 1, y, 1, 1); // une feuille
    ctx.fillStyle = '#f4f4f4';
    ctx.fillRect(x - 1, y - 3, 3, 1);
    ctx.fillRect(x, y - 4, 1, 3);
    ctx.fillStyle = '#f6c21c';
    ctx.fillRect(x, y - 3, 1, 1);
  }

  /**
   * Une ligne cassée s'ouvre : une grille ou un barrage s'écarte en deux et s'efface, laissant son dessin de fin ;
   * un blindé recule et s'éteint.
   */
  opening(e, rows) {
    const { ctx } = this;
    const seen = this.watch.get(e) ?? { state: e.state, at: -9 };
    seen.opened ??= this.clock;
    // Le sens du recul se décide une fois, quand elle cède : elle ne saute pas d'un côté à l'autre quand le héros la dépasse.
    seen.away ??= Math.sign(e.x + e.w / 2 - (this.heroBox.x + this.heroBox.w / 2)) || 1;
    this.watch.set(e, seen);
    const k = Math.min(1, (this.clock - seen.opened) / 0.6);
    const ease = 1 - (1 - k) ** 2;
    const standing = sprite(e.def.sprites.repos, this.palette, e.facing < 0);
    const x = Math.round(e.x + e.w / 2 - standing.width / 2 - this.cx);
    const y = Math.round(e.y + e.h - standing.height - this.cy);
    if (x > this.viewW + 40 || x + standing.width < -40) return;
    if (e.def.deplacement !== 'fixe') {
      ctx.drawImage(sprite(rows, this.palette, e.facing < 0, false, !e.def.sprites.fin), x + Math.round(ease * 18 * seen.away), y);
      return;
    }
    if (ease > 0) this.actor(e, rows, { alpha: ease, dim: !e.def.sprites.fin });
    if (k >= 1) return;
    ctx.globalAlpha = 1 - ease;
    const half = Math.floor(standing.width / 2);
    const gap = Math.round(ease * (half + 6));
    ctx.drawImage(standing, 0, 0, half, standing.height, x - gap, y, half, standing.height);
    ctx.drawImage(standing, half, 0, standing.width - half, standing.height, x + half + gap, y, standing.width - half, standing.height);
    ctx.globalAlpha = 1;
  }

  /** La vie qui reste à une unité déjà touchée : une jauge courte au-dessus d'elle. */
  gauge(e, cx, y) {
    const { ctx } = this;
    const width = Math.max(8, Math.min(20, Math.round(e.w * 0.8)));
    const x = Math.round(cx - width / 2);
    const left = e.hp / e.def.pv;
    ctx.fillStyle = '#1a1c2c';
    ctx.fillRect(x - 1, Math.round(y) - 1, width + 2, 4);
    ctx.fillStyle = left > 0.5 ? '#f6c21c' : left > 0.25 ? '#ef7d57' : '#e43b44';
    ctx.fillRect(x, Math.round(y), Math.max(1, Math.round(width * left)), 2);
  }

  /** Sonné (onde, bousculade) : des étoiles tournent autour de sa tête ; elles clignotent quand il va reprendre. */
  stars(e, cx, top) {
    if (e.stun < 0.4 && !this.reduced && Math.floor(this.clock * 12) % 2) return;
    const { ctx } = this;
    const rx = Math.max(6, e.w / 2 + 2);
    for (let k = 0; k < 3; k++) {
      const a = (this.reduced ? 0.5 : this.clock * 7) + (k * Math.PI * 2) / 3; // effets réduits : elles ne tournent pas
      const x = Math.round(cx + Math.cos(a) * rx);
      const y = Math.round(top + 2 + Math.sin(a) * 2); // autour de la tête, sous sa jauge
      ctx.fillStyle = '#1a1c2c';
      ctx.fillRect(x - 2, y - 1, 5, 3);
      ctx.fillRect(x - 1, y - 2, 3, 5);
      ctx.fillStyle = Math.sin(a) > 0 ? '#f6c21c' : '#ef7d57';
      ctx.fillRect(x - 1, y, 3, 1);
      ctx.fillRect(x, y - 1, 1, 3);
    }
  }

  /** Gazé par ses propres lacrymogènes : il pleure, il tousse, il ne fait plus rien. */
  tears(e, cx, top) {
    const { ctx } = this;
    const eyes = top + Math.min(5, Math.round(e.h * 0.3));
    for (const side of [-1, 1]) {
      // Deux larmes par œil, l'une derrière l'autre, qui coulent jusqu'au menton.
      for (const lag of [0, 4.5]) {
        const fall = (this.clock * 16 + lag + (side > 0 ? 2 : 0) + e.x) % 9;
        const x = Math.round(cx + side * 3 - (side < 0 ? 1 : 0));
        const y = Math.round(eyes + fall);
        ctx.fillStyle = '#1a1c2c';
        ctx.fillRect(x - 1, y, 3, 4);
        ctx.fillStyle = '#41a6f6';
        ctx.fillRect(x, y, 1, 3);
        ctx.fillStyle = '#9be7f5';
        ctx.fillRect(x, y, 1, 1);
      }
    }
    if (Math.floor(this.clock * 2.5 + e.x) % 2 && this.first('kof', e)) this.label('KOF !', cx, top - 9, { size: 6, color: '#f4f4f4' });
  }

  /** Une unité qui repère le héros le fait savoir : un « ! » rouge, le temps d'un battement. */
  warn(e, cx, top) {
    const seen = this.watch.get(e) ?? { state: e.state, at: -9 };
    if (e.state === 'alert' && seen.state !== 'alert' && WARNS.has(e.def.reaction) && this.clock - seen.at > 2) seen.at = this.clock;
    seen.state = e.state;
    this.watch.set(e, seen);
    const age = this.clock - seen.at;
    if (age > 0.7) return;
    const jump = age < 0.12 && !this.reduced ? (0.12 - age) * 30 : 0;
    const above = e.hp < e.def.pv ? 7 : 0; // au-dessus de sa jauge, s'il en a une
    if (this.first('alerte', e)) this.label('!', cx, top - 10 - above - jump, { size: 10, color: '#e43b44' });
  }

  /** Un manifestant qui s'en va en courant et s'efface. */
  runner(r) {
    if (r.t < 0.35 && Math.floor(this.clock * 16) % 2) return;
    const body = this.bundle.decors[r.n % 2 ? 'manifestant-2' : 'manifestant'];
    if (!body) return;
    const step = Math.floor(this.clock * 12 + r.n) % 2 && body.sprites.image2;
    const img = sprite(step ? body.sprites.image2 : body.sprites.image, this.palette, r.dir < 0);
    this.ctx.globalAlpha = Math.min(1, r.t * 2);
    this.ctx.drawImage(img, Math.round(r.x - img.width / 2 - this.cx), Math.round(r.y - img.height - this.cy - Math.abs(Math.sin(r.t * 14)) * 2));
    this.ctx.globalAlpha = 1;
  }

  /** Le « pop » d'une unité qui passe hors service : un cercle qui s'ouvre. */
  ring(r) {
    const { ctx } = this;
    ctx.globalAlpha = Math.min(1, r.t * 4);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(Math.round(r.x - this.cx) + 0.5, Math.round(r.y - this.cy) + 0.5, 4 + (0.3 - r.t) * 50, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  /** Le liseré rouge du coup reçu, sur les bords de l'image. */
  redEdge() {
    const { ctx, viewW: W, viewH: H } = this;
    ctx.fillStyle = `rgb(228 59 68 / ${(Math.min(1, this.edge / 0.35) * 0.7).toFixed(2)})`;
    const b = 3;
    ctx.fillRect(0, 0, W, b);
    ctx.fillRect(0, H - b, W, b);
    ctx.fillRect(0, b, b, H - 2 * b);
    ctx.fillRect(W - b, b, b, H - 2 * b);
  }

  /**
   * Faux si un texte de ce genre (`kind`) est déjà écrit à cette image pour une unité identique et voisine : des unités
   * côte à côte font un groupe, qui n'a qu'un « ! », qu'un « KOF ! ». De proche en proche : toute la ligne.
   */
  first(kind, e) {
    const key = `${kind}:${e.def.id}`;
    const seen = this.groups.get(key) ?? [];
    const x = e.x + e.w / 2;
    const y = e.y + e.h;
    // Une unité hors de l'image n'écrit rien (voir `outside`) : elle ne prend pas la place de ses voisines visibles.
    if (x - this.cx < -24 || x - this.cx > this.viewW + 24 || y - this.cy < -8 || y - e.h - this.cy > this.viewH + 8) return true;
    const alone = !seen.some((p) => Math.abs(p.x - x) < GROUP.x && Math.abs(p.y - y) < GROUP.y);
    seen.push({ x, y });
    this.groups.set(key, seen);
    return alone;
  }

  /** Un trait d'un pixel entre deux points du monde. */
  line(x0, y0, x1, y1, color, dash = []) {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(Math.round(x0 - this.cx) + 0.5, Math.round(y0 - this.cy) + 0.5);
    ctx.lineTo(Math.round(x1 - this.cx) + 0.5, Math.round(y1 - this.cy) + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** La visée du LBD : un trait pointillé et un viseur qui se resserre jusqu'au tir. */
  aim(e) {
    const { x, y, t } = e.aim;
    this.line(e.x + e.w / 2, e.y + e.h * 0.35, x, y, '#e43b44', [2, 2]);
    const r = Math.round(3 + t * 7);
    const { ctx } = this;
    ctx.strokeStyle = Math.floor(this.clock * 12) % 2 ? '#e43b44' : '#f4f4f4';
    ctx.strokeRect(Math.round(x - r - this.cx) + 0.5, Math.round(y - r - this.cy) + 0.5, r * 2, r * 2);
  }

  /** Le jet du canon à eau. */
  jet(j) {
    const { ctx } = this;
    const x = Math.round((j.dir > 0 ? j.x : j.x - j.length) - this.cx);
    const y = Math.round(j.y - this.cy);
    ctx.fillStyle = '#41a6f6';
    ctx.fillRect(x, y - 3, j.length, 6);
    ctx.fillStyle = '#9be7f5';
    ctx.fillRect(x, y - 2, j.length, 3);
    ctx.fillStyle = '#f4f4f4';
    for (let k = 0; k < j.length; k += 9) ctx.fillRect(x + ((k + Math.floor(this.clock * 90)) % Math.max(1, j.length)), y - 1, 4, 1);
    const tip = j.dir > 0 ? j.x + j.length : j.x - j.length;
    if (Math.random() < 0.6) this.burst(tip, j.y, '#9be7f5', 1, 50);
  }

  /** Le projecteur de l'hélicoptère : un cône de lumière jusqu'au sol. */
  beam(e) {
    const { ctx } = this;
    const { x, y, w, lit } = e.beam;
    const ox = e.x + e.w / 2 - this.cx;
    const oy = e.y + e.h - this.cy;
    ctx.fillStyle = lit ? 'rgb(255 224 138 / .45)' : 'rgb(255 255 255 / .22)';
    ctx.beginPath();
    ctx.moveTo(ox - 2, oy);
    ctx.lineTo(ox + 2, oy);
    ctx.lineTo(x + w / 2 - this.cx, y - this.cy);
    ctx.lineTo(x - w / 2 - this.cx, y - this.cy);
    ctx.fill();
  }

  /** Une recrue qui attend : son gain s'affiche au-dessus d'elle, comme une porte à franchir. */
  recruit(r) {
    if (r.joined) return;
    const s = r.def.sprites;
    const rows = s.image2 && Math.floor(r.animTime * 3) % 2 ? s.image2 : s.image;
    this.actor(r, rows, { flip: false, dy: Math.round(Math.sin(this.clock * 5 + r.x) * 1) });
    const gain = r.def.multiplie > 0 ? `× ${String(r.def.multiplie).replace('.', ',')}` : `+ ${r.def.apport}`;
    this.reserve(gain, r.x + r.w / 2 - this.cx, r.y - 12 - this.cy, 8, 0);
    this.label(gain, r.x + r.w / 2 - this.cx, r.y - 12 - this.cy, { size: 8, color: '#1a1c2c', bg: '#f6c21c' });
  }

  /** Le cadre du drone : ce que PANIQUE TV choisit de montrer. */
  viewfinder(e) {
    const { ctx } = this;
    // Un drone cadre ce qu'il survole ; une équipe au sol cadre le héros lui-même ; venue pour un feu, elle cadre le feu.
    const aloft = e.def.deplacement === 'vol';
    const at = e.film ? { x: e.film.x, y: e.film.y - 34 }
      : aloft ? { x: e.x + e.w / 2, y: e.y + e.h + 4 } : { x: this.heroBox.x + this.heroBox.w / 2, y: this.heroBox.y - 10 };
    const x = Math.round(at.x - 22 - this.cx);
    const y = Math.round(at.y - this.cy);
    ctx.strokeStyle = Math.floor(this.clock * 4) % 2 ? '#e43b44' : '#f4f4f4';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, 44, 30);
    this.label('● REC', x + 12, y + 3, { size: 4.5, color: '#e43b44' });
  }

  boss(b) {
    if (b.state === 'gone') return;
    const s = b.def.sprites;
    if (b.state === 'ejecting') {
      this.actor(b, s.repos, { alpha: 0.55, flash: Math.floor(this.clock * 10) % 2 === 0 });
      const rise = (b.eject ?? b.t ?? 0) * 34;
      this.actor({ ...b, y: b.y - 30 - rise }, s.ejecte || s.portrait, { flip: false });
    } else {
      const moving = b.state === 'charge' || Math.abs(b.vx || 0) > 1;
      const flicker = b.flash > 0 && Math.floor(this.clock * 24) % 2 === 0; // coups reçus : scintille, sans rester blanc
      this.actor(b, moving ? s.marche1 || s.repos : s.repos, { flash: flicker, dy: Math.round(Math.sin(this.clock * 3) * 1.5) });
    }
    const say = this.bossSay;
    if (b.bubble && say) this.label(b.bubble.text, say.x, say.y, { size: 7, color: '#1a1c2c', bg: '#f6c21c', width: 150 });
  }

  /**
   * Où se pose la bulle du boss : entière dans la vue, sous la bande du HUD et la barre de vie (SAFE_TOP), et sur rien
   * de ce qui est déjà réservé (la voix d'en face, les textes des combats). Au-dessus de sa tête si possible ;
   * sinon à côté de lui, du côté du héros, puis de l'autre ; un peu plus bas si ces places sont prises.
   */
  bossBubble(b) {
    if (!b?.bubble || b.state === 'gone') return null;
    const { text } = b.bubble;
    const base = this.textBox(text, 0, 0, 7, 150);
    const half = (base.x1 - base.x0) / 2;
    const top = this.ceiling() - base.y0;
    const left = this.heroBox.x + this.heroBox.w / 2 < b.x + b.w / 2;
    const beside = (side) => (side < 0 ? b.x - this.cx - half - 2 : b.x + b.w - this.cx + half + 2);
    const above = b.y - 14 - this.cy;
    const sides = [[beside(left ? -1 : 1), b.y + 4 - this.cy], [beside(left ? 1 : -1), b.y + 4 - this.cy]];
    const step = base.y1 - base.y0 + 2;
    let first = null;
    for (let k = 0; k < 4; k++) {
      // Au-dessus de sa tête seulement s'il y a la place (plus bas, elle serait sur lui) ; à côté, on peut descendre.
      const spots = k === 0 && above >= top ? [[b.x + b.w / 2 - this.cx, above], ...sides] : sides;
      for (const [sx, sy] of spots) {
        const x = Math.min(this.viewW - half, Math.max(half, sx));
        const y = Math.max(top, sy + k * step);
        const box = { x0: x + base.x0, x1: x + base.x1, y0: y + base.y0, y1: y + base.y1 };
        first ??= { x, y, box };
        if (!this.boxes.some((o) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0)) return { x, y, box };
      }
    }
    return first;
  }

  /** Le dessin d'un accessoire, dans le monde : la boîte qu'aucune étiquette ne doit couvrir. Null s'il n'en a pas. */
  artOf(p) {
    const rows = this.bundle.decors[p.kind]?.sprites?.image;
    if (!rows) return null;
    const x0 = Math.round(p.x + p.w / 2 - rows[0].length / 2);
    const y0 = Math.round(p.y + p.h - rows.length);
    return { x0, x1: x0 + rows[0].length, y0, y1: y0 + rows.length };
  }

  /**
   * L'étiquette d'un accessoire, dans le monde : son texte, sa place de départ au-dessus de lui, `below` sous ses pieds,
   * et `art`, son dessin. Null pour un accessoire qui n'en a pas.
   */
  tagOf(p) {
    const tag = TAGS[p.kind];
    const art = tag && this.artOf(p);
    if (!art) return null;
    const x = p.kind === 'cage' ? art.x0 + 8 : (art.x0 + art.x1) / 2;
    return { p, text: tag.text, opts: tag.opts, x, y: art.y0 + tag.dy, below: art.y1 + 4, art };
  }

  /** Dessine un accessoire ; rend son étiquette à écrire à cette image, à l'écran (voir `placeTags`). */
  prop(p) {
    const d = this.bundle.decors;
    const rows = { cage: d.cage, piquet: d.piquet, sortie: d.sortie, panneau: d.panneau }[p.kind]?.sprites;
    if (!rows) return null;
    const img = sprite(p.on && rows.image2 ? rows.image2 : rows.image, this.palette);
    const x = Math.round(p.x + p.w / 2 - img.width / 2 - this.cx);
    const y = Math.round(p.y + p.h - img.height - this.cy);
    this.ctx.drawImage(img, x, y);
    const tag = this.tagOf(p);
    const onScreen = () => ({ ...tag, x: tag.x - this.cx, y: tag.y - this.cy, below: tag.below - this.cy, art: this.shown(tag.art) });
    if (p.kind === 'sortie') {
      if (x > this.viewW || x + img.width < 0) this.propSpot.delete(p);
      return p.on === false || !tag ? null : onScreen();
    }
    // « GARDE À VUE », « PIQUET DE GRÈVE » : écrits pour un accessoire à l'étage du héros ; plus haut ou plus bas, le dessin
    // suffit. Muette, l'étiquette s'écrit dès que le héros arrive à son étage, l'accessoire en entier dans l'image ;
    // écrite, elle le reste et sort de l'image avec lui, comme le reste du décor : un saut, un pas ou la caméra qui
    // bouge au bord ne la font jamais disparaître d'un coup. Elle s'oublie une fois l'accessoire loin de l'image.
    if (!tag || p.on) return null;
    const whole = x >= 0 && y >= 0 && x + img.width <= this.viewW && y + img.height <= this.viewH;
    const near = x + img.width > -TAG_OUT && x < this.viewW + TAG_OUT && y + img.height > -TAG_OUT && y < this.viewH + TAG_OUT;
    if (!near) {
      this.propSay.delete(p);
      this.propSpot.delete(p);
      this.propHidden.delete(p);
      return null;
    }
    const h = this.heroBox;
    if (whole && !this.propSay.get(p)) this.propSay.set(p, Boolean(h) && Math.abs(p.y + p.h - (h.y + h.h)) <= PROP_FLOOR);
    return this.propSay.get(p) ? onScreen() : null;
  }

  /** Une boîte du monde, à l'écran. */
  shown(box) {
    return { x0: box.x0 - this.cx, x1: box.x1 - this.cx, y0: box.y0 - this.cy, y1: box.y1 - this.cy };
  }

  /**
   * Où s'écrit l'étiquette de chaque accessoire du niveau, par rapport à sa place de départ au-dessus de lui. Des
   * accessoires voisins (une cage et un piquet côte à côte) ont leurs étiquettes l'une à côté de l'autre, tant que
   * chacune reste au-dessus de son propre dessin ; sinon l'une au-dessus de l'autre. Aucune ne couvre un dessin.
   * Calculé une fois pour le niveau, dans le monde : rien ne change quand la caméra bouge ou qu'une voisine s'écrit.
   */
  tagLayout(props) {
    if (this.layout?.props === props && this.layout.ratio === this.ratio) return this.layout.spots;
    const spots = new WeakMap();
    const arts = props.map((p) => this.artOf(p)).filter(Boolean);
    const placed = [];
    const hit = (box) => placed.find((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
    for (const t of props.map((p) => this.tagOf(p)).filter(Boolean).sort((a, b) => a.x - b.x || a.y - b.y)) {
      const base = this.textBox(t.text, t.x, t.y, t.opts.size, 0);
      const at = (s) => ({ x0: base.x0 + s.dx, x1: base.x1 + s.dx, y0: base.y0 + s.dy, y1: base.y1 + s.dy });
      const step = base.y1 - base.y0 + 1;
      const other = hit(base);
      const aside = other ? other.x1 + 1 - base.x0 : 0; // de gauche à droite : ce qui gêne est à gauche
      // À côté, mais toujours au-dessus de son propre dessin (au moins 4 pixels de recouvrement).
      const over = (s) => Math.min(at(s).x1, t.art.x1) - Math.max(at(s).x0, t.art.x0) >= 4;
      const ok = (s) => over(s) && !hit(at(s)) && !arts.some((a) => covers(at(s), a));
      const spot = [{ dx: 0, dy: 0 }, ...(aside > 0 ? [{ dx: aside, dy: 0 }] : []), { dx: 0, dy: -step }, { dx: 0, dy: -2 * step }]
        .find(ok) ?? { dx: 0, dy: 0 };
      spots.set(t.p, spot);
      placed.push(at(spot));
    }
    this.layout = { props, ratio: this.ratio, spots };
    return spots;
  }

  /**
   * Les étiquettes des accessoires : aucune ne recouvre une autre, ni le panneau lu, ni l'écriture d'un décor, ni un
   * dessin d'accessoire, ni ne passe sous la bande du HUD. Chacune s'écrit à sa place dans le niveau (voir `tagLayout`).
   * Gênée là, ou montée sous le HUD, elle se pose sous les pieds de son accessoire, et y reste tant qu'il est à l'écran :
   * elle ne revient pas d'un saut quand la gêne s'en va. Un accessoire qui passe sous le HUD l'emporte avec lui : son
   * étiquette s'efface à mesure qu'il disparaît, et il n'en a plus une fois caché.
   */
  placeTags(tags, props) {
    const layout = this.tagLayout(props);
    const ceiling = this.ceiling();
    const arts = props.map((p) => this.artOf(p)).filter(Boolean).map((a) => this.shown(a))
      .filter((a) => a.x1 > 0 && a.x0 < this.viewW && a.y1 > 0 && a.y0 < this.viewH);
    tags.sort((a, b) => a.x - b.x || a.y - b.y);
    for (const t of tags) {
      const { art } = t;
      // Un accessoire caché sous la bande du HUD n'a pas d'étiquette. Caché en entier, il la perd ; il ne la retrouve
      // qu'une fois revenu en entier dans l'image : entre les deux, rien ne change, et une caméra qui sautille ne la
      // fait pas clignoter.
      if (art.y1 <= ceiling) this.propHidden.add(t.p);
      else if (art.y0 >= ceiling) this.propHidden.delete(t.p);
      if (this.propHidden.has(t.p)) continue;
      const base = this.textBox(t.text, t.x, t.y, t.opts.size, 0);
      const at = (s) => ({ x0: base.x0 + s.dx, x1: base.x1 + s.dx, y0: base.y0 + s.dy, y1: base.y1 + s.dy });
      const free = (s) => {
        const box = at(s);
        return box.y0 >= ceiling && !arts.some((a) => covers(box, a))
          && !this.boxes.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
      };
      const home = layout.get(t.p) ?? { dx: 0, dy: 0 };
      const moved = this.propSpot.get(t.p);
      let spot = (moved && free(moved) ? moved : null) ?? (free(home) ? home : null);
      if (!spot) {
        // Sous ses propres pieds, à une tuile au plus ; sinon un peu sur le côté, toujours au-dessus ou au-dessous de lui.
        const step = base.y1 - base.y0 + 1;
        const under = t.below - t.y;
        const reach = (base.x1 - base.x0) / 2 + (art.x1 - art.x0) / 2 - 4; // de quoi garder 4 pixels au-dessus de son dessin
        const sides = [reach / 2, -reach / 2, reach, -reach].map(Math.round);
        spot = [{ dx: 0, dy: under }, { dx: 0, dy: under + step }, ...sides.map((dx) => ({ dx, dy: home.dy })),
          ...sides.map((dx) => ({ dx, dy: under }))].find(free) ?? moved ?? home; // nulle part : écrite quand même, là où elle était
        this.propSpot.set(t.p, spot);
      }
      const box = at(spot);
      this.boxes.push(box);
      // Son accessoire passe sous le HUD : elle s'efface avec lui.
      const alpha = art.y0 < ceiling ? Math.min(1, (art.y1 - ceiling) / (art.y1 - art.y0)) : 1;
      this.label(t.text, t.x + spot.dx, t.y + spot.dy, { ...t.opts, alpha });
    }
  }

  decor(d) {
    const def = this.bundle.decors[d.id];
    if (!def) return;
    const two = def.sprites.image2 && Math.floor(this.clock * 2 + d.x) % 2;
    const img = sprite(two ? def.sprites.image2 : def.sprites.image, this.palette);
    const x = Math.round(d.x - this.cx);
    const y = Math.round(d.y - img.height - this.cy);
    if (x > this.viewW || x + img.width < 0) return;
    this.ctx.drawImage(img, x, y);
    if (d.fire) this.flames(d.fire.x - this.cx, d.fire.y - this.cy, Math.min(img.width - 8, 30));
    const text = def.ecrit && this.written(d);
    if (!text) return;
    if (def.ecrit === 'tag') this.label(text, x + 8, y - 6, { size: 6.5, color: '#e43b44', width: 110 });
    else {
      this.reserve(text, x + img.width / 2, y + def.ecritY, 6, 0);
      this.label(text, x + img.width / 2, y + def.ecritY, { size: 6, color: '#1a1c2c', stroke: false });
    }
  }

  /** Un feu de poubelle : des langues de flammes qui dansent, de la fumée au-dessus. `x` : le centre, `y` : le sol. */
  flames(x, y, width) {
    const { ctx } = this;
    const still = this.reduced;
    const t = still ? 0 : this.clock;
    const n = Math.max(3, Math.floor(width / 4));
    for (let i = 0; i < n; i++) {
      const fx = Math.round(x - width / 2 + (i + 0.5) * (width / n));
      // Chaque langue a son rythme ; celles du milieu montent plus haut.
      const lift = 8 + 9 * Math.sin((Math.PI * (i + 0.5)) / n) + 4 * Math.sin(t * 9 + i * 1.7) + 2 * Math.sin(t * 15 + i * 2.9);
      const h = Math.max(4, Math.round(lift));
      const top = Math.round(y - 10 - h);
      ctx.fillStyle = '#e43b44';
      ctx.fillRect(fx - 2, top, 4, h);
      ctx.fillStyle = '#ef7d57';
      ctx.fillRect(fx - 1, top + 2, 3, h - 2);
      ctx.fillStyle = '#f6c21c';
      ctx.fillRect(fx - 1, top + Math.round(h * 0.45), 2, Math.round(h * 0.55));
      ctx.fillStyle = '#ffe08a';
      ctx.fillRect(fx, top + Math.round(h * 0.7), 1, Math.round(h * 0.3));
    }
    // Fumée : trois volutes qui montent et s'effacent.
    for (let k = 0; k < 3; k++) {
      const rise = still ? k / 3 : (t * 0.5 + k / 3) % 1;
      ctx.fillStyle = `rgba(86, 108, 134, ${(0.5 * (1 - rise)).toFixed(2)})`;
      const size = 3 + Math.round(rise * 5);
      ctx.fillRect(Math.round(x - size / 2 + Math.sin(rise * 6 + k) * 4), Math.round(y - 30 - rise * 34), size, size);
    }
  }

  /**
   * La vraie pancarte écrite sur un décor (banderole, tag) : toujours la même au même endroit.
   * Une banderole n'a la place que de 24 caractères : seules les pancartes courtes s'y écrivent (c'est dit dans le guide).
   */
  written(d) {
    this.signs ??= this.bundle.pancartes.filter((p) => p.texte.length <= 24);
    return this.signs.length ? this.signs[Math.floor(d.x / 16 + d.y * 7) % this.signs.length].texte : '';
  }

  /** Où se tient un membre du cortège à l'écran, et où serait sa pancarte levée. */
  spot(m, i) {
    const d = this.bundle.decors;
    const body = m.kind === 'fanfare' ? d.fanfare : i % 2 ? d['manifestant-2'] : d.manifestant;
    if (!body) return null;
    const step = Math.floor(m.animTime * 8) % 2 && body.sprites.image2;
    const img = sprite(step ? body.sprites.image2 : body.sprites.image, this.palette, m.facing < 0);
    const x = Math.round(m.x - img.width / 2 - this.cx);
    const y = Math.round(m.y - img.height - this.cy + (m.gassed > 0 ? 3 : 0));
    const hand = m.facing < 0 ? x : x + img.width - 1;
    const top = y - 12 - (i % 2) * 14;
    const width = m.label?.length > 45 ? 84 : m.label?.length > 26 ? 64 : 44; // une longue pancarte est plus large, pas plus haute
    return { img, x, y, hand, top, width, shown: x <= this.viewW + 40 && x >= -60 };
  }

  /**
   * Quelles pancartes du cortège sont levées à cette image. Aucune n'en recouvre une autre ni ce qui est déjà
   * réservé (le héros, la voix, les textes flottants, les gains des recrues), et aucune ne clignote :
   * levée, elle le reste SIGN_UP secondes, sauf devant un de ces textes prioritaires ; baissée, elle attend SIGN_DOWN.
   */
  raiseSigns(cortege) {
    const now = this.clock;
    const priority = this.boxes.length;
    const signs = [];
    let k = 0;
    cortege.forEach((m, i) => {
      if (m.kind !== 'pancarte' || !m.label) return;
      // À tour de rôle : chaque porteur a son tour un tour sur SIGN_SHARE, décalé de ses voisins. Une manif plus grande
      // a plus de porteurs, donc plus de pancartes levées à la fois ; aucune n'est oubliée. Une pancarte qui vient
      // d'arriver se lève dès qu'elle a la place (c'est la récompense du déblocage), le reste SIGN_FRESH secondes, puis rejoint la rotation.
      let held = this.held.get(m);
      if (held?.label !== m.label) this.held.set(m, (held = { up: false, since: -Infinity, label: m.label, first: null }));
      const slot = k++;
      const fresh = held.first === null || now - held.first < SIGN_FRESH;
      const turn = fresh || Math.floor(now / SIGN_TURN + slot * 0.618) % SIGN_SHARE === 0;
      const s = this.spot(m, i);
      if (!s?.shown || m.gassed > 0) {
        if (held.up) Object.assign(held, { up: false, since: now });
        return;
      }
      signs.push({ m, held, turn, box: this.textBox(m.label, s.hand, s.top, 4.6, s.width) });
    });
    const clear = (box, upTo = this.boxes.length) => !this.boxes.slice(0, upTo).some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
    // Pour se relever, une pancarte veut de l'air autour des textes prioritaires, surtout en dessous
    // (le héros bouge, les textes flottants montent) : sinon elle retomberait aussitôt.
    const roomy = (box) => clear({ x0: box.x0 - 12, x1: box.x1 + 12, y0: box.y0 - 6, y1: box.y1 + 18 }, priority) && clear(box);
    const keep = (sign, ok) => {
      if (ok) {
        sign.held.first ??= now; // sa première levée : son tour de nouvelle venue commence
        if (!sign.held.up) Object.assign(sign.held, { up: true, since: now });
        this.boxes.push(sign.box);
      } else if (sign.held.up) Object.assign(sign.held, { up: false, since: now });
    };
    // Celles levées depuis peu ne cèdent qu'aux textes prioritaires ; les plus anciennes ensuite ;
    // les baissées depuis assez longtemps se relèvent là où il reste de la place.
    const young = signs.filter((s) => s.held.up && now - s.held.since < SIGN_UP);
    const old = signs.filter((s) => s.held.up && now - s.held.since >= SIGN_UP).sort((a, b) => a.held.since - b.held.since);
    const down = signs.filter((s) => !s.held.up && now - s.held.since >= SIGN_DOWN);
    for (const s of young) keep(s, clear(s.box, priority));
    for (const s of old) keep(s, s.turn && clear(s.box));
    for (const s of down) keep(s, s.turn && roomy(s.box));
    this.raised = new Set(signs.filter((s) => s.held.up).map((s) => s.m));
  }

  /** Un membre du cortège, avec sa pancarte, son drapeau ou sa trompette. Tout près du héros, il s'efface à demi. */
  marcher(m, i) {
    const s = this.spot(m, i);
    if (!s?.shown) return;
    const { img, x, y, hand } = s;
    const h = this.heroBox;
    const near = h && !h.dead && Math.abs(m.x - (h.x + h.w / 2)) < NEAR_HERO && Math.abs(m.y - (h.y + h.h)) < 20;
    if (near) this.ctx.globalAlpha = 0.5;
    this.ctx.drawImage(img, x, y);
    if (m.gassed > 0) {
      // Un « KOF ! » sur quatre : l'affaissement suffit pour les autres.
      if (i % 4 === 0 && !near) this.label('KOF !', x + 5, y - 6, { size: 5, color: '#f4f4f4' });
    } else if (m.kind === 'drapeau') {
      const flag = this.bundle.drapeaux[m.label];
      if (flag) {
        const cloth = sprite(flag.sprites.image, this.palette, m.facing < 0);
        this.ctx.fillStyle = '#6b3a2a';
        this.ctx.fillRect(hand, y - 16, 1, 18);
        const sway = Math.round(Math.sin(this.clock * 5 + i) * 1);
        this.ctx.drawImage(cloth, m.facing < 0 ? hand - cloth.width : hand + 1, y - 16 + sway);
      }
    } else if (m.kind === 'pancarte' && this.raised.has(m)) { // baissée plutôt que d'en cacher une autre ; mains vides sans pancarte
      this.ctx.fillStyle = '#6b3a2a';
      this.ctx.fillRect(hand, y - 8 - (i % 2) * 14, 1, 10 + (i % 2) * 14);
      this.board(m.label, hand, s.top, { size: 4.6, width: s.width });
    }
    this.ctx.globalAlpha = 1;
  }

  projectile(p) {
    const x = p.x - this.cx;
    const y = p.y - this.cy;
    if (p.word) {
      this.label(p.word, x + p.w / 2, y - 1, { size: 7.5, color: p.team === 'ordre' ? '#e43b44' : '#f4f4f4' });
      return;
    }
    const rows = p.def?.sprites?.[p.image];
    if (rows) {
      const img = sprite(rows, this.palette, p.vx < 0);
      this.ctx.drawImage(img, Math.round(x + p.w / 2 - img.width / 2), Math.round(y + p.h / 2 - img.height / 2));
    } else {
      this.ctx.fillStyle = p.team === 'ordre' ? '#e43b44' : '#f6c21c';
      this.ctx.fillRect(Math.round(x), Math.round(y), Math.max(2, p.w), Math.max(2, p.h));
    }
  }

  cloud(c) {
    const { ctx } = this;
    ctx.globalAlpha = Math.min(0.5, c.t * 0.4);
    ctx.fillStyle = '#efe6cf';
    for (let k = 0; k < 5; k++) {
      const a = k * 1.26 + this.clock * 0.6;
      ctx.beginPath();
      ctx.arc(c.x - this.cx + Math.cos(a) * c.r * 0.45, c.y - this.cy + Math.sin(a) * c.r * 0.35, c.r * 0.55, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- textes (calque net)

  wrap(text, size, width) {
    const { tctx } = this;
    tctx.font = `${size}px ${FONT}`;
    if (!width) return [text];
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && tctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
    return lines;
  }

  /** Le haut de l'image qui reste au HUD, en pixels du jeu : SAFE_TOP au moins, et tout le HUD mesuré (`hudBottom`). */
  ceiling() {
    return Math.max(SAFE_TOP, this.hudBottom + 4) / this.ratio;
  }

  /** La taille d'un texte du monde, relevée pour qu'il fasse au moins MIN_TEXT pixels à l'écran (téléphone). */
  fit(size) {
    return Math.max(size, MIN_TEXT / this.ratio);
  }

  /** Sans rien mesurer : un texte qui tombe à coup sûr hors de la vue. Il n'est ni mesuré ni écrit. */
  outside(text, x, y, size, width) {
    const s = this.fit(size);
    const most = text.length * s; // aucun caractère n'est plus large que le corps
    const wrapAt = width * (s / size);
    const half = (wrapAt ? Math.min(most, wrapAt) : most) / 2 + 6;
    const rows = wrapAt ? Math.ceil(most / wrapAt) + 1 : 1;
    return x + half < 0 || x - half > this.viewW || y + s * 1.1 + 4 < 0 || y - rows * s * 1.1 - 4 > this.viewH;
  }

  /** La boîte qu'occupe un texte centré en (x, y), avec une petite marge. */
  textBox(text, x, y, size, width) {
    const s = this.fit(size);
    const lines = this.wrap(text, s, width * (s / size));
    const w = Math.max(...lines.map((l) => this.tctx.measureText(l).width)) + 8;
    return { x0: x - w / 2, x1: x + w / 2, y0: y - (lines.length - 1) * s * 1.1 - 3, y1: y + s * 1.1 + 3, lines: lines.length };
  }

  /** Réserve la place d'un texte à l'écran ; faux si un autre l'occupe déjà. */
  reserve(text, x, y, size, width) {
    if (this.outside(text, x, y, size, width)) return true; // hors de la vue : il ne gêne personne
    const box = this.textBox(text, x, y, size, width);
    if (this.boxes.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) return false;
    this.boxes.push(box);
    return true;
  }

  /**
   * Les textes flottants ne s'empilent pas : chacun monte juste au-dessus de ceux déjà là et des textes fixes
   * (la voix d'en face, les gains des recrues). Une fois écartés, ils montent ensemble, à la même vitesse.
   * Leurs boîtes sont réservées : les pancartes du cortège s'effacent devant eux.
   */
  placeFloaters(fixed) {
    const placed = [...fixed];
    const ceiling = this.ceiling(); // jamais sous la bande du HUD : un texte qui y arriverait s'arrête au plafond
    const shift = (f, box, dy) => {
      f.y += dy;
      box.y0 += dy;
      box.y1 += dy;
    };
    // Ceux qui ont leur place (`keep` : au pied d'une ligne, au bord de l'écran) ne bougent pas ; les autres passent autour.
    // Seule exception : un texte `keep` qui monte (« TOUCHÉ ») passe au-dessus d'une sommation plutôt que de la cacher.
    const kept = [];
    for (const f of this.floaters.filter((g) => g.keep)) {
      const box = this.textBox(f.text, f.x - this.cx, f.y - this.cy, f.size, 150);
      const voice = this.voice;
      const rises = (f.rise ?? 14) > 0;
      if (voice && rises && !f.edge && box.x0 < voice.x1 && box.x1 > voice.x0 && box.y0 < voice.y1 && box.y1 > voice.y0) shift(f, box, voice.y0 - 1 - box.y1);
      // Sous la bande du HUD, même au pied d'une ligne perchée tout en haut : il descend juste sous elle, sans en couvrir un autre.
      if (box.y0 < ceiling) {
        shift(f, box, ceiling - box.y0);
        for (let k = 0, other; k < 8 && (other = kept.find((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)); k++) {
          shift(f, box, other.y1 + 1 - box.y0);
        }
      }
      kept.push(box);
      placed.push(box);
      this.boxes.push(box);
    }
    for (const f of this.floaters.filter((g) => !g.keep)) {
      const box = this.textBox(f.text, f.x - this.cx, f.y - this.cy, f.size, 150);
      const hit = () => placed.find((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
      for (let k = 0, other; k < 8 && (other = hit()); k++) shift(f, box, other.y0 - 1 - box.y1);
      // Trop haut : il s'arrête au plafond, et passe sous ce qui le gêne encore.
      if (box.y0 < ceiling) {
        shift(f, box, ceiling - box.y0);
        for (let k = 0, other; k < 8 && (other = hit()); k++) shift(f, box, other.y1 + 1 - box.y0);
      }
      placed.push(box);
      if (f.t > FADE) this.boxes.push(box);
    }
  }

  /** Texte centré en (x, y) : contour sombre, ou fond plein si `bg` est donné. */
  label(text, x, y, { size = 6, color = '#f4f4f4', bg = null, width = 0, alpha = 1, stroke = true } = {}) {
    if (this.outside(text, x, y, size, width)) return;
    const { tctx } = this;
    const s = this.fit(size);
    width *= s / size;
    size = s;
    const lines = this.wrap(text, size, width);
    const w = Math.max(...lines.map((l) => tctx.measureText(l).width));
    const lh = size * 1.1;
    const top = y - (lines.length - 1) * lh;
    tctx.globalAlpha = alpha;
    tctx.textAlign = 'center';
    tctx.textBaseline = 'top';
    if (bg) {
      tctx.fillStyle = '#1a1c2c';
      tctx.fillRect(x - w / 2 - 3, top - 2, w + 6, lines.length * lh + 3);
      tctx.fillStyle = bg;
      tctx.fillRect(x - w / 2 - 2, top - 1, w + 4, lines.length * lh + 1);
    }
    lines.forEach((l, i) => {
      if (!bg && stroke) {
        tctx.lineWidth = size / 4;
        tctx.lineJoin = 'round';
        tctx.strokeStyle = '#1a1c2c';
        tctx.strokeText(l, x, top + i * lh);
      }
      tctx.fillStyle = color;
      tctx.fillText(l, x, top + i * lh);
    });
    tctx.globalAlpha = 1;
  }

  /** Pancarte ou panneau : fond papier, bord sombre, texte qui passe à la ligne. */
  board(text, x, y, { size = 7, width = 190, alpha = 1 } = {}) {
    this.label(text, x, y, { size, color: '#1a1c2c', bg: '#efe6cf', width, alpha });
  }
}
