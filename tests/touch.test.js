// Commandes tactiles : quelles actions pour des doigts donnés ?
// Le multi-toucher réel n'est pas vérifiable sur la machine de développement : la règle est
// donc une fonction pure, testée ici, doigt suivi pas à pas comme dans le jeu.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { touchActions, trackPoint, climbAssist, freshJump, ZONES } from '../src/client/input.js';
import { flat, level, play, run, settle } from './sim/helpers.js';

const VIEW = { w: 800, h: 360 }; // un téléphone tenu en paysage
const at = (action) => {
  const t = ZONES.targets.find((z) => z.action === action);
  return { x: t.x * VIEW.w, y: t.y * VIEW.h };
};
/** Un doigt posé en (ox, oy) puis glissé de (dx, dy). */
const finger = (ox, oy, dx = 0, dy = 0) => ({ ox, oy, x: ox + dx, y: oy + dy });
const tap = (action) => finger(at(action).x, at(action).y);
/** Un doigt posé en `from`, glissé jusqu'à `to` en `n` pas, suivi comme dans le jeu ; rend chaque état compris. */
const drag = (from, to, n = 20) => {
  let p = trackPoint(undefined, from, VIEW);
  const seen = [touchActions([p], VIEW)];
  for (let i = 1; i <= n; i++) {
    p = trackPoint(p, { x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n }, VIEW);
    seen.push(touchActions([p], VIEW));
  }
  return { p, seen, end: seen.at(-1) };
};
/** Le manche, posé en (100, 250), poussé à `deg` degrés (0 = droite, 90 = haut) sur `r` pixels. */
const push = (deg, r) => drag({ x: 100, y: 250 }, { x: 100 + r * Math.cos((deg * Math.PI) / 180), y: 250 - r * Math.sin((deg * Math.PI) / 180) }).end;

test('moitié gauche : le manche naît où le pouce se pose, n’importe où', () => {
  for (const [ox, oy] of [[40, 300], [200, 120], [390, 20]]) {
    assert.deepEqual(touchActions([finger(ox, oy)], VIEW), {}, 'posé, sans glisser : rien');
    assert.deepEqual(touchActions([finger(ox, oy, -30)], VIEW), { left: true });
    assert.deepEqual(touchActions([finger(ox, oy, 30)], VIEW), { right: true });
  }
});

test('le manche a une course morte : un pouce qui tremble ne fait pas marcher', () => {
  assert.deepEqual(touchActions([finger(100, 250, ZONES.dead - 1)], VIEW), {});
  assert.deepEqual(touchActions([finger(100, 250, ZONES.dead + 1)], VIEW), { right: true });
});

test('le saut part avant le bout de la course du manche, en avançant ou non', () => {
  assert.ok(ZONES.lift < ZONES.reach, 'le saut part pendant que le manche bouge encore à l’écran');
  assert.deepEqual(touchActions([finger(100, 300, 0, -(ZONES.lift + 2))], VIEW), { jump: true, up: true });
  assert.deepEqual(touchActions([finger(100, 300, 40, -(ZONES.lift + 2))], VIEW), { right: true, jump: true });
  assert.deepEqual(touchActions([finger(100, 300, 30, -(ZONES.lift - 4))], VIEW), { right: true }, 'un petit écart ne suffit pas');
});

test('le manche lu par secteurs : « haut » à 30° près de la verticale, la diagonale avance et saute', () => {
  for (const r of [ZONES.reach, 60, 80]) {
    for (const deg of [62, 75, 90, 105, 118]) assert.deepEqual(push(deg, r), { jump: true, up: true }, `${deg}°, ${r} px : on vise en haut, sans marcher`);
    assert.deepEqual(push(45, r), { right: true, jump: true }, `45°, ${r} px : on avance et on saute, le tir reste devant`);
    assert.deepEqual(push(135, r), { left: true, jump: true });
  }
  assert.deepEqual(push(10, 40), { right: true }, 'presque à plat : on avance');
  // Le pouce qui avance (le manche le suit), puis remonte : en haut de l'anneau, il vise en haut.
  let p = trackPoint(undefined, { x: 100, y: 250 }, VIEW);
  for (let x = 104; x <= 160; x += 4) p = trackPoint(p, { x, y: 250 }, VIEW);
  assert.deepEqual(touchActions([p], VIEW), { right: true });
  for (let k = 1; k <= 10; k++) p = trackPoint(p, { x: 160 - 4 * k, y: 250 - 5 * k }, VIEW);
  assert.deepEqual(touchActions([p], VIEW), { jump: true, up: true });
});

test('sorti de l’anneau, le pouce garde sa direction : l’anneau le suit', () => {
  // Le pouce part loin en haut à gauche, bien au-delà de la course du manche, et y reste.
  const { p, seen } = drag({ x: 150, y: 250 }, { x: 70, y: 170 }, 20);
  assert.ok(Math.hypot(p.x - p.ox, p.oy - p.y) <= ZONES.reach + 0.01, 'l’anneau suit le pouce');
  assert.deepEqual(seen.at(-1), { left: true, jump: true }, 'toujours en haut à gauche');
  assert.ok(seen.slice(8).every((s) => s.left && s.jump), 'sans perdre l’appui en chemin');
  // Et loin à droite, presque à plat : on avance, sans sauter.
  assert.deepEqual(drag({ x: 150, y: 250 }, { x: 300, y: 225 }).end, { right: true });
});

test('moitié droite : chaque cible répond, et tout l’écran répond (la plus proche gagne)', () => {
  assert.deepEqual(touchActions([tap('fire')], VIEW), { fire: true });
  assert.deepEqual(touchActions([tap('jump')], VIEW), { jump: true });
  assert.deepEqual(touchActions([tap('special')], VIEW), { special: true });
  assert.deepEqual(touchActions([finger(790, 350)], VIEW), { fire: true }, 'le coin en bas à droite : tir');
  assert.deepEqual(touchActions([finger(790, 10)], VIEW), { fire: true, up: true }, 'le coin en haut à droite, loin de SPÉ : tir en haut');
  assert.deepEqual(touchActions([finger(420, 350)], VIEW), { jump: true }, 'le bas, près du milieu : saut');
  for (let x = 410; x < 800; x += 30) {
    for (let y = 5; y < 360; y += 30) assert.ok(Object.keys(touchActions([finger(x, y)], VIEW)).length >= 1, `(${x}, ${y}) ne fait rien`);
  }
});

test('SPÉ ne part que d’un appui posé dessus, jamais d’un pouce qui glisse depuis TIR ou SAUT', () => {
  for (const from of ['fire', 'jump']) {
    const { seen, end } = drag(at(from), at('special'));
    assert.ok(seen.every((s) => !s.special), `glissé de ${from} jusqu’à SPÉ : pas de spéciale`);
    assert.ok(end.fire || end.jump, 'il garde son action');
  }
  const edge = at('special');
  assert.deepEqual(touchActions([finger(edge.x, edge.y + ZONES.press * VIEW.h - 2)], VIEW), { special: true }, 'posé sur le bord de SPÉ');
  const between = finger((at('fire').x + edge.x) / 2, (at('fire').y + edge.y) / 2);
  assert.ok(!touchActions([between], VIEW).special, 'posé entre TIR et SPÉ : pas de spéciale');
  // Et un doigt posé sur SPÉ reste SPÉ : glissé jusqu'à TIR, il ne tire pas.
  const { seen } = drag(edge, at('fire'));
  assert.ok(seen.every((s) => s.special && !s.fire && !s.jump));
});

test('TIR glissé vers le haut : le tir vise en haut ; le glissement entre SAUT et TIR reste', () => {
  const fire = at('fire');
  const rise = ZONES.aim * VIEW.h;
  assert.deepEqual(drag(fire, { x: fire.x, y: fire.y - 20 }).end, { fire: true }, 'un pouce qui bouge un peu sur TIR : tir devant');
  assert.deepEqual(drag(fire, { x: fire.x, y: fire.y - rise - 4 }).end, { fire: true, up: true });
  assert.deepEqual(drag(fire, { x: fire.x + 10, y: fire.y - 2 * rise }).end, { fire: true, up: true }, 'plus haut, un peu de côté');
  const { seen, end } = drag(at('jump'), fire);
  assert.deepEqual(seen[0], { jump: true });
  const on = seen.findIndex((s) => s.fire);
  assert.ok(seen.slice(0, on).every((s) => s.jump && !s.fire), 'il saute jusqu’à arriver sur TIR');
  assert.deepEqual(end, { fire: true });
  assert.deepEqual(drag(fire, at('jump')).end, { jump: true }, 'et dans l’autre sens');
});

// « je me retrouve à tirer sans l'avoir voulu » : sur les deux tailles d'iPhone tenu en paysage.
const PHONES = [{ w: 844, h: 390 }, { w: 750, h: 342 }];
const spotIn = (view, action) => {
  const t = ZONES.targets.find((z) => z.action === action);
  return { x: t.x * view.w, y: t.y * view.h };
};
/** Le point à `k` (fraction du petit côté) du centre de `from`, en direction de `to`. */
const toward = (view, from, to, k) => {
  const [a, b] = [spotIn(view, from), spotIn(view, to)];
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const r = k * Math.min(view.w, view.h);
  return { x: a.x + ((b.x - a.x) * r) / d, y: a.y + ((b.y - a.y) * r) / d };
};

test('un pouce posé sur SAUT qui roule vers TIR ne tire pas tant qu’il n’est pas sur TIR', () => {
  for (const view of PHONES) {
    let p = trackPoint(undefined, spotIn(view, 'jump'), view);
    // Le pouce glisse jusqu'au bord de TIR (rayon 0,105 à l'écran), sans y entrer.
    for (let k = 0.01; k <= 0.22; k += 0.01) {
      p = trackPoint(p, toward(view, 'jump', 'fire', k), view);
      assert.deepEqual(touchActions([p], view), { jump: true }, `${view.w}×${view.h}, ${Math.round(k * Math.min(view.w, view.h))} px vers TIR`);
    }
    // Et en haut à droite de SAUT, là où le pouce remonte en appuyant : toujours le saut seul.
    const j = spotIn(view, 'jump');
    for (let dy = 0; dy <= 60; dy += 6) {
      p = trackPoint(p, { x: j.x + dy, y: j.y - dy }, view);
      assert.ok(!touchActions([p], view).fire, `${view.w}×${view.h}, remonté de ${dy} px`);
    }
  }
});

test('un pouce qui vise SAUT et tombe à côté, du côté de TIR, saute sans tirer', () => {
  for (const view of PHONES) {
    for (const k of [0.12, 0.15, 0.17]) {
      const p = trackPoint(undefined, toward(view, 'jump', 'fire', k), view);
      assert.deepEqual(touchActions([p], view), { jump: true }, `${view.w}×${view.h}, posé à ${Math.round(k * Math.min(view.w, view.h))} px de SAUT`);
    }
  }
});

test('SPÉ manquée de peu fait la spéciale, pas un tir', () => {
  for (const view of PHONES) {
    const s = spotIn(view, 'special');
    const unit = Math.min(view.w, view.h);
    // SPÉ fait 15 % du petit côté à l'écran : posé à gauche, au-dessus, à droite, un peu hors du disque.
    for (const [dx, dy] of [[-0.12, 0], [0, -0.12], [0.1, 0], [-0.09, 0.06]]) {
      const p = trackPoint(undefined, { x: s.x + dx * unit, y: s.y + dy * unit }, view);
      assert.deepEqual(touchActions([p], view), { special: true }, `${view.w}×${view.h}, (${dx}, ${dy})`);
    }
  }
});

test('le pouce à cheval entre TIR et SAUT fait les deux ; jamais avec SPÉ', () => {
  const fire = at('fire');
  const jump = at('jump');
  const middle = finger((fire.x + jump.x) / 2, (fire.y + jump.y) / 2);
  assert.deepEqual(touchActions([middle], VIEW), { fire: true, jump: true });
  const special = at('special');
  const between = finger((fire.x + special.x) / 2, (fire.y + special.y) / 2 - 1);
  assert.ok(!touchActions([between], VIEW).special && !touchActions([between], VIEW).jump, 'entre TIR et SPÉ : le tir, seul');
});

test('deux pouces : avancer et tirer ; trois doigts : avancer, tirer, sauter', () => {
  assert.deepEqual(touchActions([finger(120, 260, 40), tap('fire')], VIEW), { right: true, fire: true });
  assert.deepEqual(touchActions([finger(120, 260, -40), tap('fire'), tap('jump')], VIEW), { left: true, fire: true, jump: true });
});

test('un doigt garde son côté : parti de la droite, il reste une action même s’il glisse à gauche', () => {
  // Suivi réel du doigt, pas à pas : posé à droite de la frontière, il glisse loin à gauche.
  let p = trackPoint(undefined, { x: 500, y: 300 }, VIEW);
  for (let x = 480; x >= 200; x -= 20) p = trackPoint(p, { x, y: 300 }, VIEW);
  assert.equal(p.stick, false);
  assert.equal(p.ox, 500, 'son origine ne bouge pas : ce n’est pas un manche');
  const pressed = touchActions([p], VIEW);
  assert.ok(!pressed.left && !pressed.right, 'il ne fait pas marcher');
  assert.ok(pressed.jump || pressed.fire || pressed.special, 'il reste une action');

  // Et l'inverse : un manche tiré loin à droite reste un manche.
  let stick = trackPoint(undefined, { x: 380, y: 300 }, VIEW);
  for (let x = 400; x <= 700; x += 20) stick = trackPoint(stick, { x, y: 300 }, VIEW);
  assert.equal(stick.stick, true);
  assert.deepEqual(touchActions([stick], VIEW), { right: true });
  assert.deepEqual(touchActions([], VIEW), {});
});

test('tirer le manche vers le bas : on vise en bas, sans avancer ; poussé droit vers le haut : le tir suit le saut', () => {
  assert.deepEqual(touchActions([finger(100, 200, 4, ZONES.pull + 2)], VIEW), { down: true });
  assert.deepEqual(touchActions([finger(100, 200, 14, ZONES.pull + 2)], VIEW), { down: true }, 'un pouce n’est jamais parfaitement droit');
  assert.deepEqual(touchActions([finger(100, 200, 40, ZONES.pull + 2)], VIEW), { right: true }, 'en diagonale vers le bas : on avance');
  assert.deepEqual(touchActions([finger(100, 200, 0, ZONES.pull - 4)], VIEW), {});
  const lift = -(ZONES.lift + 2);
  assert.deepEqual(touchActions([finger(100, 300, 0, lift)], VIEW), { jump: true, up: true });
  assert.deepEqual(touchActions([finger(100, 300, 40, lift)], VIEW), { right: true, jump: true }, 'en avançant : un saut, le tir reste devant');
  // Le pouce redescend après un saut : on mesure depuis le point le plus haut atteint.
  assert.deepEqual(touchActions([{ ox: 100, oy: 300, ay: 240, x: 100, y: 240 + ZONES.pull + 2 }], VIEW), { down: true });
});

test('dans la partie : on vise en haut au pouce, et un glissement jusqu’à SPÉ ne dépense rien', () => {
  const fire = at('fire');
  /** Un doigt glissé de `from` à `to` en dix pas, puis tenu ; `others` : les doigts posés à côté. */
  const gesture = (game, from, to, others = []) => {
    let p = trackPoint(undefined, from, VIEW);
    run(game, 30, (i) => {
      const k = Math.min(1, i / 10);
      p = trackPoint(p, { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k }, VIEW);
      return touchActions([p, ...others], VIEW);
    });
  };
  let game = settle(play(flat()));
  gesture(game, fire, { x: fire.x, y: fire.y - ZONES.aim * VIEW.h - 10 });
  assert.equal(game.hero.aim, -1, 'TIR glissé vers le haut : le héros vise en haut');
  game = settle(play(flat()));
  gesture(game, { x: 100, y: 250 }, { x: 120, y: 200 }, [trackPoint(undefined, fire, VIEW)]);
  assert.equal(game.hero.aim, -1, 'TIR tenu, pouce gauche vers le haut un peu de biais : le héros vise en haut');

  game = settle(play(flat()));
  const charges = game.hero.charges;
  assert.ok(charges > 0, 'le héros d’essai a une spéciale');
  gesture(game, fire, at('special'));
  gesture(game, at('jump'), at('special'));
  assert.equal(game.hero.charges, charges, 'glissé de TIR ou de SAUT jusqu’à SPÉ : aucune charge dépensée');
  run(game, 10, () => touchActions([tap('special')], VIEW));
  assert.equal(game.hero.charges, charges - 1, 'un appui sur SPÉ : une charge');
});

// Le passage de la vidéo de Valentin (Bismillah, la garde à vue à l'étage), en petit : une trouée de deux tuiles entre
// un pilier et le bord d'un étage cinq tuiles plus haut, l'étage suivant au-dessus. Un saut n'y suffit pas : il faut
// grimper au pilier.
const SHAFT = level([
  '....................',
  '...AAAAAAAAAAAAAAAAA',
  '...A................',
  '...A................',
  '...A................',
  '...A................',
  '...A..AAAAAAAAAAAAAA',
  '...A................',
  '...A................',
  '...A................',
  '...AD..............S',
  'AAAAAAAAAAAAAAAAAAAA',
]);
// Un coin sous un plafond bas : grimper n'y mène nulle part.
const CORNER = level([
  'AAAAAAAAAAAAAAAAAAAA',
  '...A................',
  '...A................',
  '...A................',
  '...AD..............S',
  'AAAAAAAAAAAAAAAAAAAA',
]);
// Le héros part collé au bord gauche de la carte.
const EDGE = level([
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  '....................',
  'D..................S',
  'AAAAAAAAAAAAAAAAAAAA',
]);

/**
 * Joue un geste du pouce gauche, `offset(pas, partie)` : son décalage depuis où il s'est posé. `fire` : TIR tenu.
 * Rend les pas où le héros a sauté, s'il a tenu sur l'étage du puits, combien il s'est déplacé, s'il a visé en haut.
 */
function gesture(lvl, offset, { assist = true, steps = 300, fire = false, saut = () => false } = {}) {
  const game = settle(play(lvl));
  const memo = {};
  const x0 = game.hero.x;
  const jumps = [];
  let stick = null;
  let top = game.hero.y;
  let aimedUp = 0;
  let shelf = false;
  for (let i = 0; i < steps; i++) {
    const o = offset(i, game);
    stick = trackPoint(stick, { x: 130 + o.dx, y: 260 + o.dy }, VIEW);
    const button = saut(i);
    const right = [fire && trackPoint(undefined, at('fire'), VIEW), button && trackPoint(undefined, at('jump'), VIEW)];
    let touch = touchActions([stick, ...right.filter(Boolean)], VIEW);
    if (assist) touch = climbAssist(touch, game.hero, game.world, memo, button);
    if (run(game, 1, touch).some((e) => e.type === 'sfx' && e.id === 'saut')) jumps.push(i);
    top = Math.min(top, game.hero.y);
    if (game.hero.aim === -1) aimedUp++;
    if (game.hero.onGround && game.hero.y + game.hero.h <= 6 * 16 + 1) shelf = true;
  }
  return { jumps, shelf, top, moved: Math.abs(game.hero.x - x0), aimedUp: aimedUp / steps };
}
const ramp = (to) => (i) => ({ dx: (to.dx * Math.min(i, 6)) / 6, dy: (to.dy * Math.min(i, 6)) / 6 });
/** Le joueur de la vidéo : pouce en haut à gauche, vers le pilier ; arrivé assez haut, il le penche vers l'étage. */
const toPillarThenShelf = (i, game) => (game.hero.y + game.hero.h < 6 * 16 - 8 ? { dx: 45, dy: -10 } : ramp({ dx: -60, dy: -60 })(i));
/** Au plus `n` sauts dans n'importe quelle seconde. */
const atMostPerSecond = (jumps, n) => jumps.every((t) => jumps.filter((u) => u >= t && u < t + 60).length <= n);

test('grimper au pouce : penché vers le pilier, saut tenu, le héros grimpe ; penché vers l’étage, il y passe', () => {
  assert.equal(gesture(SHAFT, toPillarThenShelf, { assist: false }).shelf, false, 'sans l’aide, un saut tenu ne suffit pas');
  const climb = gesture(SHAFT, toPillarThenShelf);
  assert.equal(climb.shelf, true);
  assert.ok(atMostPerSecond(climb.jumps, 4), `rebonds au rythme d’un pouce : ${climb.jumps}`);
});

test('la vidéo : manche penché vers le pilier qui tient le saut, SAUT tapé ; chaque appui rebondit, comme au clavier', () => {
  const taps = (i) => i < 90 && i % 20 < 8; // trois appuis par seconde, une seconde et demie, puis vers l'étage
  const video = gesture(SHAFT, (i) => (i < 90 ? ramp({ dx: -60, dy: -60 })(i) : { dx: 45, dy: -10 }), { saut: taps });
  assert.equal(video.shelf, true);
  // Sous un plafond, l'aide ne rebondit plus d'elle-même, mais un appui sur SAUT reste un rebond.
  const corner = gesture(CORNER, ramp({ dx: -60, dy: -60 }), { steps: 240, saut: (i) => i % 20 < 8 });
  assert.ok(corner.jumps.length >= 8, `${corner.jumps.length} sauts pour 12 appuis`);
});

test('pouce tout droit en haut, TIR tenu : il saute et tire en haut, sans être tiré vers le mur', () => {
  const straight = gesture(SHAFT, ramp({ dx: 0, dy: -50 }), { fire: true, steps: 120 });
  assert.equal(straight.moved, 0, 'pas un pixel de côté, contre le pilier comme au clavier');
  assert.equal(straight.jumps.length, 1, 'un saut, comme ↑ tenu au clavier');
  assert.ok(straight.aimedUp > 0.9, `le tir reste en haut (${Math.round(straight.aimedUp * 100)} % des pas)`);
  assert.equal(gesture(SHAFT, ramp({ dx: 0, dy: -50 })).shelf, false, 'il ne grimpe pas : il faut pencher le pouce vers le mur');
});

test('sous un plafond, contre un mur : pas de rebonds à répétition', () => {
  const corner = gesture(CORNER, ramp({ dx: -60, dy: -60 }), { steps: 240 });
  assert.ok(atMostPerSecond(corner.jumps, 3), `sauts : ${corner.jumps.length} en 4 s, aux pas ${corner.jumps}`);
  assert.ok(corner.jumps.length <= 3, `sauts : ${corner.jumps.length} en 4 s`);
});

test('le bord de la carte n’est pas un mur où grimper', () => {
  const edge = gesture(EDGE, ramp({ dx: -60, dy: -60 }), { steps: 240 });
  assert.equal(edge.jumps.length, 1, 'un saut, pas de rebonds contre le bord');
  assert.ok(edge.top > 0, `il ne sort pas par le haut (y le plus haut : ${Math.round(edge.top)})`);
});

test('un pouce qui tremble de ±3 px, à n’importe quel angle : un saut, et ni la marche ni le haut ne clignotent', () => {
  let seed = 7;
  const shake = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 6;
  for (const r of [50, 70]) {
    for (let deg = 0; deg <= 180; deg += 3) {
      const to = { dx: r * Math.cos((deg * Math.PI) / 180), dy: -r * Math.sin((deg * Math.PI) / 180) };
      let p = trackPoint(undefined, { x: 130, y: 260 }, VIEW);
      for (let i = 1; i <= 8; i++) p = trackPoint(p, { x: 130 + (to.dx * i) / 8, y: 260 + (to.dy * i) / 8 }, VIEW);
      let prev = touchActions([p], VIEW);
      const flips = { jump: 0, walk: 0, up: 0 };
      for (let i = 0; i < 120; i++) {
        p = trackPoint(p, { x: 130 + to.dx + shake(), y: 260 + to.dy + shake() }, VIEW);
        const now = touchActions([p], VIEW);
        if (now.jump && !prev.jump) flips.jump++;
        if (Boolean(now.left || now.right) !== Boolean(prev.left || prev.right)) flips.walk++;
        if (Boolean(now.up) !== Boolean(prev.up)) flips.up++;
        prev = now;
      }
      assert.ok(flips.jump <= 1 && flips.walk <= 1 && flips.up <= 1, `${deg}°, ${r} px : ${JSON.stringify(flips)}`);
    }
  }
});

test('l’aide à la grimpe ne touche qu’au saut tenu en l’air, pouce penché : sinon les doigts passent tels quels', () => {
  const world = { solid: () => true };
  const grounded = { x: 16, y: 0, w: 10, h: 14, vy: 0, onGround: true };
  const touch = { right: true, jump: true };
  assert.equal(climbAssist(touch, grounded, world, {}), touch);
  const air = { ...grounded, onGround: false, vy: 10 };
  const walk = { right: true, fire: true };
  assert.equal(climbAssist(walk, air, world, {}), walk);
  const straight = { jump: true, up: true, fire: true };
  assert.equal(climbAssist(straight, air, world, {}), straight, 'pouce tout droit en haut : rien ne change');
  assert.deepEqual(climbAssist({}, air, world, {}), {}, 'le clavier et la manette ne passent pas par là');
});

// « Bug sur mobile : Haut et Saut en même temps ça bug. Le Saut ne fait rien. » Le manche poussé en haut tient déjà le
// saut : SAUT enfoncé par-dessus doit pourtant faire sauter, comme Espace tapé avec ↑ tenu au clavier.
/** Le pouce gauche tenu tout droit en haut, au sol ; SAUT tapé par le pouce droit aux pas que dit `saut`. */
function upThenJump(saut, { fire = false, steps = 200 } = {}) {
  const game = settle(play(flat()));
  const memo = {};
  const jumps = [];
  let stick = trackPoint(undefined, { x: 130, y: 260 }, VIEW);
  let vy = 0;
  let aimedUp = 0;
  for (let i = 0; i < steps; i++) {
    stick = trackPoint(stick, { x: 130, y: 260 - 50 * Math.min(i, 6) / 6 }, VIEW);
    const button = saut(i);
    const right = [fire && trackPoint(undefined, at('fire'), VIEW), button && trackPoint(undefined, at('jump'), VIEW)];
    const touch = touchActions([stick, ...right.filter(Boolean)], VIEW);
    const sources = [touchActions([stick], VIEW).jump && 'manche', button && 'SAUT'].filter(Boolean);
    const jumpPressed = freshJump(sources, memo) && Boolean(touch.jump);
    const before = game.hero.onGround;
    if (run(game, 1, { ...touch, jumpPressed }).some((e) => e.type === 'sfx' && e.id === 'saut')) {
      jumps.push(i);
      if (before) vy = Math.min(vy, game.hero.vy);
    }
    if (game.hero.aim === -1) aimedUp++;
  }
  return { jumps, vy, aimedUp: aimedUp / steps, game };
}

test('deux doigts : le manche en haut et SAUT, chacun dit le saut ; SAUT par-dessus est un nouvel appui', () => {
  let stick = trackPoint(undefined, { x: 130, y: 260 }, VIEW);
  for (let i = 1; i <= 6; i++) stick = trackPoint(stick, { x: 130, y: 260 - (50 * i) / 6 }, VIEW);
  const button = trackPoint(undefined, at('jump'), VIEW);
  assert.deepEqual(touchActions([stick], VIEW), { jump: true, up: true });
  assert.deepEqual(touchActions([stick, button], VIEW), { jump: true, up: true }, 'les deux doigts comptent');
  const memo = {};
  assert.equal(freshJump(['manche'], memo), true, 'le manche poussé : un appui');
  assert.equal(freshJump(['manche'], memo), false, 'tenu : plus d’appui');
  assert.equal(freshJump(['manche', 'SAUT'], memo), true, 'SAUT enfoncé par-dessus : un nouvel appui');
  assert.equal(freshJump(['manche', 'SAUT'], memo), false);
  assert.equal(freshJump(['manche'], memo), false, 'SAUT relâché : rien');
  assert.equal(freshJump(['ArrowUp', 'Space'], {}), true);
});

test('Haut tenu au sol puis SAUT : le héros saute, à chaque appui', () => {
  const held = upThenJump((i) => i >= 100 && i < 108);
  assert.equal(held.jumps.length, 2, `un saut au manche, puis un à SAUT (${held.jumps})`);
  assert.ok(held.jumps[1] >= 100 && held.jumps[1] < 104, `SAUT fait sauter tout de suite (pas ${held.jumps[1]})`);
  assert.ok(held.vy < 0, 'il monte');
  const taps = upThenJump((i) => i >= 60 && i % 40 < 8, { steps: 260 });
  assert.ok(taps.jumps.length >= 5, `chaque appui posé au sol est un saut (${taps.jumps})`);
});

test('Haut tenu, SAUT tapé, TIR tenu : il saute et le tir reste en haut', () => {
  const both = upThenJump((i) => i >= 100 && i < 108, { fire: true });
  assert.equal(both.jumps.length, 2);
  assert.ok(both.aimedUp > 0.9, `le tir reste en haut (${Math.round(both.aimedUp * 100)} % des pas)`);
});

test('la simulation : saut tenu par une touche, un nouvel appui d’une autre fait sauter ; sans, rien', () => {
  const game = settle(play(flat()));
  run(game, 90, { jump: true, up: true }); // ↑ tenu : un saut, puis posé
  assert.ok(game.hero.onGround);
  run(game, 1, { jump: true, up: true });
  assert.ok(game.hero.onGround, 'tenu sans nouvel appui : il reste au sol');
  run(game, 1, { jump: true, up: true, jumpPressed: true });
  assert.ok(game.hero.vy < 0, 'Espace par-dessus ↑ : il saute');
});
