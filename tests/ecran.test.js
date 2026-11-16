// Un écran qui se lit : les notes passent une à une, les textes flottants ne s'empilent pas,
// les pancartes du cortège ne clignotent pas, les petits textes restent lisibles sur téléphone.
// Le rendu tourne ici sur un faux canevas : on vérifie ses décisions, pas ses pixels.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../tools/content.mjs';
import { queueNote, readTime } from '../src/client/ui.js';
import { Game, DT } from '../src/sim/game.js';

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
/**
 * Les textes flottants et les pancartes placés comme au dessin, dans l'ordre réel (`placeTexts`). Une version qui ne
 * l'a pas les place dans son ancien ordre : un test y échoue sur ce qu'il vérifie, pas sur une erreur.
 */
const place = (r, fixed = [], cortege = []) => (r.placeTexts ? r.placeTexts(fixed, cortege) : (r.placeFloaters(fixed), r.raiseSigns(cortege)));

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
  for (const text of slogans) r.float({ x: 200, y: 120, text, t: 1.6 }); // des slogans de recrues
  const alive = r.floaters.filter((f) => f.t > 0.25);
  assert.equal(alive.length, 4, 'le plus ancien s’efface');
  place(r, []);
  const boxes = alive.map((f) => r.textBox(f.text, f.x, f.y, f.size, 150));
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlap(boxes[i], boxes[j]), `${alive[i].text} / ${alive[j].text}`);
});

test('un texte qui a sa place (une ligne qui cède, un coup) n’est ni évincé ni déplacé', () => {
  const r = renderer();
  const line = { x: 200, y: 180, rise: 0, text: '✊ 512 / 500', t: 2.2, bg: '#257953', size: 7.5, keep: true };
  const cry = { x: 200, y: 194, rise: 0, text: 'ON EST LÀ !', t: 2.2, size: 12, keep: true };
  r.float(line);
  r.float(cry);
  for (const text of ['UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ']) r.float({ x: 200, y: 190, text, t: 1.6 }); // des slogans
  assert.ok(line.t > 0.25 && cry.t > 0.25, 'jamais évincés');
  assert.ok(r.floaters.filter((f) => f.t > 0.25).length <= 4, 'les autres cèdent la place');
  place(r, []);
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
  place(r, [r.voice]);
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
  place(r, [voice]);
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

test('deux pancartes levées ne se recouvrent jamais, même dans leur première seconde : quand elles se croisent, la dernière levée se baisse', () => {
  const r = renderer();
  r.viewW = 600;
  const cortege = crowd(7); // porteurs 0, 3 et 6 ; 0 et 6 sur la même rangée
  const [first, , , , , , last] = cortege;
  cortege[3].x = 2000; // hors de l'image
  const raisedBoxes = () => cortege.filter((m) => r.raised.has(m)).map((m) => {
    const s = r.spot(m, cortege.indexOf(m));
    return r.textBox(m.label, s.hand, s.top, 4.6, s.width);
  });
  last.x = 2000;
  r.clock = 0;
  r.boxes = [];
  r.raiseSigns(cortege);
  assert.ok(r.raised.has(first));
  // L'autre arrive de loin, se lève, puis traverse la première, dans sa première seconde comme dans la sienne.
  for (let frame = 1; frame < 60; frame++) {
    r.clock = frame / 60;
    last.x = 400 - frame * 6;
    r.boxes = [];
    r.raiseSigns(cortege);
    if (frame === 1) assert.ok(r.raised.has(last), 'elle se lève');
    const boxes = raisedBoxes();
    assert.ok(boxes.every((a, k) => boxes.slice(k + 1).every((b) => !overlap(a, b))), `image ${frame} : deux pancartes l’une sur l’autre`);
    assert.ok(r.raised.has(first), `image ${frame} : la première levée reste levée`);
  }
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
  const show = () => {
    said.length = 0;
    r.boxes = [];
    r.placeTags([r.prop(cage)].filter(Boolean), [cage]);
    return said.length > 0;
  };
  // Elle entre dans l'image : le héros est au même étage, elle s'écrit.
  r.heroBox = { x: 20, y: 148, w: 12, h: 18 };
  assert.ok(show());
  // Le héros saute, s'éloigne d'un étage : tant qu'elle reste à l'écran, rien ne change.
  for (const y of [100, 60, 148, 40]) {
    r.heroBox = { x: 40, y, w: 12, h: 18 };
    assert.ok(show(), `héros à ${y}`);
  }
  // Elle sort de l'image (et s'en éloigne), puis revient pendant que le héros est trois étages plus bas : le dessin suffit.
  r.cx = 600;
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

test('une étiquette écrite sort de l’image avec son accessoire, sans disparaître d’un coup au bord', () => {
  const r = renderer();
  r.heroBox = { x: 20, y: 148, w: 12, h: 18 };
  const cage = { kind: 'cage', x: 100, y: 150, w: 16, h: 16, on: false };
  const said = [];
  r.label = (text, x) => said.push(x);
  const at = (cx) => {
    said.length = 0;
    r.cx = cx;
    r.boxes = [];
    r.placeTags([r.prop(cage)].filter(Boolean), [cage]);
    return said.length;
  };
  assert.equal(at(0), 1);
  assert.equal(at(108), 1, 'la cage à moitié sortie à gauche : son étiquette la suit');
  assert.equal(at(130), 1, 'tout juste sortie : l’étiquette finit de sortir');
  assert.equal(at(400), 0, 'loin de l’image : oubliée');
});

test('une cage et un piquet côte à côte, sous le panneau lu : leurs étiquettes ne se recouvrent pas, ne disparaissent pas, ne sautent pas', () => {
  const r = renderer();
  r.heroBox = { x: 20, y: 148, w: 12, h: 18 };
  const cage = { kind: 'cage', x: 150, y: 150, w: 16, h: 16, on: false };
  const piquet = { kind: 'piquet', x: 166, y: 150, w: 16, h: 16, on: false };
  const props = [cage, piquet];
  const written = [];
  const label = r.label.bind(r);
  r.label = (text, x, y, opts) => { written.push({ text, box: r.textBox(text, x, y, opts.size, 0) }); return label(text, x, y, opts); };
  const frame = (board = null) => {
    written.length = 0;
    r.boxes = board ? [board] : [];
    r.placeTags([cage, piquet].map((p) => r.prop(p)).filter(Boolean), props);
    return written.map((w) => ({ ...w }));
  };
  const apart = (list) => list.every((a, i) => list.slice(i + 1).every((b) => !overlap(a.box, b.box)));
  const first = frame();
  assert.deepEqual(first.map((w) => w.text).sort(), ['GARDE À VUE', 'PIQUET DE GRÈVE']);
  assert.ok(apart(first), 'côte à côte, la seconde se pose juste à côté de la première');
  assert.equal(first[0].box.y0, first[1].box.y0, 'sur la même ligne');
  // Image après image, rien ne bouge.
  for (let k = 0; k < 5; k++) assert.deepEqual(frame(), first);
  // Le panneau lu arrive juste là où elles sont : elles s'écartent, toutes deux écrites, sans le recouvrir.
  const board = { x0: 100, x1: 230, y0: first[0].box.y0 - 40, y1: first[0].box.y1 + 2 };
  const under = frame(board);
  assert.equal(under.length, 2);
  assert.ok(apart(under) && under.every((w) => !overlap(w.box, board)));
  // Il s'en va : elles restent où elles sont allées, sans revenir d'un saut.
  assert.deepEqual(frame(), under);
  // Le piquet écrit seul, puis la cage qui s'écrit à côté : le piquet ne bouge pas (leurs places sont celles du niveau).
  r.propSpot = new WeakMap();
  written.length = 0;
  r.boxes = [];
  r.placeTags([r.prop(piquet)].filter(Boolean), props);
  const alone = written.find((w) => w.text === 'PIQUET DE GRÈVE');
  const both = frame().find((w) => w.text === 'PIQUET DE GRÈVE');
  assert.deepEqual(both, alone, 'le piquet ne bouge pas quand la cage s’écrit');
});

test('sous la bande du HUD : l’étiquette passe sous les pieds de sa cage sans la couvrir ; cage cachée, pas d’étiquette', () => {
  const r = renderer(5 / 3);
  r.hudBottom = 120; // la barre « LA GRILLE DE LA CITADELLE » descend jusque-là, en pixels CSS
  r.heroBox = { x: 20, y: 60, w: 12, h: 18 };
  const ceiling = r.ceiling();
  const art = (p) => ({ x0: p.x, x1: p.x + 16, y0: p.y, y1: p.y + 16 }); // une cage : 16 × 16, posée sur sa boîte
  const placed = [];
  r.label = (text, x, y, opts) => placed.push({ box: r.textBox(text, x, y, opts.size, 0), alpha: opts.alpha ?? 1 });
  const frame = (props) => {
    placed.length = 0;
    r.boxes = [];
    r.placeTags(props.map((p) => r.prop(p)).filter(Boolean), props);
    return placed.slice();
  };
  const hidden = (box, a) => Math.min(box.x1 - 1, a.x1) - Math.max(box.x0 + 1, a.x0) > 2 && Math.min(box.y1 - 1, a.y1) - Math.max(box.y0 + 1, a.y0) > 2;
  // Une cage de l'étage à moitié sous le HUD : son étiquette ne peut pas s'écrire au-dessus d'elle.
  const cage = { kind: 'cage', x: 150, y: Math.round(ceiling) - 8, w: 16, h: 16, on: false };
  const first = frame([cage]);
  assert.equal(first.length, 1, 'elle s’écrit');
  const [{ box, alpha }] = first;
  assert.ok(box.y0 >= ceiling, 'sous le HUD, jamais dessous');
  assert.ok(!hidden(box, art(cage)), 'sans couvrir la cage');
  assert.ok(box.y0 >= art(cage).y1 && box.y0 - art(cage).y1 <= 16, 'sous ses pieds, à une tuile au plus');
  assert.ok(alpha > 0 && alpha < 1, 'à demi effacée, comme sa cage à demi cachée');
  for (let k = 0; k < 3; k++) assert.deepEqual(frame([cage]).map((w) => w.box), [box], 'et sans bouger');
  // Toute la cage sous le HUD : pas d'étiquette.
  const caught = { kind: 'cage', x: 150, y: Math.floor(ceiling) - 17, w: 16, h: 16, on: false };
  assert.deepEqual(frame([caught]), []);
});

test('au téléphone, deux étiquettes voisines restent chacune au-dessus de son accessoire, sinon elles s’empilent', () => {
  const r = renderer(5 / 3);
  r.heroBox = { x: 20, y: 148, w: 12, h: 18 };
  const cage = { kind: 'cage', x: 150, y: 150, w: 16, h: 16, on: false };
  const piquet = { kind: 'piquet', x: 166, y: 150, w: 16, h: 16, on: false };
  const props = [cage, piquet];
  const written = {};
  r.label = (text, x, y, opts) => { written[text] = r.textBox(text, x, y, opts.size, 0); };
  r.boxes = [];
  r.placeTags(props.map((p) => r.prop(p)).filter(Boolean), props);
  const over = (box, p) => Math.min(box.x1, p.x + 16) - Math.max(box.x0, p.x) >= 4;
  assert.ok(over(written['GARDE À VUE'], cage), 'la cage a la sienne au-dessus d’elle');
  assert.ok(over(written['PIQUET DE GRÈVE'], piquet), 'le piquet aussi');
  assert.ok(!overlap(written['GARDE À VUE'], written['PIQUET DE GRÈVE']), 'sans se recouvrir');
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
  // Le CRS en grève, le canon à eau en panne : la simulation leur donne encore une bulle, « EN GRÈVE ! », « EN PANNE ».
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

test('hors service, un plateau de télé ne se retourne pas ; en effets réduits, la fleur est là d’emblée', () => {
  const r = renderer();
  const flips = [];
  const actor = r.actor.bind(r);
  r.actor = (a, rows, opts) => { flips.push(opts.flip); return actor(a, rows, opts); };
  r.combatBefore({ hero: { x: 0, y: 150, w: 12, h: 18, dead: false }, enemies: [] });
  const def = bundle.ennemis.cnews;
  assert.equal(def.deplacement, 'fixe');
  assert.equal(def.reaction, 'cadre');
  const set = { def, x: 120, y: 150, w: def.largeur, h: def.hauteur, facing: -1, flash: 0, state: 'done' };
  r.reduced = true;
  r.enemy(set);
  assert.deepEqual(flips, [false], 'son enseigne se lit à l’endroit, comme quand il tourne');
  assert.equal(r.flowers.length, 1);
  assert.equal(r.flowers[0][2], 1, 'effets réduits : la fleur ne pousse pas, elle est là');
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
  place(r, [say.box]);
  const [f] = r.floaters;
  assert.ok(!overlap(r.textBox(f.text, f.x, f.y, f.size, 150), say.box), 'le texte flottant passe autour');
});

test('un texte flottant ne monte jamais sous la bande du HUD', () => {
  const r = renderer();
  r.float({ x: 200, y: 20, text: 'DÉCONSTRUCTION !', t: 1.6, size: 7 });
  r.float({ x: 200, y: 24, text: 'DÉSOBÉISSONS !', t: 1.6, size: 7 });
  place(r, []);
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
  place(r, []);
  for (const f of r.floaters) assert.ok(below(r.textBox(f.text, f.x, f.y, f.size, 150)), f.text);
  const def = Object.values(bundle.boss)[0];
  r.heroBox = { x: 100, w: 12, h: 18, y: 150 };
  r.boxes = [];
  const say = r.bossBubble({ def, x: 200, y: 10, w: 40, h: 60, state: 'idle', flash: 0, bubble: { text: 'QUAND LES TARIFS DE FRET' } });
  assert.ok(below(say.box), 'la bulle du boss aussi');
  r.hudBottom = 0;
  assert.equal(r.ceiling(), 100 / r.ratio, 'sinon, SAFE_TOP au moins');
});

test('un gain, « +1 », « ON REPART D’ICI » ou un nom de spéciale n’est jamais évincé, même à plus de quatre : seul le slogan cède', () => {
  const r = renderer();
  r.float({ x: 40, y: 100, text: 'TOUS ENSEMBLE', t: 1.6 }); // un slogan
  r.absorb([
    { type: 'recruit', x: 100, y: 150, n: 20 },
    { type: 'heroCard', x: 200, y: 150 },
    { type: 'checkpoint', x: 300, y: 150 },
    { type: 'bubble', x: 360, y: 120, text: 'DÉCONSTRUCTION !' },
  ]);
  const by = (text) => r.floaters.find((f) => f.text === text);
  for (const text of ['+ 20', '+1', '+ 10', 'ON REPART D’ICI', 'DÉCONSTRUCTION !']) assert.ok(by(text)?.t > 0.25, `${text} reste`);
  assert.ok(by('TOUS ENSEMBLE').t <= 0.25, 'le slogan s’efface');
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

// ---------------------------------------------------------------- en mouvement

/** Une longue rue plate, une manif de 250 personnes et ses pancartes derrière le héros. */
function march(height = 12, depth = 0) {
  const width = 200;
  const rows = Array.from({ length: height + depth }, (_, y) => (y >= height - 1 ? 'T'.repeat(width) : y === height - 2 ? `..D${'.'.repeat(width - 3)}` : '.'.repeat(width)));
  const level = { titre: 'rue', manchette: [], panneaux: {}, legende: {}, boss: '', heros: 'zucman', cortege: true, manif: 10, fond: 'ville', carte: rows };
  const game = new Game(bundle, 'rue', { level, seed: 3, invincible: true });
  for (let k = 0; k < 12; k++) game.addCrowd(20); // des recrues une à une : la plupart apportent une pancarte
  const r = renderer();
  r.snap(game);
  return { game, r };
}

/**
 * La boucle de main.js : des pas fixes de DT, la caméra qui suit à chaque pas, un dessin par image de l'écran.
 * `frames` : la durée de chaque image. Rend, image par image, où le héros, chaque manifestant et chaque pancarte
 * levée sont dessinés à l'écran.
 */
function play(r, game, frames) {
  const seen = [];
  let acc = DT / 4;
  const actor = r.actor.bind(r);
  const marcher = r.marcher.bind(r);
  const board = r.board.bind(r);
  let shot = null;
  r.actor = (a, rows, opts) => {
    const at = actor(a, rows, opts);
    if (a === game.hero && at) shot.set('héros', at.x);
    return at;
  };
  r.marcher = (m, i) => {
    shot.set(`manifestant ${i}`, r.spot(m, i)?.x);
    return marcher(m, i);
  };
  let signs = null;
  r.board = (text, x, y, opts) => {
    if (opts?.size === 4.6) {
      shot.set(`« ${text} »`, x);
      signs.push({ text, box: r.textBox(text, x, y, 4.6, opts.width) });
    }
    return board(text, x, y, opts);
  };
  for (const dt of frames) {
    acc += dt;
    while (acc >= DT) {
      acc -= DT;
      game.step({ right: true });
      game.events.length = 0;
      r.follow?.(game); // sans `follow` (avant), la caméra avance au dessin : le test échoue sur le tremblement, pas sur une erreur
    }
    shot = new Map();
    signs = [];
    r.tick(dt);
    r.draw(game, dt);
    // Les textes flottants tels qu'ils sont écrits à cette image (visibles tant qu'il leur reste du temps).
    const texts = r.floaters.filter((f) => f.t > 0).map((f) => ({ text: f.text, box: r.textBox(f.text, f.x - r.cx, f.y - r.cy, f.size, 150) }));
    seen.push({ cx: r.cx, at: shot, signs, texts });
  }
  Object.assign(r, { actor, marcher, board });
  return seen;
}

test('en marche, le héros, sa manif et ses pancartes ne tremblent pas à l’écran : à 60 Hz, à 120 Hz, ou quand une image joue deux pas ou aucun', () => {
  const { game, r } = march();
  play(r, game, Array(240).fill(DT)); // quatre secondes : toute la manif marche au pas derrière le héros
  const jolts = [1, 0.4, 1.6, 0.9, 1.1, 0.5, 1.5, 1, 0.3, 1.7]; // des images plus ou moins longues : zéro, un ou deux pas
  for (const [cadence, frames] of [
    ['60 Hz', Array(60).fill(DT)],
    ['120 Hz', Array(120).fill(DT / 2)],
    ['à-coups', Array.from({ length: 60 }, (_, k) => jolts[k % jolts.length] * DT)],
  ]) {
    const seen = play(r, game, frames);
    assert.ok(seen.at(-1).cx - seen[0].cx > 80, `${cadence} : la rue défile`);
    const where = new Map();
    for (const { at } of seen) for (const [who, x] of at) where.set(who, (where.get(who) ?? new Set()).add(x));
    assert.ok(where.has('héros') && [...where.keys()].some((k) => k.startsWith('«')), `${cadence} : le héros et des pancartes levées`);
    for (const [who, xs] of where) assert.equal(xs.size, 1, `${cadence} : ${who} dessiné à ${[...xs].join(', ')}`);
  }
});

test('caméra posée sur le héros : ses pieds et ceux du cortège sur le sol, même quand la vue tombe à un demi-pixel (225 × 0,58)', () => {
  const { game, r } = march(20, 12); // une rue, du ciel au-dessus et de la terre en dessous : la caméra n'est pas au bord de la carte
  for (let k = 0; k < 30; k++) game.step({});
  game.events.length = 0;
  assert.ok(game.hero.onGround);
  Object.assign(r, { viewH: 225, anchor: 0.58 }); // 812×375 à dpr 3, au pouce : 225 × 0,58 = 130,5
  r.snap(game);
  const ground = 19 * 16; // le haut de la rangée du sol, dans le monde
  assert.ok(r.cam.y > 0 && r.cam.y < 32 * 16 - 225, 'la caméra suit le héros, sans buter au bord');
  let feet = null;
  const actor = r.actor.bind(r);
  r.actor = (a, rows, opts) => {
    const at = actor(a, rows, opts);
    if (a === game.hero && at) feet = at.y + rows.length;
    return at;
  };
  r.draw(game, DT);
  r.actor = actor;
  assert.equal(feet, ground - r.cy, 'le héros, sur le sol');
  game.cortege.forEach((m, i) => {
    const s = r.spot(m, i);
    assert.equal(s.y + s.img.height, ground - r.cy, `manifestant ${i}, sur le sol`);
  });
});

test('en marche, un slogan ne fait baisser aucune pancarte levée : il passe au-dessus d’elle', () => {
  // Deux fois la même marche ; dans la seconde, le slogan d'une recrue posé dans la rue, juste devant une pancarte levée.
  const [alone, crossed] = [false, true].map((withText) => {
    const { game, r } = march();
    const warm = play(r, game, Array(240).fill(DT));
    const [first] = warm.at(-1).signs;
    assert.ok(first, 'une pancarte levée');
    if (withText) r.float({ x: first.box.x1 + r.cx + 30, y: (first.box.y0 + first.box.y1) / 2 + r.cy, text: 'TOUS ENSEMBLE', t: 1.6 });
    return play(r, game, Array(90).fill(DT));
  });
  const up = (shot) => new Set(shot.signs.map((s) => s.text));
  let met = 0;
  crossed.forEach((shot, k) => {
    for (const t of shot.texts) {
      for (const s of shot.signs) {
        assert.ok(!overlap(t.box, s.box), `image ${k} : « ${t.text} » sur « ${s.text} »`);
        if (t.box.x0 < s.box.x1 && t.box.x1 > s.box.x0) met++; // à l'aplomb d'une pancarte levée : il la croise
      }
    }
    if (!k) return;
    // Levée à l'image d'avant, encore levée sans le texte : elle l'est aussi avec lui.
    for (const text of up(crossed[k - 1])) if (up(alone[k]).has(text)) assert.ok(up(shot).has(text), `image ${k} : « ${text} » baissée par le texte`);
  });
  assert.ok(met > 20, `le texte croise les pancartes (${met} fois)`);
  assert.ok(crossed.at(-1).texts.some((t) => t.text === 'TOUS ENSEMBLE'), 'et reste écrit');
});

test('sans place au-dessus d’une pancarte levée, un slogan la laisse levée et s’efface en fondu ; un gain passe, elle se baisse un instant', () => {
  // Valentin : « Le gain d'abord : les gains, « +1 », « ON REPART D'ICI » et les noms de spéciale passent toujours :
  // la pancarte qu'ils touchent se baisse un instant. Les slogans, eux, laissent la pancarte levée. »
  const r = renderer();
  const cortege = crowd(1);
  const [m] = cortege;
  const frame = (clock) => {
    r.clock = clock;
    r.boxes = [];
    place(r, [], cortege);
  };
  frame(0);
  assert.ok(r.raised.has(m), 'une pancarte levée');
  const s = r.spot(m, 0);
  const sign = r.textBox(m.label, s.hand, s.top, 4.6, s.width);
  r.hudBottom = (sign.y0 - 4) * r.ratio - 4; // le HUD descend jusqu'au-dessus d'elle : aucune place plus haut
  const at = { x: (sign.x0 + sign.x1) / 2, y: sign.y0 + 4 };
  const onSign = (f) => overlap(r.textBox(f.text, f.x, f.y, f.size, 150), sign);
  // Un slogan qui naît là, jamais montré : il ne s'affiche pas, la pancarte reste levée.
  r.float({ ...at, text: 'DE L’ARGENT POUR L’HÔPITAL', t: 1.6 });
  frame(0.1);
  assert.ok(r.raised.has(m), 'le slogan laisse la pancarte levée');
  assert.ok(!r.floaters.some((f) => f.text === 'DE L’ARGENT POUR L’HÔPITAL'), 'jamais montré : il ne s’affiche pas');
  // Un slogan déjà montré qui n'a plus de place : il s'efface en fondu, sans se poser sur elle.
  r.float({ ...at, text: 'TOUS ENSEMBLE', t: 1.6 });
  const slogan = r.floaters.at(-1);
  slogan.seen = true;
  frame(0.2);
  assert.ok(r.raised.has(m), 'toujours levée');
  assert.ok(slogan.t > 0 && slogan.t <= 0.25, `en fondu (${slogan.t})`);
  assert.ok(!onSign(slogan), 'pas sur la pancarte');
  r.floaters = [];
  // Un gain au même endroit : il passe, la pancarte se baisse ; il s'en va, elle se relève.
  r.float({ ...at, text: '+ 20', n: 20, t: 1.8, size: 11, gain: true });
  const gain = r.floaters.at(-1);
  frame(0.3);
  assert.ok(!r.raised.has(m), 'la pancarte se baisse devant le gain');
  assert.equal(gain.t, 1.8, 'le gain reste entier');
  r.floaters = [];
  frame(1);
  assert.ok(r.raised.has(m), 'le gain passé, elle se relève');
});
