// Le modèle de l'Atelier : la fiche texte devient une grille qu'on peint, et redevient une fiche.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadContent } from '../tools/content.mjs';
import { checkLevel } from '../src/content/rules.js';
import {
  TEMPLATE, MAX, MIN, History, readLevel, writeLevel, getField, setField, legendOf, paint, line, box, resize,
  cellOfError, plain, proposal,
} from '../src/client/atelier-modele.js';

const { bundle } = loadContent();
const DIR = new URL('../content/niveaux/', import.meta.url);
const levels = readdirSync(DIR).filter((name) => name.endsWith('.txt')).map((name) => [name, readFileSync(new URL(name, DIR), 'utf8')]);
const defaults = { boss: Object.keys(bundle.boss)[0], nasse: 'crs' };
const check = (model) => checkLevel(writeLevel(model), bundle);
const fresh = () => readLevel(TEMPLATE);
const at = (model, x, y) => model.rows[y][x];
/** Tout ce qu'on peut poser par la légende : ennemis, recrues, décors. */
const things = [...Object.keys(bundle.ennemis), ...Object.keys(bundle.recrues), ...Object.keys(bundle.decors)];

test('un vrai niveau traverse l’Atelier sans rien perdre', () => {
  assert.ok(levels.length >= 2);
  for (const [name, text] of levels) {
    const model = readLevel(text);
    assert.equal(writeLevel(model), text, `${name} : la fiche ressort à l’identique`);
    const before = checkLevel(text, bundle).level;
    const after = check(model).level;
    assert.deepEqual(after.carte, before.carte, `${name} : la carte`);
    assert.deepEqual(after.legende, before.legende, `${name} : les personnages`);
    assert.deepEqual(after.panneaux, before.panneaux, `${name} : les panneaux`);
    assert.deepEqual(after.murs, before.murs, `${name} : les murs du fond`);
    assert.ok(before.murs.length, `${name} a des murs du fond`);
  }
});

test('un vrai niveau qu’on retouche reste valide, et garde le reste de sa fiche', () => {
  for (const [name, text] of levels) {
    const before = checkLevel(text, bundle).level;
    const { model } = paint(readLevel(text), [{ x: 0, y: 0 }], { type: 'tuile', char: 'T' }, defaults);
    const { level, errors } = check(model);
    assert.deepEqual(errors, [], name);
    assert.deepEqual(level.legende, before.legende);
    assert.deepEqual(level.panneaux, before.panneaux);
    assert.deepEqual(level.murs, before.murs);
    assert.equal(level.titre, before.titre);
    assert.deepEqual(level.fiche, before.fiche);
  }
});

test('le niveau de départ se joue : un sol épais qu’on peut creuser, un départ, une sortie', () => {
  const { level, errors } = checkLevel(TEMPLATE, bundle);
  assert.deepEqual(errors, []);
  const symbols = Object.fromEntries(Object.values(bundle.tuiles).map((t) => [t.symbole, t]));
  const column = level.carte.map((row) => row[5]);
  const ground = column.filter((c) => symbols[c]?.pv > 0);
  assert.ok(ground.length >= 4, 'au moins quatre cases à creuser');
  assert.equal(symbols[column.at(-1)].pv, 0, 'un socle indestructible tout en bas');
  assert.equal(level.carte.join('').match(/D/g).length, 1);
  assert.ok(level.carte.join('').includes('S'));
});

test('une fiche sans carte n’est pas un niveau', () => {
  assert.equal(readLevel('titre: Rien'), null);
  assert.equal(readLevel(''), null);
  assert.equal(readLevel('titre: Vide\n--- carte\n'), null);
});

test('une carte irrégulière est remise au carré', () => {
  const model = readLevel('titre: Bancal\n--- carte\nD  S\nTTTTTTTT\n\n--- murs\nB\n');
  assert.deepEqual(model.rows, ['D..S....', 'TTTTTTTT']);
  assert.deepEqual(model.walls, ['B.......', '........']);
});

test('poser un personnage lui trouve un signe, sans rien demander', () => {
  let { model } = paint(fresh(), [{ x: 10, y: 9 }], { type: 'chose', id: 'bac' }, defaults);
  const sign = at(model, 10, 9);
  assert.equal(legendOf(model)[sign], 'bac');
  ({ model } = paint(model, [{ x: 12, y: 9 }], { type: 'chose', id: 'bac' }, defaults));
  assert.equal(at(model, 12, 9), sign, 'le même personnage garde son signe');
  ({ model } = paint(model, [{ x: 14, y: 9 }], { type: 'chose', id: 'barrage' }, defaults));
  assert.notEqual(at(model, 14, 9), sign, 'deux personnages, deux signes');
  ({ model } = paint(model, [{ x: 16, y: 9 }], { type: 'chose', id: 'paysanne' }, defaults));
  ({ model } = paint(model, [{ x: 18, y: 9 }], { type: 'chose', id: 'vache' }, defaults));
  const { level, errors } = check(model);
  assert.deepEqual(errors, []);
  assert.deepEqual(Object.values(level.legende).map((l) => `${l.type}:${l.id}`).sort(),
    ['decor:vache', 'ennemi:bac', 'ennemi:barrage', 'recrue:paysanne']);
});

test('effacer le dernier exemplaire retire sa ligne de l’en-tête', () => {
  let { model } = paint(fresh(), [{ x: 10, y: 9 }, { x: 11, y: 9 }], { type: 'chose', id: 'bac' }, defaults);
  ({ model } = paint(model, [{ x: 10, y: 9 }], { type: 'gomme' }, defaults));
  assert.deepEqual(Object.values(legendOf(model)), ['bac']);
  ({ model } = paint(model, [{ x: 11, y: 9 }], { type: 'gomme' }, defaults));
  assert.deepEqual(legendOf(model), {});
  assert.equal(writeLevel(model), TEMPLATE);
});

test('quand tous les signes sont pris, on le dit ; en libérer un suffit', () => {
  let model = resize(fresh(), 'droite', 40);
  let refused = null;
  let placed = 0;
  for (const [i, id] of things.entries()) {
    const result = paint(model, [{ x: i, y: 2 }], { type: 'chose', id }, defaults);
    if (result.error) {
      refused = { id, error: result.error };
      break;
    }
    model = result.model;
    placed++;
  }
  assert.equal(placed, 42, 'vingt-six lettres et seize signes');
  assert.match(refused.error, /Trop de/);
  assert.deepEqual(check(model).errors, []);
  ({ model } = paint(model, [{ x: 0, y: 2 }], { type: 'gomme' }, defaults));
  const again = paint(model, [{ x: 0, y: 2 }], { type: 'chose', id: refused.id }, defaults);
  assert.equal(again.error, undefined);
  assert.deepEqual(check(again.model).errors, []);
});

test('un panneau reçoit un numéro et un texte ; neuf au plus', () => {
  let model = fresh();
  let result = paint(model, [{ x: 4, y: 9 }], { type: 'panneau' }, defaults);
  assert.equal(result.sign, '1');
  model = setField(result.model, 'panneau.1', 'Par ici la sortie');
  assert.equal(check(model).level.panneaux['1'], 'Par ici la sortie');
  for (let i = 2; i <= 9; i++) {
    result = paint(model, [{ x: 4 + i, y: 9 }], { type: 'panneau' }, defaults);
    assert.equal(result.sign, String(i));
    ({ model } = result);
  }
  assert.deepEqual(check(model).errors, []);
  assert.match(paint(model, [{ x: 20, y: 9 }], { type: 'panneau' }, defaults).error, /Neuf panneaux/);
  ({ model } = paint(model, [{ x: 4, y: 9 }], { type: 'gomme' }, defaults));
  assert.equal(getField(model, 'panneau.1'), '', 'un panneau effacé emporte son texte');
  assert.equal(paint(model, [{ x: 20, y: 9 }], { type: 'panneau' }, defaults).sign, '1');
});

test('un seul départ : le poser ailleurs le déplace', () => {
  const { model } = paint(fresh(), [{ x: 20, y: 9 }], { type: 'repere', char: 'D' }, defaults);
  assert.equal(at(model, 20, 9), 'D');
  assert.equal(at(model, 2, 9), '.');
  assert.deepEqual(check(model).errors, []);
});

test('poser un boss n’en impose aucun (il est tiré au hasard) ; le retirer efface celui qu’on avait imposé', () => {
  let { model } = paint(fresh(), [{ x: 30, y: 9 }], { type: 'repere', char: 'Y' }, defaults);
  assert.equal(getField(model, 'boss'), '');
  assert.deepEqual(check(model).errors, []);
  model = setField(model, 'boss', defaults.boss);
  assert.deepEqual(check(model).errors, []);
  ({ model } = paint(model, [{ x: 25, y: 9 }], { type: 'repere', char: 'Y' }, defaults));
  assert.equal(model.rows.join('').match(/Y/g).length, 1);
  ({ model } = paint(model, [{ x: 25, y: 9 }], { type: 'gomme' }, defaults));
  assert.equal(getField(model, 'boss'), '');
  assert.deepEqual(check(model).errors, []);
});

test('une nasse arrive avec son unité', () => {
  const { model } = paint(fresh(), [{ x: 20, y: 9 }], { type: 'repere', char: 'N' }, defaults);
  assert.equal(getField(model, 'nasse.ennemi'), 'crs');
  assert.deepEqual(check(model).errors, []);
});

test('les murs du fond se peignent derrière ; la gomme retire le devant, puis le fond', () => {
  const cells = box({ x: 5, y: 6 }, { x: 8, y: 8 });
  let { model } = paint(fresh(), cells, { type: 'tuile', char: 'B', back: true }, defaults);
  assert.equal(cells.length, 12);
  assert.equal(model.walls[7][6], 'B');
  assert.equal(at(model, 6, 7), '.');
  assert.match(writeLevel(model), /\n--- murs\n/);
  assert.deepEqual(check(model).errors, []);
  ({ model } = paint(model, [{ x: 6, y: 7 }], { type: 'tuile', char: 'P' }, defaults));
  ({ model } = paint(model, [{ x: 6, y: 7 }], { type: 'gomme' }, defaults));
  assert.equal(at(model, 6, 7), '.');
  assert.equal(model.walls[7][6], 'B', 'le mur du fond reste');
  ({ model } = paint(model, cells, { type: 'gomme' }, defaults));
  assert.deepEqual(model.walls, []);
  assert.equal(writeLevel(model), TEMPLATE);
});

test('un trait rapide ne laisse pas de trou', () => {
  const cells = line({ x: 0, y: 0 }, { x: 6, y: 3 });
  assert.deepEqual(cells[0], { x: 0, y: 0 });
  assert.deepEqual(cells.at(-1), { x: 6, y: 3 });
  for (let i = 1; i < cells.length; i++) {
    assert.ok(Math.abs(cells[i].x - cells[i - 1].x) <= 1 && Math.abs(cells[i].y - cells[i - 1].y) <= 1);
  }
  assert.deepEqual(line({ x: 3, y: 3 }, { x: 3, y: 3 }), [{ x: 3, y: 3 }]);
});

test('peindre hors de la carte ne fait rien', () => {
  const model = fresh();
  assert.equal(paint(model, [{ x: -1, y: 0 }, { x: 40, y: 3 }, { x: 0, y: 16 }], { type: 'tuile', char: 'T' }, defaults).model, model);
});

test('agrandir étire la carte derrière son bord : le terrain se prolonge, pas les personnages', () => {
  let { model } = paint(fresh(), [{ x: 38, y: 9 }], { type: 'chose', id: 'bac' }, defaults);
  const sign = at(model, 38, 9);
  model = resize(model, 'droite', 10, defaults);
  assert.equal(model.rows[0].length, 50);
  assert.equal(model.rows[9].slice(37), `S${sign}${'.'.repeat(11)}`, 'ni personnage ni sortie recopiés');
  assert.equal(model.rows[12], 'T'.repeat(50));
  model = resize(model, 'bas', 5, defaults);
  assert.equal(model.rows.length, 21);
  assert.equal(model.rows.at(-1), 'O'.repeat(50), 'le socle reste tout en bas');
  assert.deepEqual(model.rows.slice(10, 20), Array(10).fill('T'.repeat(50)), 'le sol à creuser s’épaissit');
  model = resize(model, 'haut', 4, defaults);
  assert.equal(model.rows.length, 25);
  assert.equal(at(model, 2, 13), 'D', 'le départ descend avec la carte');
  model = resize(model, 'gauche', 5, defaults);
  assert.equal(at(model, 7, 13), 'D');
  assert.deepEqual(check(model).errors, []);
});

test('un mur d’enceinte reste au bord quand la carte grandit', () => {
  const edge = box({ x: 39, y: 0 }, { x: 39, y: 9 });
  let { model } = paint(fresh(), edge, { type: 'tuile', char: 'B' }, defaults);
  ({ model } = paint(model, box({ x: 0, y: 0 }, { x: 39, y: 0 }), { type: 'tuile', char: 'P' }, defaults));
  model = resize(model, 'droite', 5, defaults);
  model = resize(model, 'haut', 5, defaults);
  assert.equal(model.rows[0], 'P'.repeat(45), 'le plafond reste en haut');
  assert.equal(model.rows[3], `${'.'.repeat(44)}B`, 'le mur reste à droite, le ciel s’étire');
  assert.deepEqual(check(model).errors, []);
});

test('agrandir puis réduire du même côté rend la même carte', () => {
  for (const [name, text] of levels) {
    const model = readLevel(text);
    for (const side of ['haut', 'bas', 'gauche', 'droite']) {
      const tall = side === 'haut' || side === 'bas';
      if (tall ? model.rows.length + 5 > 60 : model.rows[0].length + 5 > 400) continue; // déjà à la taille maximale
      const back = resize(resize(model, side, 5, defaults), side, -5, defaults);
      assert.equal(writeLevel(back), text, `${name}, ${side}`);
    }
  }
});

test('réduire retire ce qui dépasse, et l’en-tête suit', () => {
  let { model } = paint(fresh(), [{ x: 38, y: 3 }], { type: 'chose', id: 'bac' }, defaults);
  ({ model } = paint(model, [{ x: 38, y: 4 }], { type: 'tuile', char: 'B', back: true }, defaults));
  model = resize(model, 'droite', -1, defaults);
  assert.equal(model.rows[0].length, 39);
  assert.deepEqual(legendOf(model), {});
  assert.deepEqual(model.walls, []);
  assert.deepEqual(check(model).errors, []);
});

test('la carte ne dépasse ni le maximum ni le minimum', () => {
  let model = fresh();
  model = resize(model, 'droite', 1000, defaults);
  model = resize(model, 'haut', 1000, defaults);
  assert.deepEqual([model.rows[0].length, model.rows.length], [MAX.w, MAX.h]);
  assert.deepEqual(check(model).errors, []);
  assert.equal(resize(model, 'droite', 5, defaults), model, 'au maximum : rien ne change');
  model = resize(model, 'gauche', -1000, defaults);
  model = resize(model, 'bas', -1000, defaults);
  assert.deepEqual([model.rows[0].length, model.rows.length], [MIN.w, MIN.h]);
});

test('un vrai niveau agrandi de tous les côtés reste valide', () => {
  for (const [name, text] of levels) {
    let model = readLevel(text);
    for (const side of ['haut', 'bas', 'gauche', 'droite']) model = resize(model, side, 3, defaults);
    assert.deepEqual(check(model).errors, [], name);
    assert.equal(model.walls.length, model.rows.length);
  }
});

test('annuler, rétablir', () => {
  const history = new History();
  const a = fresh();
  const { model: b } = paint(a, [{ x: 1, y: 1 }], { type: 'tuile', char: 'P' }, defaults);
  history.record(a);
  const { model: c } = paint(b, [{ x: 2, y: 1 }], { type: 'tuile', char: 'P' }, defaults);
  history.record(b);
  assert.equal(history.undo(c), b);
  assert.equal(history.undo(b), a);
  assert.equal(history.undo(a), a, 'rien à annuler');
  assert.equal(history.redo(a), b);
  history.record(b); // un nouveau geste : plus rien à rétablir
  assert.equal(history.redo(c), c);
});

test('l’historique ne grossit pas sans fin', () => {
  const history = new History(3);
  for (let i = 0; i < 10; i++) history.record(i);
  assert.deepEqual(history.past, [7, 8, 9]);
});

test('une erreur de la carte désigne sa case', () => {
  const text = TEMPLATE.replace(`..D${'.'.repeat(34)}S..`, `..D.....z${'.'.repeat(28)}S..`);
  const model = readLevel(text);
  const { errors } = check(model);
  assert.equal(errors.length, 1);
  assert.deepEqual(cellOfError(model, errors[0]), { x: 8, y: 9 });
  assert.equal(cellOfError(model, { line: 1, message: 'sans colonne' }), null);
});

test('une erreur dans les murs du fond désigne sa case', () => {
  const { model } = paint(fresh(), [{ x: 3, y: 2 }], { type: 'tuile', char: 'B', back: true }, defaults);
  const broken = { ...model, walls: model.walls.map((row, y) => (y === 4 ? `......z${row.slice(7)}` : row)) };
  const { errors } = check(broken);
  assert.equal(errors.length, 1);
  assert.deepEqual(cellOfError(broken, errors[0]), { x: 6, y: 4 });
});

test('les erreurs se disent sans lettre', () => {
  const { model } = paint(fresh(), [{ x: 2, y: 9 }], { type: 'gomme' }, defaults);
  const said = check(model).errors.map((e) => plain(e.message));
  assert.deepEqual(said, ['Il faut exactement un départ (ici 0).']);
});

test('un réglage s’écrit à sa place dans l’en-tête', () => {
  let model = setField(fresh(), 'auteur', '  Louise   Michel ');
  assert.equal(getField(model, 'auteur'), 'Louise Michel');
  ({ model } = paint(model, [{ x: 10, y: 9 }], { type: 'chose', id: 'bac' }, defaults));
  ({ model } = paint(model, [{ x: 11, y: 9 }], { type: 'panneau' }, defaults));
  model = setField(model, 'fond', 'ville');
  model = setField(model, 'cortege', 'non');
  const keys = writeLevel(model).split('\n--- carte')[0].split('\n').map((l) => l.split(':')[0]);
  assert.deepEqual(keys, ['titre', 'fond', 'cortege', 'auteur', 'panneau.1', 'b']);
  assert.equal(getField(setField(model, 'auteur', ''), 'auteur'), '');
  const { level, errors } = check(model);
  assert.deepEqual(errors, []);
  assert.equal(level.fond, 'ville');
  assert.equal(level.cortege, false);
});

test('proposer : un lien prérempli tant que la fiche est courte', () => {
  const short = proposal('https://github.com/x/y', TEMPLATE, 'Grève générale à Égletons !');
  assert.ok(short.filled);
  assert.match(short.url, /^https:\/\/github\.com\/x\/y\/new\/main\/content\/niveaux\?filename=greve-generale-a-egletons\.txt&value=titre/);
  const long = proposal('https://github.com/x/y', levels[0][1], 'Long');
  assert.equal(long.filled, false);
  assert.ok(long.url.endsWith('filename=long.txt'));
});
