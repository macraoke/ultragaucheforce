// Les brouillons de l'Atelier : ils restent dans le navigateur, sous leur propre clé, et survivent à un onglet
// fermé, à un deuxième onglet, à un stockage refusé ou plein.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { loadContent } from '../tools/content.mjs';
import { checkLevel } from '../src/content/rules.js';
import { TEMPLATE, readLevel, writeLevel, setField, paint, contributions } from '../src/client/atelier-modele.js';
import { Drafts, KEY, VERSION, upgrade, browserStorage, nameOf, retitle, freeName, when } from '../src/client/atelier-brouillons.js';
import { REPO } from '../src/client/config.js';

const { bundle } = loadContent();

/**
 * Un stockage de navigateur pour les tests. `limit` : au-delà de tant de caractères au total, il est plein.
 * `refuse` : chaque accès lève une erreur, comme quand le navigateur interdit le stockage.
 */
function storage({ limit = Infinity, refuse = false, initial = {} } = {}) {
  const data = new Map(Object.entries(initial));
  const size = () => [...data.values()].reduce((n, v) => n + v.length, 0);
  const deny = () => {
    if (refuse) throw Object.assign(new Error('SecurityError'), { name: 'SecurityError' });
  };
  return {
    data,
    getItem: (k) => {
      deny();
      return data.has(k) ? data.get(k) : null;
    },
    setItem: (k, v) => {
      deny();
      const before = data.get(k);
      data.set(k, String(v));
      if (size() > limit) {
        if (before === undefined) data.delete(k);
        else data.set(k, before);
        throw Object.assign(new Error('quota'), { name: 'QuotaExceededError', code: 22 });
      }
    },
  };
}

/** Une horloge qu'on avance à la main. */
function clock(start = new Date(2026, 10, 16, 14, 32).getTime()) {
  let t = start;
  const now = () => t;
  now.add = (ms) => (t += ms);
  return now;
}

const titled = (title) => writeLevel(setField(readLevel(TEMPLATE), 'titre', title));

test('brouillons : un niveau commencé se retrouve après la fermeture de l’onglet', () => {
  const disk = storage();
  const now = clock();
  const tab = new Drafts({ storage: disk, now });
  assert.equal(tab.exists, false);
  const draft = tab.create(TEMPLATE);
  const { model } = paint(readLevel(TEMPLATE), [{ x: 5, y: 3 }], { type: 'tuile', char: 'B' });
  now.add(60_000);
  assert.equal(tab.save(draft.id, writeLevel(model)), true);
  assert.equal(tab.status, 'ok');

  const reopened = new Drafts({ storage: disk, now }); // l'onglet fermé, puis rouvert
  assert.equal(reopened.exists, true);
  assert.equal(reopened.open, draft.id, 'le brouillon ouvert le reste');
  assert.equal(reopened.get(draft.id).texte, writeLevel(model));
  assert.equal(reopened.get(draft.id).modifie, draft.cree + 60_000);
  assert.deepEqual(JSON.parse(disk.data.get(KEY)).version, VERSION);
  assert.deepEqual([...disk.data.keys()], [KEY], 'rien d’autre n’est écrit, et surtout pas la sauvegarde du jeu');
});

test('brouillons : la liste donne le nom et la date, le plus récent d’abord', () => {
  const now = clock();
  const drafts = new Drafts({ storage: storage(), now });
  const a = drafts.create(titled('La place du marché'));
  now.add(1000);
  const b = drafts.create(titled('Le rond-point'));
  now.add(1000);
  drafts.save(a.id, titled('La place du marché, au matin'));
  assert.deepEqual(drafts.list().map((d) => [d.id, d.nom]), [[a.id, 'La place du marché, au matin'], [b.id, 'Le rond-point']]);
  assert.equal(drafts.open, b.id, 'le dernier créé est ouvert');
  assert.equal(drafts.save(b.id, drafts.get(b.id).texte), true, 'rien à changer : rien n’est réécrit');
  assert.equal(drafts.list()[0].id, a.id, 'et sa date ne bouge pas');
});

test('brouillons : renommer change le titre du niveau, et rien d’autre', () => {
  const drafts = new Drafts({ storage: storage(), now: clock() });
  const { model } = paint(readLevel(TEMPLATE), [{ x: 10, y: 9 }], { type: 'chose', id: 'bac' }, { nasse: 'crs' });
  const draft = drafts.create(writeLevel(model));
  drafts.rename(draft.id, '  Grève   à Égletons ');
  const text = drafts.get(draft.id).texte;
  assert.equal(nameOf(text), 'Grève à Égletons');
  assert.equal(text, writeLevel(setField(model, 'titre', 'Grève à Égletons')));
  const { level, errors } = checkLevel(text, bundle);
  assert.deepEqual(errors, []);
  assert.equal(level.titre, 'Grève à Égletons');
  drafts.rename(draft.id, '   ');
  assert.equal(nameOf(drafts.get(draft.id).texte), 'Sans titre', 'un titre vide ne casse pas le niveau');
  assert.deepEqual(checkLevel(drafts.get(draft.id).texte, bundle).errors, []);
});

test('brouillons : dupliquer fait une copie sous un nom libre ; l’original reste ouvert', () => {
  const now = clock();
  const drafts = new Drafts({ storage: storage(), now });
  const draft = drafts.create(titled('Mon niveau'));
  now.add(1000);
  const copy = drafts.duplicate(draft.id);
  const again = drafts.duplicate(draft.id);
  assert.notEqual(copy.id, draft.id);
  assert.deepEqual(drafts.list().map((d) => d.nom).sort(), ['Mon niveau', 'Mon niveau (copie)', 'Mon niveau (copie) 2']);
  assert.deepEqual(readLevel(copy.texte).rows, readLevel(draft.texte).rows, 'la même carte');
  assert.notEqual(again.id, copy.id);
  assert.equal(drafts.open, draft.id);
  assert.equal(drafts.duplicate('inconnu'), null);
});

test('brouillons : supprimer retire le brouillon, et le ferme s’il était ouvert', () => {
  const disk = storage();
  const drafts = new Drafts({ storage: disk, now: clock() });
  const a = drafts.create(titled('A'));
  const b = drafts.create(titled('B'));
  assert.equal(drafts.remove(b.id), true);
  assert.equal(drafts.open, '');
  assert.deepEqual(drafts.list().map((d) => d.id), [a.id]);
  assert.equal(drafts.remove(b.id), false, 'déjà supprimé');
  drafts.remove(a.id);
  const later = new Drafts({ storage: disk });
  assert.deepEqual(later.list(), []);
  assert.equal(later.exists, true, 'une liste vidée reste une liste : l’ancien brouillon ne revient pas');
  assert.equal(later.adopt(titled('Ancien'), TEMPLATE), null);
});

test('brouillons : deux onglets ne s’effacent pas l’un l’autre', () => {
  const disk = storage();
  const now = clock();
  const one = new Drafts({ storage: disk, now });
  const two = new Drafts({ storage: disk, now });
  const a = one.create(titled('Dans le premier'));
  const b = two.create(titled('Dans le second'));
  one.save(a.id, titled('Dans le premier, retouché'));
  assert.deepEqual(new Drafts({ storage: disk }).list().map((d) => d.nom).sort(), ['Dans le premier, retouché', 'Dans le second']);
  two.remove(a.id);
  one.save(a.id, titled('Dans le premier, encore'));
  assert.ok(new Drafts({ storage: disk }).get(a.id), 'supprimé ailleurs pendant qu’on le dessinait : il revient');
  assert.ok(new Drafts({ storage: disk }).get(b.id));
});

test('brouillons : un navigateur qui refuse le stockage garde les brouillons en mémoire', () => {
  for (const disk of [storage({ refuse: true }), null]) {
    const drafts = new Drafts({ storage: disk, now: clock() });
    assert.equal(drafts.status, 'refus');
    const draft = drafts.create(titled('En mémoire'));
    assert.equal(drafts.save(draft.id, titled('En mémoire, retouché')), false, 'rien n’est écrit');
    assert.deepEqual(drafts.list().map((d) => d.nom), ['En mémoire, retouché']);
    assert.equal(drafts.duplicate(draft.id).texte, titled('En mémoire, retouché (copie)'));
    assert.equal(drafts.remove(draft.id), true);
    assert.deepEqual(drafts.list().map((d) => d.nom), ['En mémoire, retouché (copie)']);
    assert.equal(drafts.status, 'refus');
  }
});

test('brouillons : un stockage qu’on ne peut même pas ouvrir ne fait rien planter', () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    assert.equal(browserStorage(), null);
    const drafts = new Drafts();
    assert.equal(drafts.status, 'refus');
    assert.ok(drafts.create(TEMPLATE).id);
  } finally {
    if (had) Object.defineProperty(globalThis, 'localStorage', had);
    else delete globalThis.localStorage;
  }
});

test('brouillons : stockage plein, on le dit ; ce qui était enregistré reste, la place libérée resert', () => {
  const big = titled('Grand').replace(/\n--- carte\n/, `\n# ${'x'.repeat(4800)}\n--- carte\n`);
  const disk = storage({ limit: 6000 }); // le petit et le grand n'y tiennent pas ensemble ; le grand seul, si
  const drafts = new Drafts({ storage: disk, now: clock() });
  const small = drafts.create(titled('Petit'));
  assert.equal(drafts.status, 'ok');
  const large = drafts.create(big);
  assert.equal(drafts.status, 'plein');
  assert.deepEqual(drafts.list().map((d) => d.id).sort(), [small.id, large.id].sort(), 'en mémoire, rien n’est perdu');
  assert.deepEqual(new Drafts({ storage: disk }).list().map((d) => d.id), [small.id], 'sur le disque, l’ancien état intact');
  drafts.remove(small.id);
  assert.equal(drafts.status, 'ok', 'un brouillon supprimé fait de la place');
  assert.deepEqual(new Drafts({ storage: disk }).list().map((d) => d.id), [large.id]);
});

test('brouillons : plein avant même le premier, c’est un refus (ancienne navigation privée de Safari)', () => {
  const drafts = new Drafts({ storage: storage({ limit: 0 }), now: clock() });
  drafts.create(TEMPLATE);
  assert.equal(drafts.status, 'refus');
  assert.equal(drafts.list().length, 1);
});

test('brouillons : un stockage illisible est mis de côté, tel quel', () => {
  const disk = storage({ initial: { [KEY]: '{pas du json' } });
  const drafts = new Drafts({ storage: disk, now: clock() });
  assert.deepEqual(drafts.list(), []);
  assert.equal(disk.data.get(`${KEY}:illisible`), '{pas du json');
  drafts.create(TEMPLATE);
  assert.equal(new Drafts({ storage: disk }).list().length, 1);
});

test('brouillons : ceux d’une version plus récente se lisent, mais ne se réécrivent pas', () => {
  const stored = JSON.stringify({ version: VERSION + 1, ouvert: 'a', brouillons: [{ id: 'a', texte: TEMPLATE, cree: 1, modifie: 2, dossier: 'x' }], plusTard: true });
  const disk = storage({ initial: { [KEY]: stored } });
  const drafts = new Drafts({ storage: disk, now: clock() });
  assert.equal(drafts.status, 'lecture');
  assert.equal(drafts.list()[0].nom, 'Mon niveau');
  const draft = drafts.create(titled('Ici'));
  assert.ok(drafts.get(draft.id), 'on peut dessiner, en mémoire');
  assert.equal(disk.data.get(KEY), stored, 'le stockage est intact');
});

test('brouillons : rien n’est retiré à la lecture, une entrée bizarre va dans « ecartes »', () => {
  const data = upgrade({ brouillons: [{ id: 'a', texte: TEMPLATE, modifie: 'hier' }, { id: 3 }, 'texte'], autre: 1 });
  assert.equal(data.version, VERSION);
  assert.deepEqual(data.brouillons, [{ id: 'a', texte: TEMPLATE, cree: 0, modifie: 0 }]);
  assert.deepEqual(data.ecartes, [{ id: 3 }, 'texte']);
  assert.equal(data.autre, 1);
  assert.deepEqual(upgrade(null), { version: VERSION, ouvert: '', brouillons: [] });
  assert.deepEqual(upgrade({ brouillons: 'non' }).ecartes, ['non']);
});

test('brouillons : l’ancien brouillon unique de l’Atelier devient le premier, une seule fois', () => {
  const disk = storage();
  const drafts = new Drafts({ storage: disk, now: clock() });
  assert.equal(drafts.adopt('', TEMPLATE), null, 'pas de brouillon');
  assert.equal(drafts.adopt(TEMPLATE, TEMPLATE), null, 'le niveau de départ, intact');
  assert.equal(drafts.adopt('titre: sans carte', TEMPLATE), null);
  const old = titled('Commencé avant');
  const draft = drafts.adopt(old, TEMPLATE);
  assert.equal(draft.texte, old);
  assert.equal(drafts.open, draft.id);
  assert.equal(new Drafts({ storage: disk }).adopt(old, TEMPLATE), null, 'pas deux fois');
});

test('brouillons : un nom libre, une date qui se lit', () => {
  assert.equal(freeName('Mon niveau', []), 'Mon niveau');
  assert.equal(freeName('Mon niveau', ['Mon niveau', 'Mon niveau 2']), 'Mon niveau 3');
  assert.equal(nameOf('titre: sans carte'), 'Sans titre');
  assert.equal(retitle('titre: sans carte', 'X'), 'titre: sans carte', 'pas de carte : on n’y touche pas');
  const now = new Date(2026, 10, 16, 18, 0).getTime();
  assert.equal(when(new Date(2026, 10, 16, 14, 32).getTime(), now), 'aujourd’hui, 14:32');
  assert.equal(when(new Date(2026, 10, 15, 9, 5).getTime(), now), 'hier, 09:05');
  assert.equal(when(new Date(2026, 10, 3, 18, 10).getTime(), now), '3 nov., 18:10');
  assert.equal(when(new Date(2025, 10, 3, 18, 10).getTime(), now), '3 nov. 2025, 18:10');
  assert.equal(when(0, now), '');
});

test('les liens pour contribuer mènent aux vrais formulaires du dépôt', () => {
  const links = contributions(REPO);
  assert.ok(links.length >= 6);
  for (const { text, url } of links) {
    assert.ok(url.startsWith(`${REPO}/`), text);
    const form = url.match(/[?&]template=([^&]+)/)?.[1];
    if (form) assert.ok(existsSync(new URL(`../.github/ISSUE_TEMPLATE/${form}`, import.meta.url)), `${text} : ${form}`);
    const file = url.match(/\/blob\/main\/(.+)$/)?.[1];
    if (file) assert.ok(existsSync(new URL(`../${file}`, import.meta.url)), `${text} : ${file}`);
  }
  const forms = links.map((l) => l.url.match(/template=([^&]+)/)?.[1]).filter(Boolean);
  for (const form of ['blague-ou-pancarte.yml', 'personnage.yml', 'source-a-corriger.yml', 'bug.yml']) assert.ok(forms.includes(form), form);
  assert.ok(links.some((l) => l.url === `${REPO}/pulls`), 'les propositions ouvertes');
});
