// Rendu : lit l'état d'une partie (src/sim/game.js) et le dessine. Ne modifie jamais la simulation.
//
// Deux calques superposés : `canvas` en basse résolution (pixels nets, agrandis en CSS)
// et `textCanvas` en pleine résolution pour les textes du monde (pancartes, mots, bulles).

import { sprite } from './sprites.js';
import { withKeys } from './input.js';

const TILE = 16;
const SIGN_LINGER = 1.6; // secondes pendant lesquelles un panneau dépassé reste lisible, en s'effaçant
const FONT = "Impact, Haettenschweiler, 'Arial Narrow Bold', 'HelveticaNeue-CondensedBlack', 'Roboto Condensed', sans-serif";
export const SKIES = {
  campagne: ['#6fc4ee', '#d5f0f7'],
  ville: ['#8ea2c0', '#e3e6ee'],
  citadelle: ['#2b1741', '#b13e53'],
};
const MAX_PARTICLES = 260;

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
    this.particles = [];
    this.floaters = [];
    this.shake = 0;
    this.reduced = false;
    this.anchor = 0.62; // hauteur des pieds du héros à l'écran (0 = haut, 1 = bas) : on voit ce qu'il y a sous terre
    this.demo = false; // démo du menu : pas de panneaux par-dessus le titre
    this.device = 'clavier'; // l'appareil dont les panneaux disent les touches : clavier, manette ou pouce
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
      } else if (e.type === 'bubble') this.floaters.push({ x: e.x, y: e.y, text: e.text, t: 1.6, color: e.color || '#f4f4f4' });
      else if (e.type === 'recruit') {
        this.floaters.push({ x: e.x, y: e.y - 14, text: `+ ${e.n.toLocaleString('fr-FR')}`, t: 1.8, color: '#f6c21c', size: 11 });
        if (e.healed) this.floaters.push({ x: e.x, y: e.y - 28, text: 'SOIGNÉ', t: 1.8, color: '#38b764', size: 9 });
        this.burst(e.x, e.y, '#f6c21c', 10, 80);
        this.burst(e.x, e.y, '#e43b44', 8, 60);
      } else if (e.type === 'heroCard' && e.x !== undefined) {
        // Un camarade libéré : une vie de plus, comme dans Broforce.
        this.floaters.push({ x: e.x, y: e.y - 10, text: '+1', t: 2.4, color: '#f6c21c', size: 20 });
        this.burst(e.x, e.y, '#f6c21c', 14, 90);
      } else if (e.type === 'overrun') {
        this.floaters.push({ x: e.x, y: e.y - 12, text: 'ON EST LÀ !', t: 1.8, color: '#f6c21c', size: 10 }); // « On est là, même si Macron le veut pas »
        this.burst(e.x, e.y, '#94b0c2', 10, 70);
      } else if (e.type === 'checkpoint') {
        // Le piquet de grève rejoint la manif, et c'est d'ici qu'on repartira.
        this.floaters.push({ x: e.x + TILE / 2, y: e.y - 14, text: '+ 10', t: 1.8, color: '#f6c21c', size: 11 });
        this.floaters.push({ x: e.x + TILE / 2, y: e.y - 28, text: 'ON REPART D’ICI', t: 2.2, color: '#f4f4f4', size: 8 });
        this.burst(e.x + TILE / 2, e.y, '#f6c21c', 10, 70);
      }
    }
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
      f.y -= 14 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.t > 0);
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

    this.crowd = game.crowd || 0;
    this.heroBox = game.hero;
    this.boxes = []; // les pancartes déjà posées à cette image : aucune ne recouvre l'autre
    this.backRows = game.level?.murs;
    this.backWalls(game, cx, cy);
    for (const d of game.decors) if (!this.bundle.decors[d.id]?.devant) this.decor(d);
    for (const e of game.enemies) if (e.beam) this.beam(e);
    this.tiles(game.world, cx, cy);
    for (const p of game.props) this.prop(p);
    for (const r of game.recruits || []) this.recruit(r);
    const talker = game.enemies.filter((e) => e.bubble && e.state !== 'done')
      .sort((a, b) => Math.abs(a.x - game.hero.x) - Math.abs(b.x - game.hero.x))[0];
    // Une seule voix à la fois, et les pancartes du cortège s'effacent devant elle.
    if (talker) this.reserve(talker.bubble.text, talker.x + talker.w / 2 - cx, talker.y - 10 - cy, 5.5, 80);
    game.cortege.forEach((m, i) => this.marcher(m, i));
    for (const e of game.enemies) this.enemy(e, e === talker);
    if (game.boss) this.boss(game.boss);
    this.hero(game.hero);
    for (const p of game.projectiles) this.projectile(p);
    for (const c of game.clouds) this.cloud(c);
    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x - cx), Math.round(p.y - cy), p.s, p.s);
    }
    for (const d of game.decors) if (this.bundle.decors[d.id]?.devant) this.decor(d);

    for (const f of this.floaters) {
      this.label(f.text, f.x - cx, f.y - cy, { size: f.size || 7, color: f.color, alpha: Math.min(1, f.t * 2), width: 150 });
    }
    // Le panneau devant lequel on passe, avec les touches de l'appareil en cours ; dépassé, il reste lisible un instant.
    if (game.sign) this.sign = { text: game.sign, t: SIGN_LINGER };
    else this.sign.t = Math.max(0, this.sign.t - dt);
    if (this.sign.t > 0 && !this.demo) {
      // Un panneau long passe à la ligne vers le bas : il ne monte jamais sur le HUD.
      const text = withKeys(this.sign.text, this.device);
      const lines = this.wrap(text, 7, 190).length;
      this.board(text, this.viewW / 2, 30 + (lines - 1) * 7 * 1.1, { alpha: Math.min(1, this.sign.t * 2) });
    }
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

  /** Dessine un sprite posé au sol, centré sur la boîte de collision de son acteur. */
  actor(a, rows, { flip = a.facing < 0, flash = false, alpha = 1, dy = 0 } = {}) {
    if (!rows) return;
    const img = sprite(rows, this.palette, flip, flash);
    const x = Math.round(a.x + a.w / 2 - img.width / 2 - this.cx);
    const y = Math.round(a.y + a.h - img.height - this.cy + dy);
    if (x > this.viewW || y > this.viewH || x + img.width < 0 || y + img.height < 0) return;
    if (alpha !== 1) this.ctx.globalAlpha = alpha;
    this.ctx.drawImage(img, x, y);
    if (alpha !== 1) this.ctx.globalAlpha = 1;
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
    const blink = h.invuln > 0 && Math.floor(this.clock * 14) % 2;
    if (!blink) this.actor(h, rows);
  }

  enemy(e, speaks = false) {
    const s = e.def.sprites;
    if (e.state === 'done') {
      this.actor(e, s.fin || s.repos);
      const cx = e.x + e.w / 2 - this.cx;
      if (e.def.ecriteau) this.label(e.def.ecriteau, cx, e.y - 9 - this.cy, { size: 5, color: '#1a1c2c', bg: '#f4f4f4' });
      if (e.def.fin === 'panne' && Math.floor(this.clock * 3 + e.x) % 3 === 0) this.burst(e.x + e.w / 2, e.y, '#94b0c2', 1, 12);
      return;
    }
    const moving = e.state === 'patrol' || e.state === 'alert' || e.def.deplacement === 'vol';
    if (e.rope) this.line(e.rope.x, e.rope.y, e.x + e.w / 2, e.y, '#1a1c2c');
    if (e.jet) this.jet(e.jet);
    // Un plateau de télé ne se retourne pas : son enseigne resterait à l'envers.
    const set = e.def.deplacement === 'fixe' && e.def.reaction === 'cadre';
    this.actor(e, this.frames(s, moving, e.animTime, e.def.deplacement === 'vol' ? 14 : 7), { flash: e.flash > 0, ...(set && { flip: false }) });
    if (e.aim) this.aim(e);
    if (e.rush?.phase === 'ruee') {
      this.ctx.fillStyle = '#f4f4f4';
      for (let k = 0; k < 3; k++) this.ctx.fillRect(Math.round(e.x + (e.facing > 0 ? -8 - k * 5 : e.w + 4 + k * 5) - this.cx), Math.round(e.y + 3 + k * 5 - this.cy), 4, 1);
    }
    // Une ligne qui tient affiche combien il faut être pour la déborder.
    if (e.blocking && e.def.debordement > 0) {
      const enough = this.crowd >= e.def.debordement;
      this.label(`✊ ${e.def.debordement.toLocaleString('fr-FR')}`, e.x + e.w / 2 - this.cx, e.y - (speaks ? 22 : 10) - this.cy,
        { size: 6.5, color: '#f4f4f4', bg: enough ? '#257953' : '#e43b44' });
    }
    if (e.state === 'stunned') this.label('✶ ✶', e.x + e.w / 2 - this.cx, e.y - 5 - this.cy, { size: 6, color: '#f6c21c' });
    if (e.def.reaction === 'cadre' && e.state === 'alert' && (!e.film || e.framing)) this.viewfinder(e);
    if (speaks) this.label(e.bubble.text, e.x + e.w / 2 - this.cx, e.y - 10 - this.cy, { size: 5.5, color: '#1a1c2c', bg: '#f4f4f4', width: 80 });
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
    if (b.bubble) this.label(b.bubble.text, b.x + b.w / 2 - this.cx, b.y - 14 - this.cy, { size: 7, color: '#1a1c2c', bg: '#f6c21c', width: 150 });
  }

  prop(p) {
    const d = this.bundle.decors;
    const rows = { cage: d.cage, piquet: d.piquet, sortie: d.sortie, panneau: d.panneau }[p.kind]?.sprites;
    if (!rows) return;
    const img = sprite(p.on && rows.image2 ? rows.image2 : rows.image, this.palette);
    const x = Math.round(p.x + p.w / 2 - img.width / 2 - this.cx);
    const y = Math.round(p.y + p.h - img.height - this.cy);
    this.ctx.drawImage(img, x, y);
    if (p.kind === 'sortie') {
      if (p.on !== false) this.label('SORTIE ▶', x + img.width / 2, y - 9, { size: 6, color: '#1a1c2c', bg: '#f6c21c' });
    }
    if (p.kind === 'cage' && !p.on) this.label('GARDE À VUE', x + 8, y - 8, { size: 4.5, color: '#f4f4f4', bg: '#333c57' });
    if (p.kind === 'piquet' && !p.on) this.label('PIQUET DE GRÈVE', x + img.width / 2, y - 8, { size: 4.5, color: '#1a1c2c', bg: '#f6c21c' });
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

  /** Un membre du cortège, avec sa pancarte, son drapeau ou sa trompette. */
  marcher(m, i) {
    const d = this.bundle.decors;
    const body = m.kind === 'fanfare' ? d.fanfare : i % 2 ? d['manifestant-2'] : d.manifestant;
    if (!body) return;
    const step = Math.floor(m.animTime * 8) % 2 && body.sprites.image2;
    const img = sprite(step ? body.sprites.image2 : body.sprites.image, this.palette, m.facing < 0);
    const x = Math.round(m.x - img.width / 2 - this.cx);
    const y = Math.round(m.y - img.height - this.cy + (m.gassed > 0 ? 3 : 0));
    if (x > this.viewW + 40 || x < -60) return;
    this.ctx.drawImage(img, x, y);
    if (m.gassed > 0) {
      this.label('KOF !', x + 5, y - 6, { size: 5, color: '#f4f4f4' });
      return;
    }
    const hand = m.facing < 0 ? x : x + img.width - 1;
    if (m.kind === 'drapeau') {
      const flag = this.bundle.drapeaux[m.label];
      if (!flag) return;
      const cloth = sprite(flag.sprites.image, this.palette, m.facing < 0);
      this.ctx.fillStyle = '#6b3a2a';
      this.ctx.fillRect(hand, y - 16, 1, 18);
      const sway = Math.round(Math.sin(this.clock * 5 + i) * 1);
      this.ctx.drawImage(cloth, m.facing < 0 ? hand - cloth.width : hand + 1, y - 16 + sway);
    } else if (m.kind === 'pancarte' && m.label) { // mains vides tant qu'aucune pancarte n'est arrivée
      const top = y - 12 - (i % 2) * 14;
      const width = m.label.length > 45 ? 84 : m.label.length > 26 ? 64 : 44; // une longue pancarte est plus large, pas plus haute
      if (!this.reserve(m.label, hand, top, 4.6, width)) return; // elle reste baissée plutôt que d'en cacher une autre
      this.ctx.fillStyle = '#6b3a2a';
      this.ctx.fillRect(hand, y - 8 - (i % 2) * 14, 1, 10 + (i % 2) * 14);
      this.board(m.label, hand, top, { size: 4.6, width });
    }
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

  /** Réserve la place d'un texte à l'écran ; faux si un autre l'occupe déjà. */
  reserve(text, x, y, size, width) {
    const lines = this.wrap(text, size, width);
    const w = Math.max(...lines.map((l) => this.tctx.measureText(l).width)) + 8;
    const box = { x0: x - w / 2, x1: x + w / 2, y0: y - (lines.length - 1) * size * 1.1 - 3, y1: y + size * 1.1 + 3 };
    if (this.boxes.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) return false;
    this.boxes.push(box);
    return true;
  }

  /** Texte centré en (x, y) : contour sombre, ou fond plein si `bg` est donné. */
  label(text, x, y, { size = 6, color = '#f4f4f4', bg = null, width = 0, alpha = 1, stroke = true } = {}) {
    const { tctx } = this;
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
