// Rendu : lit l'état d'une partie (src/sim/game.js) et le dessine. Ne modifie jamais la simulation.
//
// Deux calques superposés : `canvas` en basse résolution (pixels nets, agrandis en CSS)
// et `textCanvas` en pleine résolution pour les textes du monde (pancartes, mots, bulles).

import { sprite } from './sprites.js';

const TILE = 16;
const FONT = "Impact, Haettenschweiler, 'Arial Narrow Bold', 'HelveticaNeue-CondensedBlack', 'Roboto Condensed', sans-serif";
const SKIES = {
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
    this.demo = false; // démo du menu : pas de panneaux par-dessus le titre
    this.clock = 0;
  }

  /** Adapte la taille interne à la zone d'affichage : échelle entière, pixels nets, aucun bord perdu. */
  resize() {
    const box = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(160, Math.floor(box.width * dpr));
    const H = Math.max(120, Math.floor(box.height * dpr));
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
    const t = this.target(game);
    this.cam.x = t.x;
    this.cam.y = t.y;
  }

  target(game) {
    const { hero, world } = game;
    const maxX = Math.max(0, world.w * TILE - this.viewW);
    const maxY = world.h * TILE - this.viewH;
    const x = hero.x + hero.w / 2 - this.viewW / 2 + hero.facing * 28;
    const y = hero.y + hero.h - this.viewH * 0.8; // les pieds du héros aux quatre cinquièmes de l'écran
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
      else if (e.type === 'bubble') this.floaters.push({ x: e.x, y: e.y, text: e.text, t: 1.6, color: e.color || '#f4f4f4' });
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

    this.backWalls(game, cx, cy);
    for (const d of game.decors) if (!this.bundle.decors[d.id]?.devant) this.decor(d);
    this.tiles(game.world, cx, cy);
    for (const p of game.props) this.prop(p);
    game.cortege.forEach((m, i) => this.marcher(m, i));
    const talker = game.enemies.filter((e) => e.bubble && e.state !== 'done')
      .sort((a, b) => Math.abs(a.x - game.hero.x) - Math.abs(b.x - game.hero.x))[0];
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
      this.label(f.text, f.x - cx, f.y - cy, { size: 7, color: f.color, alpha: Math.min(1, f.t * 2) });
    }
    if (game.sign && !this.demo) this.board(game.sign, this.viewW / 2, 30);
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
        if (def.id === 'terre' && (ty === 0 || !world.tiles[(ty - 1) * world.w + tx])) {
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
      if (e.def.fin === 'greve') this.label('EN GRÈVE', cx, e.y - 9 - this.cy, { size: 5, color: '#1a1c2c', bg: '#f4f4f4' });
      else if (Math.floor(this.clock * 3 + e.x) % 3 === 0) this.burst(e.x + e.w / 2, e.y, '#94b0c2', 1, 12);
      return;
    }
    const moving = e.state === 'patrol' || e.state === 'alert' || e.def.deplacement === 'vol';
    this.actor(e, this.frames(s, moving, e.animTime, e.def.deplacement === 'vol' ? 14 : 7), { flash: e.flash > 0 });
    if (e.state === 'stunned') this.label('✶ ✶', e.x + e.w / 2 - this.cx, e.y - 5 - this.cy, { size: 6, color: '#f6c21c' });
    if (e.def.reaction === 'cadre' && e.state === 'alert') this.viewfinder(e);
    if (speaks) this.label(e.bubble.text, e.x + e.w / 2 - this.cx, e.y - 10 - this.cy, { size: 5.5, color: '#1a1c2c', bg: '#f4f4f4', width: 80 });
  }

  /** Le cadre du drone : ce que PANIQUE TV choisit de montrer. */
  viewfinder(e) {
    const { ctx } = this;
    const x = Math.round(e.x + e.w / 2 - 22 - this.cx);
    const y = Math.round(e.y + e.h + 4 - this.cy);
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
  }

  decor(d) {
    const def = this.bundle.decors[d.id];
    if (!def) return;
    const two = def.sprites.image2 && Math.floor(this.clock * 2 + d.x) % 2;
    const img = sprite(two ? def.sprites.image2 : def.sprites.image, this.palette);
    this.ctx.drawImage(img, Math.round(d.x - this.cx), Math.round(d.y - img.height - this.cy));
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
    } else if (m.kind === 'pancarte') {
      this.ctx.fillStyle = '#6b3a2a';
      this.ctx.fillRect(hand, y - 8 - (i % 2) * 14, 1, 10 + (i % 2) * 14);
      this.board(m.label, hand, y - 12 - (i % 2) * 14, { size: 4.6, width: 44 });
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

  /** Texte centré en (x, y) : contour sombre, ou fond plein si `bg` est donné. */
  label(text, x, y, { size = 6, color = '#f4f4f4', bg = null, width = 0, alpha = 1 } = {}) {
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
      if (!bg) {
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
  board(text, x, y, { size = 7, width = 190 } = {}) {
    this.label(text, x, y, { size, color: '#1a1c2c', bg: '#efe6cf', width });
  }
}
