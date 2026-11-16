// Un écran qui se lit : les notes passent une à une, les textes flottants ne s'empilent pas,
// les pancartes du cortège ne clignotent pas, les petits textes restent lisibles sur téléphone.
// Le rendu tourne ici sur un faux canevas : on vérifie ses décisions, pas ses pixels.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../tools/content.mjs';
import { queueNote, readTime } from '../src/client/ui.js';

// ---------------------------------------------------------------- un faux canevas

let measured = 0;
function fakeContext() {
  const state = { font: '10px sans-serif' };
  return new Proxy(state, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'measureText') {
        return (text) => {
          measured++;
          return { width: text.length * parseFloat(target.font) * 0.5 };
        };
      }
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
}
const fakeCanvas = () => ({ width: 0, height: 0, style: {}, getContext: fakeContext });
globalThis.document ??= { createElement: fakeCanvas, body: { classList: { contains: () => false } } };

const { Renderer } = await import('../src/client/render.js');
const { bundle } = loadContent();

function renderer(ratio = 3) {
  const r = new Renderer(fakeCanvas(), fakeCanvas(), bundle);
  r.ratio = ratio;
  r.viewW = 384;
  r.viewH = 216;
  r.cx = 0;
  r.cy = 0;
  r.boxes = [];
  return r;
}
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

// ---------------------------------------------------------------- notes de déblocage

test('les notes attendent leur tour ; une rafale du même genre se replie en une seule', () => {
  const notes = [];
  queueNote(notes, { text: 'Pancarte commune débloquée : « A »', tone: 'rarete-0', group: 'pancartes' });
  assert.equal(notes.length, 1);
  assert.equal(notes[0].text, 'Pancarte commune débloquée : « A »', 'seule, elle garde son texte');
  queueNote(notes, { text: 'Pancarte légendaire débloquée : « B »', tone: 'rarete-3', group: 'pancartes' });
  queueNote(notes, { text: 'Pancarte rare débloquée : « C »', tone: 'rarete-1', group: 'pancartes' });
  assert.equal(notes.length, 1);
  assert.equal(notes[0].text, '3 pancartes débloquées', 'toutes les raretés se replient pareil');
  assert.equal(notes[0].tone, 'rarete-3', 'le bord a la couleur de la plus rare');
  queueNote(notes, { text: 'Débloqué : La BAC', group: 'cartes' });
  queueNote(notes, { text: 'Débloqué : Les CRS', group: 'cartes' });
  assert.deepEqual(notes.map((n) => n.text), ['3 pancartes débloquées', '2 cartes débloquées']);
});

test('une note reste le temps d’être lue', () => {
  assert.equal(readTime('2 pancartes débloquées'), 2.5);
  assert.ok(readTime('Pancarte commune débloquée : « LA RETRAITE AVANT L’ARTHRITE, ET PLUS VITE QUE ÇA »') > 3.5);
  assert.equal(readTime('x'.repeat(400)), 4, 'jamais plus de quatre secondes');
});

// ---------------------------------------------------------------- textes flottants

test('les textes flottants nés au même endroit se décalent, quatre au plus', () => {
  const r = renderer();
  const slogans = ['DE L’ARGENT POUR L’HÔPITAL', 'LA RETRAITE AVANT L’ARTHRITE', 'ON EST LÀ', 'TOUS ENSEMBLE', 'GRÈVE GÉNÉRALE'];
  r.absorb(slogans.map((text) => ({ type: 'bubble', x: 200, y: 120, text })));
  const alive = r.floaters.filter((f) => f.t > 0.25);
  assert.equal(alive.length, 4, 'le plus ancien s’efface');
  r.placeFloaters([]);
  const boxes = alive.map((f) => r.textBox(f.text, f.x, f.y, f.size, 150));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlap(boxes[i], boxes[j]), `${alive[i].text} / ${alive[j].text}`);
});

test('un texte qui a sa place (une ligne qui cède, un coup) n’est ni évincé ni déplacé', () => {
  const r = renderer();
  const line = { x: 200, y: 180, rise: 0, text: '✊ 512 / 500', t: 2.2, bg: '#257953', size: 7.5, keep: true };
  const cry = { x: 200, y: 194, rise: 0, text: 'ON EST LÀ !', t: 2.2, size: 12, keep: true };
  r.float(line);
  r.float(cry);
  r.absorb(['UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ'].map((text) => ({ type: 'bubble', x: 200, y: 190, text })));
  assert.ok(line.t > 0.25 && cry.t > 0.25, 'jamais évincés');
  assert.ok(r.floaters.filter((f) => f.t > 0.25).length <= 4, 'les autres cèdent la place');
  r.placeFloaters([]);
  assert.equal(line.y, 180);
  assert.equal(cry.y, 194);
  const fixed = [line, cry].map((f) => r.textBox(f.text, f.x, f.y, f.size, 150));
  for (const f of r.floaters.filter((g) => !g.keep && g.t > 0.25)) {
    const box = r.textBox(f.text, f.x, f.y, f.size, 150);
    assert.ok(fixed.every((b) => !overlap(box, b)), `${f.text} passe autour`);
  }
});

test('« TOUCHÉ » monte au-dessus d’une sommation ; le compteur au pied d’une ligne ne bouge pas', () => {
  const r = renderer();
  const hurt = { x: 200, y: 96, text: 'TOUCHÉ', t: 1, size: 8, keep: true };
  const line = { x: 200, y: 100, rise: 0, text: '✊ 312 / 500', t: 2, size: 7.5, keep: true };
  r.float(hurt);
  r.float(line);
  r.voice = r.textBox('Obéissance à la loi. Dispersez-vous.', 200, 96, 5.5, 80);
  r.placeFloaters([r.voice]);
  assert.ok(!overlap(r.textBox(hurt.text, hurt.x, hurt.y, hurt.size, 150), r.voice), 'la sommation reste lisible');
  assert.equal(line.y, 100, 'au pied de la ligne, il garde sa place');
});

test('deux gains au même moment et au même endroit font un seul nombre', () => {
  const r = renderer();
  r.absorb([{ type: 'recruit', x: 100, y: 150, n: 20 }, { type: 'recruit', x: 120, y: 150, n: 30 }]);
  assert.deepEqual(r.floaters.map((f) => f.text), ['+ 50']);
});

test('un texte flottant ne passe jamais sur la voix d’en face (une sommation)', () => {
  const r = renderer();
  r.absorb([{ type: 'bubble', x: 200, y: 100, text: 'DÉSOBÉISSONS !' }]);
  const voice = r.textBox('Obéissance à la loi. Dispersez-vous.', 200, 96, 5.5, 80);
  r.placeFloaters([voice]);
  const [f] = r.floaters;
  assert.ok(!overlap(r.textBox(f.text, f.x, f.y, f.size, 150), voice));
});

// ---------------------------------------------------------------- pancartes du cortège

/** Un cortège serré dont les pancartes se gênent ; il piétine (voir `step`). */
function crowd(n = 12) {
  return Array.from({ length: n }, (_, i) => ({
    x: 60 + i * 12, y: 170, facing: 1, kind: ['pancarte', 'drapeau', 'fanfare'][i % 3],
    label: i % 3 === 0 ? `UNE PANCARTE ASSEZ LONGUE NUMÉRO ${i}` : '', gassed: 0, animTime: 0,
  }));
}

/** Chacun avance et recule de quelques pixels, pas en même temps : les pancartes se touchent puis se lâchent sans cesse. */
const step = (cortege, frame) => cortege.forEach((m, i) => { m.x = 60 + i * 12 + Math.round(6 * Math.sin(frame * 0.35 + i * 1.3)); });

test('une pancarte levée le reste une seconde ; baissée, elle attend une demi-seconde', () => {
  // Avec l'ancienne règle (premier arrivé, recalculé à chaque image), ce cortège changeait 134 fois en dix secondes.
  const r = renderer();
  const cortege = crowd();
  const history = new Map(cortege.map((m) => [m, []]));
  for (let frame = 0; frame < 600; frame++) {
    r.clock = frame / 60;
    step(cortege, frame);
    r.boxes = [];
    r.raiseSigns(cortege);
    for (const m of cortege) history.get(m).push(r.raised.has(m));
  }
  let changes = 0;
  for (const [m, seen] of history) {
    if (m.kind !== 'pancarte') continue;
    let run = 1;
    for (let k = 1; k < seen.length; k++) {
      if (seen[k] === seen[k - 1]) { run++; continue; }
      changes++;
      if (seen[k - 1]) assert.ok(run >= 60, `levée ${run} images seulement`);
      else if (k - run > 0) assert.ok(run >= 30, `rebaissée puis relevée après ${run} images`);
      run = 1;
    }
  }
  assert.ok(changes <= 10, `${changes} changements en dix secondes`);
  assert.ok([...history].some(([m, seen]) => m.kind === 'pancarte' && seen.at(-1)), 'des pancartes restent levées');
});

test('devant le héros, une pancarte se baisse tout de suite', () => {
  const r = renderer();
  const cortege = crowd(1);
  r.clock = 0;
  r.raiseSigns(cortege);
  assert.ok(r.raised.has(cortege[0]));
  r.clock = 0.1;
  r.boxes = [{ x0: 0, x1: 384, y0: 0, y1: 216 }]; // le héros réservé : toute la vue, pour l'exemple
  r.raiseSigns(cortege);
  assert.ok(!r.raised.has(cortege[0]));
});

test('les porteurs lèvent leur pancarte à tour de rôle : une sur deux à la fois, toutes à leur tour', () => {
  const r = renderer();
  // Neuf porteurs bien espacés : rien ne les gêne, seul leur tour décide.
  const cortege = Array.from({ length: 27 }, (_, i) => ({
    x: 20 + i * 14, y: 170 + (Math.floor(i / 3) % 2) * 40, facing: 1, kind: ['pancarte', 'drapeau', 'fanfare'][i % 3],
    label: i % 3 === 0 ? 'ON LÂCHE RIEN' : '', gassed: 0, animTime: 0,
  }));
  r.viewW = 600;
  const carriers = cortege.filter((m) => m.kind === 'pancarte');
  const ever = new Set();
  let raised = 0;
  let counted = 0;
  for (let frame = 0; frame < 60 * 42; frame++) {
    r.clock = frame / 60;
    r.boxes = [];
    r.raiseSigns(cortege);
    if (r.clock < 6) continue; // les six premières secondes, toutes viennent d'arriver : toutes levées
    counted++;
    raised += r.raised.size;
    for (const m of r.raised) ever.add(m);
  }
  assert.equal(ever.size, carriers.length, 'chaque pancarte a son tour');
  const share = raised / counted / carriers.length;
  assert.ok(share > 0.4 && share < 0.6, `levées ${(100 * share).toFixed(0)} % du temps`);
});

test('une pancarte qui vient d’arriver se lève tout de suite, puis rejoint la rotation', () => {
  const r = renderer();
  const cortege = Array.from({ length: 12 }, (_, i) => ({
    x: 20 + i * 30, y: 170 + (Math.floor(i / 3) % 2) * 40, facing: 1, kind: ['pancarte', 'drapeau', 'fanfare'][i % 3],
    label: i % 3 === 0 ? `PANCARTE ${i}` : '', gassed: 0, animTime: 0,
  }));
  r.viewW = 600;
  const carriers = cortege.filter((m) => m.kind === 'pancarte');
  for (let frame = 0; frame < 60 * 20; frame++) {
    r.clock = frame / 60;
    r.boxes = [];
    r.raiseSigns(cortege);
  }
  // À 20 s, chacune est dans la rotation : on donne une pancarte nouvelle à un porteur dont ce n'est pas le tour.
  const resting = carriers.find((m) => !r.raised.has(m));
  assert.ok(resting, 'un porteur au repos');
  resting.label = 'ELLE VIENT D’ARRIVER';
  r.clock += 1 / 60;
  r.boxes = [];
  r.raiseSigns(cortege);
  assert.ok(r.raised.has(resting), 'levée tout de suite');
});

test('une recrue sur plusieurs, à quelques secondes d’écart, crie son slogan ; le gain s’affiche toujours', () => {
  const r = renderer();
  const join = (x, text) => r.absorb([{ type: 'recruit', x, y: 150, n: 20 }, { type: 'bubble', x, y: 144, text }]);
  r.clock = 0;
  join(100, 'LA RETRAITE AVANT L’ARTHRITE');
  r.clock = 1;
  join(260, 'DE L’ARGENT POUR L’HÔPITAL');
  let texts = r.floaters.map((f) => f.text);
  assert.ok(texts.includes('LA RETRAITE AVANT L’ARTHRITE') && !texts.includes('DE L’ARGENT POUR L’HÔPITAL'), 'la seconde rejoint sans crier');
  assert.equal(texts.filter((t) => t === '+ 20').length, 2, 'ses « + 20 » s’affichent tous les deux');
  r.clock = 3.5;
  join(400, 'TOUS ENSEMBLE');
  texts = r.floaters.map((f) => f.text);
  assert.ok(texts.includes('TOUS ENSEMBLE'), 'plus tard, une autre crie le sien');
  r.absorb([{ type: 'bubble', x: 200, y: 100, text: 'DÉCONSTRUCTION !' }]);
  assert.ok(r.floaters.some((f) => f.text === 'DÉCONSTRUCTION !'), 'le nom d’une spéciale passe toujours');
});

test('des pertes pour la même raison, au même endroit, font un seul texte qui s’additionne', () => {
  const r = renderer();
  r.absorb([{ type: 'dispersed', reason: 'gaz', n: 10, x: 40, y: 150 }, { type: 'dispersed', reason: 'gaz', n: 9, x: 60, y: 150 }]);
  r.absorb([{ type: 'dispersed', reason: 'interpelle', n: 3, x: 50, y: 150 }]);
  assert.deepEqual(r.floaters.map((f) => f.text), ['− 19 gazés', '− 3 interpellés']);
});

test('« GARDE À VUE » : écrit pour une cage à l’étage du héros, et jamais effacé tant qu’elle reste à l’écran', () => {
  const r = renderer();
  const said = [];
  r.label = (text) => said.push(text);
  const cage = { kind: 'cage', x: 300, y: 150, w: 16, h: 16, on: false };
  const show = () => { said.length = 0; r.prop(cage); return said.length > 0; };
  // Elle entre dans l'image : le héros est au même étage, elle s'écrit.
  r.heroBox = { x: 20, y: 148, w: 12, h: 18 };
  assert.ok(show());
  // Le héros saute, s'éloigne d'un étage : tant qu'elle reste à l'écran, rien ne change.
  for (const y of [100, 60, 148, 40]) {
    r.heroBox = { x: 40, y, w: 12, h: 18 };
    assert.ok(show(), `héros à ${y}`);
  }
  // Elle sort de l'image, puis revient pendant que le héros est trois étages plus bas : le dessin suffit.
  r.cx = 400;
  show();
  r.cx = 0;
  r.heroBox = { x: 40, y: 150 + 9 * 16, w: 12, h: 18 };
  assert.ok(!show());
  assert.ok(!show(), 'elle reste muette tant qu’il est en bas');
  // Il remonte à son étage (le métro, le puits) : elle s'écrit, une fois, et ne s'efface plus, même s'il redescend.
  r.heroBox = { x: 300, y: 148, w: 12, h: 18 };
  assert.ok(show(), 'le héros arrive à côté : elle s’écrit');
  for (const y of [150 + 9 * 16, 60, 148]) {
    r.heroBox = { x: 40, y, w: 12, h: 18 };
    assert.ok(show(), `héros à ${y} : toujours écrite`);
  }
});

test('des unités identiques côte à côte n’ont qu’un « ! » ; une autre, plus loin ou différente, a le sien', () => {
  const r = renderer();
  const unit = (id, x) => ({ def: { id }, x, y: 150, w: 12, h: 18 });
  r.groups.clear();
  assert.equal(r.first('alerte', unit('crs', 100)), true);
  assert.equal(r.first('alerte', unit('crs', 114)), false);
  assert.equal(r.first('alerte', unit('crs', 128)), false, 'de proche en proche, toute la ligne');
  assert.equal(r.first('alerte', unit('bac', 120)), true, 'une autre unité');
  assert.equal(r.first('alerte', unit('crs', 260)), true, 'un autre groupe');
  // Une unité hors de l'image n'écrit rien : elle ne prend pas le « ! » de sa voisine visible.
  r.groups.clear();
  assert.equal(r.first('alerte', unit('gm', -50)), true);
  assert.equal(r.first('alerte', unit('gm', -20)), true, 'la voisine visible a le sien');
});

test('hors service, une unité n’a rien d’écrit au-dessus d’elle : elle s’assoit ou s’éteint, et une fleur pousse', () => {
  const r = renderer();
  const said = [];
  r.label = (text) => said.push(text);
  const drawn = [];
  const actor = r.actor.bind(r);
  r.actor = (a, rows, opts) => { drawn.push({ rows, opts }); return actor(a, rows, opts); };
  r.combatBefore({ hero: { x: 0, y: 150, w: 12, h: 18, dead: false }, enemies: [] });
  const down = (id, extra = {}) => {
    const def = bundle.ennemis[id];
    return { def, x: 120, y: 150, w: def.largeur, h: def.hauteur, facing: -1, flash: 0, state: 'done', ...extra };
  };
  // Le CRS en grève, le canon à eau en panne : la simulation dit encore « EN GRÈVE ! », « EN PANNE », le CRS a son écriteau.
  const crs = down('crs', { bubble: { text: 'EN GRÈVE !', t: 2.5 } });
  const canon = down('canon-a-eau', { x: 220, bubble: { text: 'EN PANNE', t: 2.5 } });
  assert.ok(crs.def.sprites.fin && !canon.def.sprites.fin);
  for (let i = 0; i < 3; i++) {
    r.clock += 1;
    r.enemy(crs);
    r.enemy(canon);
  }
  assert.deepEqual(said, [], 'ni « EN GRÈVE ! », ni « EN PANNE », ni écriteau');
  // Le CRS s'assoit en tailleur, dans son dessin de fin ; le canon à eau garde le sien, apaisé (et non assombri).
  const sitting = drawn.find((d) => d.rows.length < crs.def.sprites.fin.length);
  assert.ok(sitting, 'le CRS est dessiné assis');
  assert.equal(sitting.opts.dim, false, 'son dessin de fin, à ses couleurs');
  assert.ok(drawn.some((d) => d.rows === canon.def.sprites.repos && d.opts.dim === 'calm'), 'le canon à eau, apaisé');
  // Une fleur chacun, toute poussée : à la main du CRS, sur le toit du canon à eau.
  r.combatBefore({ hero: { x: 0, y: 150, w: 12, h: 18, dead: false }, enemies: [] });
  r.enemy(crs);
  r.enemy(canon);
  assert.equal(r.flowers.length, 2);
  assert.ok(r.flowers.every(([, , grown]) => grown >= 1));
  const [x, y] = r.flowers[1];
  const top = canon.y + canon.h - canon.def.sprites.repos.length;
  assert.ok(y < top + 4 && Math.abs(x - (canon.x + canon.w / 2)) < 4, 'la fleur est plantée sur le canon à eau');
});

test('assise en tailleur : le haut du dessin jusqu’à la ceinture, puis les genoux ; une machine ne s’assoit pas', async () => {
  const { seated, hand, crown } = await import('../src/client/sprites.js');
  const fin = bundle.ennemis.crs.sprites.fin;
  const sit = seated(fin);
  assert.equal(sit.length, 14, 'la ceinture (rangée 12) et deux rangées de jambes');
  assert.equal(sit[0].length, fin[0].length + 4, 'deux colonnes de chaque côté pour les genoux');
  assert.equal(sit[11], `..${fin[11]}..`, 'le haut ne change pas');
  assert.match(sit[12], /^\.\.n{12}\.\.\.\.$/, 'les genoux écartés');
  assert.equal(seated(bundle.ennemis['canon-a-eau'].sprites.repos), null);
  assert.equal(seated(bundle.ennemis.drone.sprites.fin), null);
  assert.deepEqual(hand(sit), { x: 13, y: 7 }, 'la main tendue, sous la tête');
  assert.deepEqual(crown(bundle.ennemis.drone.sprites.fin), { x: 7, y: 2 });
});

test('la bulle du boss reste entière dans la vue, sous le HUD', () => {
  const r = renderer();
  const def = Object.values(bundle.boss)[0];
  const said = [];
  r.label = (text, x, y) => said.push({ x, y, box: r.textBox(text, x, y, 7, 150) });
  r.heroBox = { x: 100, w: 12, h: 18, y: 150 };
  const text = 'JE SUIS LE PARATONNERRE, LE BOUC ÉMISSAIRE.';
  for (const b of [{ x: 370, y: 120 }, { x: 200, y: 6 }]) { // au bord droit, puis tout en haut
    const boss = { def, ...b, w: 40, h: 60, state: 'idle', flash: 0, bubble: { text } };
    r.boxes = [];
    r.bossSay = r.bossBubble(boss);
    r.boss(boss);
  }
  for (const { box } of said) {
    assert.ok(box.x0 >= 0 && box.x1 <= r.viewW, 'dans la largeur de la vue');
    assert.ok(box.y0 >= 100 / r.ratio - 1e-9, 'sous le HUD et la barre de vie');
  }
  assert.ok(said[1].x < 200, 'sans place au-dessus de lui, elle passe à côté, du côté du héros');
});

test('la bulle du boss ne se pose pas sur un texte déjà là ; textes flottants et pancartes passent autour', () => {
  const r = renderer(5 / 3); // au pouce
  const def = Object.values(bundle.boss)[0];
  r.heroBox = { x: 100, w: 12, h: 18, y: 150 };
  const boss = { def, x: 200, y: 20, w: 40, h: 60, state: 'idle', flash: 0, bubble: { text: 'QUAND LES TARIFS DE FRET ÉTAIENT DE 350 DOLLARS' } };
  r.boxes = [];
  const free = r.bossBubble(boss);
  r.boxes = [{ ...free.box }]; // un texte des combats occupe déjà cette place
  const say = r.bossBubble(boss);
  assert.ok(!overlap(say.box, free.box), 'elle prend une autre place');
  r.boxes.push(say.box);
  r.float({ x: say.x, y: say.y + 2, text: 'ON REPART D’ICI', t: 2.2, size: 8 });
  r.placeFloaters([say.box]);
  const [f] = r.floaters;
  assert.ok(!overlap(r.textBox(f.text, f.x, f.y, f.size, 150), say.box), 'le texte flottant passe autour');
});

test('un texte flottant ne monte jamais sous la bande du HUD', () => {
  const r = renderer();
  r.float({ x: 200, y: 20, text: 'DÉCONSTRUCTION !', t: 1.6, size: 7 });
  r.float({ x: 200, y: 24, text: 'DÉSOBÉISSONS !', t: 1.6, size: 7 });
  r.placeFloaters([]);
  for (const f of r.floaters) assert.ok(r.textBox(f.text, f.x, f.y, f.size, 150).y0 >= 100 / r.ratio - 1e-9, f.text);
  const [a, b] = r.floaters.map((f) => r.textBox(f.text, f.x, f.y, f.size, 150));
  assert.ok(!overlap(a, b), 'au plafond, le second passe dessous');
});

test('quand le HUD descend plus bas (puce passée à la ligne), le plafond descend avec lui', () => {
  const r = renderer(5 / 3); // 667×375 couché : HUD sur trois lignes, jusqu'à 118 px
  r.hudBottom = 118;
  const below = (box) => box.y0 >= (118 + 4) / r.ratio - 1e-9;
  r.float({ x: 40, y: 30, text: '+1', t: 2.4, size: 20, gain: true });
  r.float({ x: 60, y: 10, text: 'ON EST LÀ !', rise: 0, t: 2.2, size: 12, keep: true });
  r.placeFloaters([]);
  for (const f of r.floaters) assert.ok(below(r.textBox(f.text, f.x, f.y, f.size, 150)), f.text);
  const def = Object.values(bundle.boss)[0];
  r.heroBox = { x: 100, w: 12, h: 18, y: 150 };
  r.boxes = [];
  const say = r.bossBubble({ def, x: 200, y: 10, w: 40, h: 60, state: 'idle', flash: 0, bubble: { text: 'QUAND LES TARIFS DE FRET' } });
  assert.ok(below(say.box), 'la bulle du boss aussi');
  r.hudBottom = 0;
  assert.equal(r.ceiling(), 100 / r.ratio, 'sinon, SAFE_TOP au moins');
});

test('un gain (« + 20 », « +1 », « SOIGNÉ ») n’est jamais évincé avant un slogan', () => {
  const r = renderer();
  // Une recrue rejoint : son « + 20 » naît avant son slogan ; puis d'autres slogans arrivent.
  r.absorb([{ type: 'recruit', x: 100, y: 150, n: 20 }, { type: 'bubble', x: 100, y: 144, text: 'LA RETRAITE AVANT L’ARTHRITE' }]);
  r.absorb(['UN', 'DEUX', 'TROIS'].map((text, i) => ({ type: 'bubble', x: 100 + i * 80, y: 120, text })));
  const gain = r.floaters.find((f) => f.text === '+ 20');
  assert.ok(gain.t > 0.25, 'le gain reste');
  assert.ok(r.floaters.filter((f) => f.t > 0.25).length <= 4);
});

// ---------------------------------------------------------------- lisibilité et travail inutile

test('sur téléphone, un petit texte du monde grandit jusqu’à onze pixels à l’écran', () => {
  assert.equal(renderer(3).fit(4.6), 4.6, 'ordinateur : rien ne change');
  const phone = renderer(5 / 3);
  assert.ok(Math.abs(phone.fit(4.6) * phone.ratio - 11) < 1e-9);
  assert.equal(phone.fit(11), 11, 'un grand texte garde sa taille');
});

test('un texte hors de la vue n’est ni mesuré ni écrit', () => {
  const r = renderer();
  measured = 0;
  r.label('GARDE À VUE', -400, 100, { size: 4.5, bg: '#333c57' });
  r.label('+ 25', 200, 900, { size: 8 });
  assert.equal(measured, 0);
  r.label('SORTIE ▶', 200, 100, { size: 6 });
  assert.ok(measured > 0);
});
