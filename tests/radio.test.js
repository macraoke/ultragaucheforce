// Radio Manif sans réseau : le choix de la piste à chaque moment du jeu, et ce que fait la Radio
// quand le lecteur SoundCloud (ici simulé) refuse de jouer, se tait, tombe en erreur ou rame.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../tools/content.mjs';
import { Radio, chooseTrack, poolsFor, frameAttributes, START_TIMEOUT, LOAD_TIMEOUT } from '../src/client/music.js';

const { bundle } = loadContent();
const real = Object.values(bundle.musiques);
const randoms = [0, 0.34, 0.67, 0.999].map((r) => () => r); // le hasard, figé : du premier au dernier choix

test('chaque niveau de la campagne a sa musique : la sienne, sinon celle de tous les niveaux', () => {
  assert.ok(bundle.campagne.length >= 6);
  for (const id of bundle.campagne) {
    const level = bundle.niveaux[id];
    const own = real.filter((t) => t.ou === id);
    for (const random of randoms) {
      const track = chooseTrack(real, { slot: id, named: level.musique, random });
      assert.ok(track, `${id} : aucune piste`);
      if (level.musique) assert.equal(track.id, level.musique, id);
      else assert.equal(track.ou, own.length ? id : 'jeu', `${id} : ${track.id}`);
    }
  }
});

test('le menu et le boss ont leurs pistes ; un niveau de l’Atelier prend celles de tous les niveaux', () => {
  for (const random of randoms) {
    assert.equal(chooseTrack(real, { slot: 'menu', random }).ou, 'menu');
    assert.equal(chooseTrack(real, { slot: 'boss', random }).ou, 'boss');
    assert.equal(chooseTrack(real, { slot: 'atelier', random }).ou, 'jeu');
  }
});

test('le lecteur a le droit de lancer le son et de lire les pistes chiffrées', () => {
  const frame = frameAttributes(real[0]);
  const allowed = frame.allow.split(';').map((s) => s.trim());
  assert.ok(allowed.includes('autoplay'));
  assert.ok(allowed.includes('encrypted-media')); // sans lui, « J'les aime pas » se charge et reste muette
  const src = new URL(frame.src);
  assert.equal(src.origin, 'https://w.soundcloud.com');
  assert.equal(src.searchParams.get('url'), real[0].url);
  assert.equal(src.searchParams.get('auto_play'), 'true');
});

const T = (id, ou) => ({ id, ou, url: `https://soundcloud.com/x/${id}`, titre: id, artiste: 'x' });
const tracks = [T('menu-a', 'menu'), T('menu-b', 'menu'), T('seule', 'chaine-info'), T('jeu-a', 'jeu'), T('jeu-b', 'jeu'), T('boss-a', 'boss'), T('nommee', 'boss')];

test('la piste nommée par le niveau passe d’abord ; une piste qui a échoué cède la place à la liste suivante', () => {
  assert.equal(chooseTrack(tracks, { slot: 'chaine-info', named: 'nommee' }).id, 'nommee');
  assert.equal(chooseTrack(tracks, { slot: 'chaine-info' }).id, 'seule');
  assert.equal(chooseTrack(tracks, { slot: 'chaine-info', failed: new Set(['seule']) }).ou, 'jeu');
  assert.equal(chooseTrack(tracks, { slot: 'menu', failed: new Set(['menu-a', 'menu-b']), random: () => 0 }).id, 'seule'); // dernier recours : n'importe laquelle
  assert.equal(chooseTrack(tracks, { slot: 'menu', failed: new Set(tracks.map((t) => t.id)) }), null);
  assert.deepEqual(poolsFor(tracks, 'menu').map((p) => p.length), [2, tracks.length]); // au menu, pas de piste « jeu » avant le dernier recours
});

test('en fin de piste, une autre de la même liste si possible', () => {
  const [a, b] = tracks.filter((t) => t.ou === 'jeu');
  for (const random of randoms) assert.equal(chooseTrack(tracks, { slot: 'rond-point', avoid: a, random }), b);
  assert.equal(chooseTrack(tracks, { slot: 'chaine-info', avoid: tracks[2] }), tracks[2]); // seule de sa liste : elle reprend
});

/**
 * Une Radio branchée sur un faux lecteur SoundCloud, une fausse horloge et un faux panneau.
 * Le faux lecteur suit l'ordre du vrai : `load()` part, puis le test dit quand la piste est prête
 * (`s.ready()`), et ce que le lecteur annonce entre-temps (une ERROR arrive avant le rappel de `load()`).
 */
function setup({ activated = true, connect = 'ok', list = tracks, random = () => 0 } = {}) {
  const timers = [];
  let now = 0;
  let emit = () => {};
  const widget = {
    loads: [], plays: 0, pauses: 0, paused: false, sound: {},
    load(url, opts) { this.loads.push(url); this.callback = opts?.callback; },
    play() { this.plays++; },
    pause() { this.pauses++; },
    setVolume() {},
    getCurrentSound(cb) { cb(this.sound); },
    isPaused(cb) { cb(this.paused); },
  };
  const ctx = { widget, connects: [], activated, now: () => now };
  const view = { show(state) { ctx.shown = state; }, mount() {}, unmount() { ctx.unmounted = true; }, setVisible() {} };
  const radio = new Radio({ musiques: Object.fromEntries(list.map((t) => [t.id, t])) }, null, {
    random,
    later(fn, ms) { const t = { at: now + ms, fn }; timers.push(t); return t; },
    cancel(t) { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
    online: () => true,
    activated: () => ctx.activated,
    connect(track, onEvent) {
      ctx.connects.push(track.id);
      emit = onEvent;
      return connect === 'ok' ? Promise.resolve(widget) : Promise.reject(new Error('hors ligne'));
    },
    view,
  });
  ctx.radio = radio;
  ctx.emit = (name, data) => emit(name, data);
  ctx.playing = () => emit('PLAY_PROGRESS', { currentPosition: 300 });
  /** Le lecteur a fini de charger la piste demandée par `load()`. */
  ctx.ready = () => widget.callback?.();
  ctx.advance = (ms) => {
    const end = now + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= end).sort((x, y) => x.at - y.at)[0];
      if (!due) break;
      timers.splice(timers.indexOf(due), 1);
      now = due.at;
      due.fn();
    }
    now = end;
  };
  ctx.flush = () => new Promise((resolve) => setImmediate(resolve));
  /** L'adresse de la dernière piste demandée au lecteur. */
  ctx.lastUrl = () => widget.loads.at(-1);
  /** Musique activée, le lecteur créé avec sa première piste, et la lecture partie. */
  ctx.on = async () => {
    radio.setEnabled(true);
    await ctx.flush();
    ctx.playing();
  };
  return ctx;
}

test('une piste morte annoncée avant la fin de son chargement : une autre tout de suite', async () => {
  const s = setup();
  await s.on();
  s.radio.play('chaine-info');
  assert.equal(s.lastUrl(), tracks[2].url);
  s.emit('ERROR'); // le vrai lecteur l'annonce avant le rappel de load()
  s.ready();
  assert.ok(s.radio.failed.has('seule'));
  assert.equal(s.lastUrl(), tracks[3].url); // aussitôt, sans attendre de délai
  assert.equal(s.radio.status, 'loading');
  s.ready();
  s.playing();
  assert.equal(s.radio.status, 'playing');
});

test('la première piste morte : une autre, sans attendre', async () => {
  const s = setup();
  s.radio.setEnabled(true);
  await s.flush();
  assert.deepEqual(s.connects, ['menu-a']);
  s.emit('ERROR');
  assert.equal(s.radio.current.id, 'menu-b');
  assert.equal(s.lastUrl(), tracks[1].url);
  s.ready();
  s.playing();
  assert.equal(s.radio.status, 'playing');
});

test('réseau lent : prête à 12 s, lancée à 15 s, la piste est gardée', async () => {
  const s = setup();
  await s.on();
  s.radio.play('rond-point');
  s.advance(12000); // le lecteur charge la nouvelle piste lentement
  assert.equal(s.radio.status, 'loading');
  s.ready();
  s.advance(3000);
  s.playing();
  assert.equal(s.radio.status, 'playing');
  assert.equal(s.radio.current.id, 'jeu-a');
  assert.equal(s.radio.failed.size, 0);
});

test('réseau très lent : le lecteur dit qu’il joue mais rien n’avance encore ; on attend, sans écarter la piste', async () => {
  const s = setup();
  await s.on();
  s.radio.play('rond-point');
  s.ready();
  s.advance(START_TIMEOUT * 4); // le lecteur répond « pas en pause » : il charge le son
  assert.equal(s.radio.status, 'loading');
  assert.equal(s.radio.failed.size, 0);
  assert.equal(s.widget.loads.length, 1);
  s.playing();
  assert.equal(s.radio.status, 'playing');
});

test('une piste chargée qui ne part jamais (chiffrée, sans module de lecture) : une relance, puis une autre', async () => {
  const s = setup();
  await s.on();
  s.radio.play('chaine-info');
  s.ready();
  s.widget.paused = true; // chargée, arrêtée, sans refus annoncé
  s.advance(START_TIMEOUT);
  assert.equal(s.widget.plays, 1);
  s.advance(5000);
  assert.ok(s.radio.failed.has('seule'));
  assert.equal(s.radio.current.ou, 'jeu'); // la seule piste du niveau a échoué : celles de tous les niveaux
  s.widget.paused = false;
  s.ready();
  s.playing();
  assert.equal(s.radio.status, 'playing');
  // « Recommencer » : la piste écartée n'est pas redemandée, la musique continue.
  const loads = s.widget.loads.length;
  s.radio.play('chaine-info');
  assert.equal(s.widget.loads.length, loads);
  // Le réseau revient : les pistes écartées retrouvent leur chance.
  s.radio.reconnected();
  assert.equal(s.radio.failed.size, 0);
});

test('lecture refusée sans geste : le bouton le montre, et un toucher la relance', async () => {
  const s = setup({ activated: false }); // musique activée lors d'une visite précédente, page rechargée
  s.radio.setEnabled(true);
  await s.flush();
  s.emit('PAUSE'); // le navigateur refuse la lecture automatique
  assert.equal(s.radio.status, 'blocked');
  assert.equal(s.shown.status, 'blocked');
  assert.equal(s.widget.plays, 0);
  s.activated = true;
  s.radio.unblock();
  assert.equal(s.widget.plays, 1);
  s.playing();
  assert.equal(s.radio.status, 'playing');
  assert.equal(s.shown.status, 'playing');
  s.radio.unblock(); // un autre toucher ne relance rien
  assert.equal(s.widget.plays, 1);
});

test('lecture refusée après un geste : un nouvel essai tout seul, puis le bouton', async () => {
  const s = setup();
  await s.on();
  s.radio.play('boss');
  s.ready();
  s.emit('PLAY');
  s.emit('PAUSE'); // le changement de piste n'a pas eu le droit de jouer (Safari)
  assert.equal(s.widget.plays, 1);
  s.emit('PAUSE');
  assert.equal(s.radio.status, 'blocked');
  s.radio.retry(); // le bouton « Relancer la musique »
  assert.equal(s.widget.plays, 2);
  s.playing();
  assert.equal(s.radio.status, 'playing');
  assert.equal(s.radio.current.ou, 'boss');
  assert.equal(s.radio.failed.size, 0); // refusée n'est pas morte
});

test('un délai écoulé sans geste du joueur n’écarte pas la piste : il montre le bouton', async () => {
  const s = setup({ activated: false });
  s.radio.setEnabled(true);
  await s.flush();
  s.advance(START_TIMEOUT);
  assert.equal(s.radio.status, 'blocked');
  assert.equal(s.radio.failed.size, 0);
});

test('menu, niveau, boss, « Recommencer », niveau suivant, retour au menu : la bonne piste à chaque fois', async () => {
  const s = setup();
  await s.on();
  s.radio.play('rond-point');
  assert.equal(s.lastUrl(), tracks[3].url);
  s.ready();
  s.playing();
  s.radio.play('rond-point'); // « Recommencer » avant le boss : la musique continue
  assert.equal(s.widget.loads.length, 1);
  s.radio.play('boss');
  assert.equal(s.lastUrl(), tracks[5].url);
  s.ready();
  s.playing();
  s.radio.play('rond-point'); // « Rejouer » après le boss
  assert.equal(s.lastUrl(), tracks[3].url);
  s.ready();
  s.playing();
  s.radio.play('raffinerie'); // niveau suivant, même liste : la piste continue
  assert.equal(s.widget.loads.length, 3);
  s.radio.play('menu');
  assert.equal(s.lastUrl(), tracks[0].url);
  s.ready();
  s.playing();
  s.emit('FINISH');
  assert.equal(s.lastUrl(), tracks[1].url); // fin de piste : l'autre piste du menu
});

test('après un changement de piste, ce que le lecteur annonce encore de l’ancienne ne compte pas', async () => {
  const s = setup();
  await s.on();
  s.radio.play('chaine-info');
  s.playing(); // l'ancienne piste joue encore le temps que la nouvelle se charge
  s.emit('PAUSE');
  s.emit('FINISH');
  assert.equal(s.radio.status, 'loading');
  assert.equal(s.widget.plays, 0);
  assert.equal(s.widget.loads.length, 1);
});

test('couper puis remettre la musique la relance, même si le hasard retombe sur la même piste', async () => {
  const s = setup();
  await s.on();
  s.radio.setEnabled(false);
  assert.equal(s.widget.pauses, 1);
  s.emit('PAUSE'); // notre propre pause n'est pas un refus
  assert.equal(s.radio.status, 'off');
  s.radio.setEnabled(true);
  assert.equal(s.widget.plays, 1);
  assert.equal(s.widget.loads.length, 0);
  s.playing();
  assert.equal(s.radio.status, 'playing');
});

test('musique coupée puis remise avant que le lecteur soit prêt : la piste n’est pas condamnée', async () => {
  const s = setup();
  s.radio.setEnabled(true);
  s.radio.setEnabled(false);
  s.radio.setEnabled(true); // double clic sur l'option, le lecteur se charge encore
  await s.flush();
  assert.deepEqual(s.connects, ['menu-a']);
  s.playing();
  assert.equal(s.radio.status, 'playing');
  assert.equal(s.radio.failed.size, 0);
});

test('onglet caché : la musique continue ; arrêtée par le système pendant ce temps, elle reprend au retour', async () => {
  const s = setup();
  await s.on();
  s.radio.play('rond-point');
  s.ready();
  s.playing();
  s.radio.setHidden(true);
  assert.equal(s.widget.pauses, 0);
  s.emit('PAUSE'); // téléphone verrouillé : le système coupe le son
  s.playing(); // un dernier « ça avance » parti avant la pause
  assert.equal(s.radio.status, 'paused');
  s.radio.setHidden(false);
  assert.equal(s.widget.plays, 1);
  s.playing();
  assert.equal(s.radio.status, 'playing');
  s.radio.setHidden(true);
  s.radio.setHidden(false); // rien n'a été coupé : rien à relancer
  assert.equal(s.widget.plays, 1);
});

test('onglet caché pendant un changement de piste : aucun délai ne condamne la piste', async () => {
  const s = setup();
  await s.on();
  s.radio.setHidden(true);
  s.emit('FINISH'); // la piste suivante ne part pas tant que l'onglet est caché
  s.ready();
  s.widget.paused = true;
  s.advance(LOAD_TIMEOUT * 3);
  assert.equal(s.radio.failed.size, 0);
  assert.equal(s.radio.status, 'loading');
  s.radio.setHidden(false);
  s.widget.paused = false;
  s.playing();
  assert.equal(s.radio.status, 'playing');
});

test('le joueur met le lecteur en pause : rien ne le relance de force, le niveau suivant si', async () => {
  const s = setup();
  await s.on();
  s.emit('PAUSE');
  assert.equal(s.radio.status, 'paused');
  s.radio.unblock();
  assert.equal(s.widget.plays, 0);
  s.radio.play('chaine-info');
  assert.equal(s.lastUrl(), tracks[2].url);
});

test('le joueur relance lui-même le lecteur (son bouton, dans le menu) : la Radio le suit', async () => {
  const s = setup();
  await s.on();
  s.emit('PAUSE');
  assert.equal(s.radio.status, 'paused');
  s.emit('PLAY');
  s.playing();
  assert.equal(s.radio.status, 'playing');
  assert.equal(s.widget.plays, 0);
});

test('SoundCloud injoignable (bloqueur, portail) : aucune touche ne recrée le lecteur ; le bouton ou le réseau, si', async () => {
  const s = setup({ connect: 'non' });
  s.radio.setEnabled(true);
  await s.flush();
  assert.equal(s.radio.status, 'unreachable');
  assert.ok(s.unmounted);
  for (let i = 0; i < 40; i++) s.radio.unblock(); // flèche tenue, sauts
  s.radio.play('raffinerie');
  s.radio.play('boss');
  assert.deepEqual(s.connects, ['menu-a']);
  s.radio.retry(); // le bouton « ▶ Radio Manif »
  await s.flush();
  assert.equal(s.connects.length, 2);
  assert.equal(s.connects[1], 'boss-a'); // la musique du moment, pas celle du menu
  s.radio.reconnected(); // le réseau revient
  await s.flush();
  assert.equal(s.connects.length, 3);
});

test('une piste qui ne se charge jamais (réseau coupé en plein changement) : le lecteur est déclaré injoignable, sans écarter la piste', async () => {
  const s = setup();
  await s.on();
  s.radio.play('raffinerie');
  s.advance(LOAD_TIMEOUT); // le rappel de load() ne vient jamais
  assert.equal(s.radio.status, 'unreachable');
  assert.equal(s.radio.failed.size, 0);
  assert.equal(s.widget.loads.length, 1);
  for (let i = 0; i < 10; i++) s.radio.unblock();
  assert.equal(s.widget.loads.length, 1); // les touches ne rechargent rien
  s.radio.reconnected();
  assert.equal(s.widget.loads.length, 2);
  assert.equal(s.lastUrl(), tracks[3].url);
  s.ready();
  s.playing();
  assert.equal(s.radio.status, 'playing');
});

test('toutes les pistes échouent (API de SoundCloud en panne) : injoignable ; aucun geste ne relance un tour, le bouton si', async () => {
  const s = setup({ list: [T('a', 'menu'), T('b', 'boss'), T('c', 'jeu')] });
  s.radio.setEnabled(true);
  await s.flush();
  s.emit('ERROR');
  s.emit('ERROR');
  s.emit('ERROR');
  assert.equal(s.radio.status, 'unreachable');
  assert.equal(s.radio.failed.size, 3);
  const loads = s.widget.loads.length;
  for (let i = 0; i < 160; i++) s.radio.unblock(); // 40 s de jeu au clavier
  s.radio.play('raffinerie'); // niveau suivant
  s.radio.play('boss');
  assert.equal(s.widget.loads.length, loads);
  s.radio.retry(); // le bouton « Relancer la musique »
  assert.equal(s.radio.failed.size, 0);
  assert.equal(s.radio.status, 'loading');
  assert.equal(s.widget.loads.length, loads + 1);
});

/** Un hasard à graine, pour des tirages nombreux et reproductibles. */
const seeded = (seed) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test('au boss, au hasard : Monarch, AGGRESSIVE FOMO ou « coupé cassé » ; Ryukken toujours après Monarch, jamais tirée', async () => {
  // Décision de Valentin, 16 novembre 2026 : « Au hasard, Ryukken après Monarch ».
  const monarch = bundle.musiques['abattez-la-citadelle'];
  const ryukken = bundle.musiques['abattez-la-citadelle-ryukken'];
  const fomo = bundle.musiques['aggressive-fomo'];
  const coupe = bundle.musiques['abattez-la-citadelle-coupe'];
  assert.equal(monarch.puis, ryukken.id);
  const random = seeded(7);
  const count = new Map();
  for (let i = 0; i < 1000; i++) {
    const t = chooseTrack(real, { slot: 'boss', random });
    count.set(t.id, (count.get(t.id) || 0) + 1);
  }
  assert.ok(count.get(monarch.id) > 250, `Monarch : ${count.get(monarch.id)} sur 1000`);
  assert.ok(count.get(fomo.id) > 250, `AGGRESSIVE FOMO : ${count.get(fomo.id)} sur 1000`);
  assert.ok(count.get(coupe.id) > 250, `coupé cassé : ${count.get(coupe.id)} sur 1000`);
  assert.ok(!coupe.puis); // pas de suite
  assert.equal(count.get(ryukken.id) || 0, 0); // jamais tirée au hasard
  // Dans la Radio : à chaque arrivée au boss tirée sur Monarch, Ryukken suit son extrait.
  let monarchs = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const s = setup({ list: real, random: seeded(seed) });
    await s.on();
    s.radio.play('boss');
    const first = s.radio.current;
    assert.ok(first === monarch || first === fomo || first === coupe, first.id);
    if (first !== monarch) continue;
    monarchs++;
    s.ready();
    s.playing();
    s.emit('FINISH'); // l'extrait de 30 s est fini
    assert.equal(s.lastUrl(), ryukken.url);
    s.ready();
    s.playing();
    s.emit('FINISH');
    assert.notEqual(s.radio.current, ryukken);
    assert.equal(s.radio.current.ou, 'boss');
  }
  assert.ok(monarchs > 35 && monarchs < 100, `Monarch : ${monarchs} arrivées au boss sur 200`);
});

test('l’extrait de Monarch ne se charge pas : la version de Ryukken prend sa place', async () => {
  const s = setup({ list: real });
  await s.on();
  s.radio.play('boss');
  s.emit('ERROR');
  assert.equal(s.lastUrl(), bundle.musiques['abattez-la-citadelle-ryukken'].url);
});
