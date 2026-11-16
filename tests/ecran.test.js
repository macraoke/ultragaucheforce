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
