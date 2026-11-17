// Radio Manif sans réseau : le choix de la piste à chaque moment du jeu, et ce que fait la Radio
// quand le lecteur SoundCloud (ici simulé) refuse de jouer, se tait, tombe en erreur ou rame.

import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../tools/content.mjs';
import { Radio, chooseTrack, nextLevelTrack, openingTrack, poolsFor, frameAttributes, START_TIMEOUT, LOAD_TIMEOUT } from '../src/client/music.js';

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
  s.radio.play('chaine-info', null, { restart: true });
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
  s.radio.play('rond-point', null, { restart: true }); // « Recommencer » avant le boss : la musique continue
  assert.equal(s.widget.loads.length, 1);
  s.radio.play('boss');
  assert.equal(s.lastUrl(), tracks[5].url);
  s.ready();
  s.playing();
  s.radio.play('rond-point'); // « Rejouer » après une victoire : une nouvelle entrée, une autre piste que la première fois
  assert.equal(s.lastUrl(), tracks[4].url);
  s.ready();
  s.playing();
  s.radio.play('raffinerie'); // niveau suivant : la piste change aussi
  assert.equal(s.lastUrl(), tracks[3].url);
  assert.equal(s.widget.loads.length, 4);
  s.ready();
  s.playing();
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

// Relecture : deux chargements coup sur coup (quitter le niveau juste après « C'est parti », le boss juste après une
// fin de piste) : `widget.load()` remet le lecteur à zéro, le « prêt » du premier faisait partir le rappel du second
// trop tôt, et le nouveau lecteur n'envoyait plus rien. La piste jouait, la Radio l'écartait au bout d'une minute.

test('deux pistes demandées coup sur coup : un seul chargement avant le rappel, puis la dernière demandée', async () => {
  const s = setup();
  await s.on();
  s.radio.play('rond-point');
  s.radio.play('boss'); // deux start() de suite
  assert.equal(s.widget.loads.length, 1, 'pas de second load() avant le rappel du premier');
  assert.equal(s.radio.current.id, 'boss-a');
  s.playing(); // le lecteur annonce encore l'ancienne piste
  assert.equal(s.radio.status, 'loading');
  s.ready();
  assert.equal(s.widget.loads.length, 2);
  assert.equal(s.lastUrl(), tracks[5].url, 'au rappel, la piste voulue entre-temps');
  s.ready();
  s.playing();
  assert.equal(s.radio.status, 'playing');
  assert.equal(s.radio.failed.size, 0);
  // Trois moments en rafale : la première piste, puis seulement la dernière.
  s.radio.play('raffinerie');
  s.radio.play('boss');
  s.radio.play('menu');
  assert.equal(s.widget.loads.length, 3);
  s.ready();
  assert.equal(s.widget.loads.length, 4);
  assert.equal(s.lastUrl(), s.radio.current.url);
  assert.equal(s.radio.current.ou, 'menu');
});

test('un chargement qui ne rappelle jamais : injoignable, le bouton recharge ; un rappel tardif ne compte plus', async () => {
  const s = setup();
  await s.on();
  s.radio.play('rond-point');
  const late = s.widget.callback;
  s.radio.play('boss');
  s.advance(LOAD_TIMEOUT);
  assert.equal(s.radio.status, 'unreachable');
  s.radio.retry(); // le bouton « Relancer la musique »
  assert.equal(s.widget.loads.length, 2);
  assert.equal(s.lastUrl(), tracks[5].url);
  late(); // le premier chargement finit par rappeler
  assert.equal(s.widget.loads.length, 2);
  assert.equal(s.radio.attempt.loaded, false, 'la piste du boss attend encore son propre rappel');
  s.ready();
  s.playing();
  assert.equal(s.radio.status, 'playing');
});

test('le réseau revient pendant un chargement : rien par-dessus ; sans rappel dix secondes plus tard, un nouvel essai', async () => {
  const s = setup();
  await s.on();
  s.radio.play('rond-point');
  s.radio.reconnected();
  assert.equal(s.widget.loads.length, 1, 'le chargement en cours a sa chance');
  s.ready();
  s.playing();
  assert.equal(s.radio.status, 'playing');
  s.emit('FINISH'); // cette fois, le réseau a coupé pendant le chargement : pas de rappel
  assert.equal(s.widget.loads.length, 2);
  s.radio.reconnected();
  s.advance(START_TIMEOUT - 1);
  assert.equal(s.widget.loads.length, 2);
  s.advance(1);
  assert.equal(s.widget.loads.length, 3, 'le chargement resté en plan repart');
  assert.equal(s.lastUrl(), s.widget.loads[1]);
  s.ready();
  s.playing();
  assert.equal(s.radio.status, 'playing');
});

test('musique coupée pendant un chargement : la piste chargée ne part pas, et rien d’autre ne se charge', async () => {
  const s = setup();
  await s.on();
  s.radio.play('rond-point');
  s.radio.play('boss');
  s.radio.setEnabled(false);
  const pauses = s.widget.pauses;
  s.ready(); // chargée, le lecteur la lancerait de lui-même
  assert.equal(s.widget.pauses, pauses + 1);
  assert.equal(s.widget.loads.length, 1);
  assert.equal(s.radio.status, 'off');
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

test('au boss, au hasard parmi toutes ses pistes ; Ryukken toujours après Monarch, jamais tirée', async () => {
  // Décision de Valentin, 16 novembre 2026 : « Au hasard, Ryukken après Monarch ».
  const monarch = bundle.musiques['abattez-la-citadelle'];
  const ryukken = bundle.musiques['abattez-la-citadelle-ryukken'];
  assert.equal(monarch.puis, ryukken.id);
  const drawn = real.filter((t) => t.ou === 'boss' && t !== ryukken); // Monarch, AGGRESSIVE FOMO, « coupé cassé », et les intenses
  assert.ok(drawn.length >= 3);
  assert.ok(drawn.every((t) => !t.puis || t === monarch), 'une seule suite : Monarch puis Ryukken');
  const random = seeded(7);
  const count = new Map();
  for (let i = 0; i < 1000; i++) {
    const t = chooseTrack(real, { slot: 'boss', random });
    count.set(t.id, (count.get(t.id) || 0) + 1);
  }
  for (const t of drawn) assert.ok(count.get(t.id) > 700 / drawn.length, `${t.id} : ${count.get(t.id)} sur 1000`);
  assert.equal(count.get(ryukken.id) || 0, 0); // jamais tirée au hasard
  // Dans la Radio : à chaque arrivée au boss tirée sur Monarch, Ryukken suit son extrait.
  let monarchs = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const s = setup({ list: real, random: seeded(seed) });
    await s.on();
    s.radio.play('boss');
    const first = s.radio.current;
    assert.ok(drawn.includes(first), first.id);
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
  assert.ok(monarchs > 150 / drawn.length && monarchs < 600 / drawn.length, `Monarch : ${monarchs} arrivées au boss sur 300`);
});

test('l’extrait de Monarch ne se charge pas : la version de Ryukken prend sa place', async () => {
  const s = setup({ list: real });
  await s.on();
  s.radio.play('boss');
  s.emit('ERROR');
  assert.equal(s.radio.current, bundle.musiques['abattez-la-citadelle-ryukken']);
  s.ready(); // le lecteur rappelle après son erreur : la suite se charge
  assert.equal(s.lastUrl(), bundle.musiques['abattez-la-citadelle-ryukken'].url);
});

// ---------------------------------------------------------------------- des musiques qui tournent
// Valentin, 16 novembre 2026 : « aussi les musiques pendant le jeu elles tournent pas assez je trouve ».

/** Une campagne jouée dans la Radio : l'ouverture de chaque niveau, avec son boss entre deux. */
async function campaignOpenings(s, levels) {
  const openings = [];
  for (const id of levels) {
    s.radio.play(id, bundle.niveaux[id]?.musique);
    openings.push(s.radio.current.id);
    s.ready();
    s.playing();
    s.radio.play('boss');
    s.ready();
    s.playing();
  }
  return openings;
}

test('une campagne : six niveaux, six pistes différentes, et chaque niveau ouvre sur sa piste à lui, s’il en a une', async () => {
  for (let seed = 1; seed <= 100; seed++) {
    const s = setup({ list: real, random: seeded(seed) });
    await s.on();
    const openings = await campaignOpenings(s, bundle.campagne);
    assert.equal(new Set(openings).size, bundle.campagne.length, openings.join(', '));
    bundle.campagne.forEach((id, i) => {
      const own = real.filter((t) => t.ou === id);
      if (own.length) assert.equal(bundle.musiques[openings[i]].ou, id, `${id} : ${openings[i]}`);
    });
  }
});

test('à l’entrée, jamais la piste qu’on entend déjà : un niveau à deux pistes prend l’autre, à une seule, le sac', () => {
  const list = [...tracks, T('propre-a', 'rond-point'), T('propre-b', 'rond-point')];
  const [a, b] = list.slice(-2);
  for (const random of randoms) {
    assert.equal(openingTrack(list, { slot: 'rond-point', avoid: a, random }), b);
    assert.equal(openingTrack(list, { slot: 'rond-point', avoid: a, last: b.id, random }), b, 'celle de la visite d’avant, plutôt que celle qu’on entend');
    assert.equal(openingTrack(list, { slot: 'rond-point', last: a.id, random }), b, 'sinon, une autre que la visite d’avant');
  }
  assert.equal(openingTrack(tracks, { slot: 'chaine-info', avoid: tracks[2] }), null, 'sa seule piste joue déjà : rien, le sac commence');
  assert.equal(openingTrack(tracks, { slot: 'rond-point', named: 'jeu-b', avoid: tracks[4] }), null, 'la piste nommée joue déjà : le sac aussi');
});

test('« Sa piste en premier » : chaque entrée dans un niveau commence par sa piste à lui, puis le sac', async () => {
  // Valentin, 16 novembre 2026 : « Sa piste en premier : chaque entrée dans un niveau commence par sa piste à lui,
  // et le sac prend le relais ensuite. »
  for (const id of bundle.campagne) {
    const own = real.filter((t) => t.ou === id).map((t) => t.id);
    for (let seed = 1; seed <= 20; seed++) {
      const s = setup({ list: real, random: seeded(seed) });
      await s.on();
      const [first, again] = await campaignOpenings(s, [id, id]); // deux entrées, le boss entre les deux
      if (!own.length) {
        assert.notEqual(again, first, `${id} sans piste à lui : le sac, graine ${seed}`);
        continue;
      }
      assert.ok(own.includes(first) && own.includes(again), `${id} : ${first}, puis ${again}`);
      if (own.length > 1) assert.notEqual(again, first, `${id} : pas la même que la visite d'avant`);
    }
  }
  // Une piste nommée par un niveau (`musique`) : à chaque entrée.
  const n = setup({ random: seeded(5) });
  await n.on();
  const named = [];
  for (let i = 0; i < 3; i++) {
    n.radio.play('rond-point', 'jeu-b');
    named.push(n.radio.current.id);
    n.ready();
    n.playing();
    n.radio.play('boss');
    n.ready();
    n.playing();
  }
  assert.deepEqual(named, ['jeu-b', 'jeu-b', 'jeu-b']);
});

test('« Recommencer » n’est pas une entrée ; après sa piste, le sac, jamais celle qui vient de passer ; sa piste en échec, le sac', async () => {
  const s = setup({ list: real, random: seeded(9) });
  await s.on();
  s.radio.play('chaine-info');
  assert.equal(s.radio.current.id, 'jles-aime-pas');
  s.ready();
  s.playing();
  const loads = s.widget.loads.length;
  s.radio.play('chaine-info', null, { restart: true }); // « Recommencer »
  assert.equal(s.widget.loads.length, loads, 'la musique continue');
  s.emit('FINISH');
  assert.equal(s.radio.current.ou, 'jeu', 'le sac prend le relais');
  assert.notEqual(s.radio.current.id, 'jles-aime-pas');
  s.ready();
  s.playing();
  s.radio.play('boss');
  s.ready();
  s.playing();
  s.radio.play('chaine-info'); // nouvelle entrée : sa piste, de nouveau
  assert.equal(s.radio.current.id, 'jles-aime-pas');
  s.emit('ERROR'); // chiffrée, sans module de lecture
  assert.equal(s.radio.current.ou, 'jeu', 'sa piste échoue : le sac');
  // Plus tard, sa piste en échec n'est plus proposée à l'entrée : le sac directement.
  s.ready();
  s.playing();
  s.radio.play('boss');
  s.ready();
  s.playing();
  s.radio.play('chaine-info');
  assert.equal(s.radio.current.ou, 'jeu');
});

// Relecture : « Recommencer » reprend la piste de niveau de cette visite, même après une mort au boss ; « Rejouer »,
// après une victoire, est une nouvelle entrée. main.js dit à la Radio lequel des deux (`restart`).
const ownList = [...tracks, T('propre-a', 'rond-point'), T('propre-b', 'rond-point')];

test('« Recommencer » après une mort au boss : la piste de cette visite revient, pas l’autre piste du niveau', async () => {
  const s = setup({ list: ownList });
  await s.on();
  s.radio.play('rond-point');
  assert.equal(s.radio.current.id, 'propre-a');
  s.ready();
  s.playing();
  s.radio.play('boss');
  s.ready();
  s.playing();
  s.radio.play('rond-point', null, { restart: true }); // « Game over » au boss, puis « Recommencer »
  assert.equal(s.radio.current.id, 'propre-a');
  assert.equal(s.lastUrl(), ownList.find((t) => t.id === 'propre-a').url);
  s.ready();
  s.playing();
  assert.equal(s.radio.status, 'playing');
  // La visite a continué après la fin de sa piste : c'est la suivante qui revient.
  s.emit('FINISH');
  const then = s.radio.current;
  assert.notEqual(then.id, 'propre-a');
  s.ready();
  s.playing();
  s.radio.play('boss');
  s.ready();
  s.playing();
  s.radio.play('rond-point', null, { restart: true });
  assert.equal(s.radio.current, then);
});

test('« Rejouer » après une victoire : une nouvelle entrée, et l’autre piste du niveau', async () => {
  const s = setup({ list: ownList });
  await s.on();
  s.radio.play('rond-point');
  assert.equal(s.radio.current.id, 'propre-a');
  s.ready();
  s.playing();
  s.radio.play('boss');
  s.ready();
  s.playing();
  s.radio.play('rond-point'); // la taxe, l'écran de fin, « Rejouer »
  assert.equal(s.radio.current.id, 'propre-b');
});

test('« Recommencer », musique en pause ou refusée : elle le reste, sur la même piste', async () => {
  const s = setup({ list: ownList });
  await s.on();
  s.radio.play('rond-point');
  s.ready();
  s.playing();
  s.emit('PAUSE'); // le joueur met le lecteur en pause
  assert.equal(s.radio.status, 'paused');
  const loads = s.widget.loads.length;
  s.radio.play('rond-point', null, { restart: true });
  assert.equal(s.radio.status, 'paused');
  assert.equal(s.radio.current.id, 'propre-a');
  assert.equal(s.widget.loads.length, loads);
  assert.equal(s.widget.plays, 0);
  // Refusée par le navigateur : la même piste attend le prochain geste.
  const b = setup({ list: ownList, activated: false });
  await b.on();
  b.radio.play('rond-point');
  b.ready();
  b.advance(START_TIMEOUT);
  assert.equal(b.radio.status, 'blocked');
  b.radio.play('rond-point', null, { restart: true });
  assert.equal(b.radio.status, 'blocked');
  assert.equal(b.radio.current.id, 'propre-a');
  assert.equal(b.widget.loads.length, 1);
  b.radio.unblock();
  assert.equal(b.widget.plays, 1);
  assert.equal(b.widget.loads.length, 1);
});

test('aucune piste de niveau ne revient avant que les autres soient passées, d’un niveau à l’autre comme en fin de piste', async () => {
  const jeu = real.filter((t) => t.ou === 'jeu').map((t) => t.id);
  for (let seed = 1; seed <= 50; seed++) {
    const s = setup({ list: real, random: seeded(seed) });
    await s.on();
    const heard = [];
    for (let i = 0; i < 6; i++) {
      s.radio.play(['rond-point', 'raffinerie', 'bismillah'][i % 3]);
      heard.push(s.radio.current.id);
      s.ready();
      s.playing();
      s.emit('FINISH'); // le niveau dure plus que sa piste : la suivante
      heard.push(s.radio.current.id);
      s.ready();
      s.playing();
      s.radio.play('boss');
      s.ready();
      s.playing();
    }
    // Un sac : pas une piste deux fois avant que toutes soient passées ; puis un nouveau tour, jamais sur la même.
    let bag = new Set();
    for (const t of heard) {
      assert.ok(!bag.has(t), `graine ${seed} : « ${t} » revient avant la fin du tour (${heard.join(', ')})`);
      bag.add(t);
      if (jeu.every((x) => bag.has(x))) bag = new Set([t]);
    }
  }
});

test('un grand sac : toutes les pistes « jeu » passent, trois tours de suite, sans qu’aucune revienne avant les autres', async () => {
  const jeu = real.filter((t) => t.ou === 'jeu').map((t) => t.id);
  assert.ok(jeu.length >= 20, `${jeu.length} pistes « jeu »`);
  const s = setup({ list: real, random: seeded(11) });
  await s.on();
  s.radio.play('rond-point');
  const heard = [s.radio.current.id];
  s.ready();
  s.playing();
  while (heard.length < jeu.length * 3) {
    s.emit('FINISH');
    heard.push(s.radio.current.id);
    s.ready();
    s.playing();
  }
  let bag = new Set();
  let rounds = 0;
  for (const t of heard) {
    assert.ok(!bag.has(t), `« ${t} » revient avant la fin du tour`);
    bag.add(t);
    if (jeu.every((x) => bag.has(x))) {
      rounds++;
      bag = new Set([t]);
    }
  }
  assert.ok(rounds >= 2, `${rounds} tours complets`);
});

test('le menu et le boss gardent leur tirage au hasard, sans sac', async () => {
  const s = setup({ list: real, random: seeded(13) });
  await s.on();
  const boss = [];
  for (let i = 0; i < 60; i++) {
    s.radio.play('rond-point');
    s.ready();
    s.playing();
    s.radio.play('boss');
    boss.push(s.radio.current.id);
    s.ready();
    s.playing();
  }
  assert.ok(boss.some((t, i) => i > 0 && t === boss[i - 1]), 'le boss peut retomber sur la même piste deux fois de suite');
  assert.ok(s.radio.heard.size <= real.filter((t) => t.ou === 'jeu').length, 'le sac ne garde que des pistes de niveau');
  const menu = new Set();
  for (let i = 0; i < 40; i++) menu.add(chooseTrack(real, { slot: 'menu', random: seeded(i + 1) }).id);
  assert.deepEqual([...menu].sort(), real.filter((t) => t.ou === 'menu').map((t) => t.id).sort(), 'le menu tire parmi ses pistes');
});

test('après l’échec de la dernière piste du sac, la piste qu’on vient d’entendre ne revient pas', async () => {
  // Relecture : une piste chiffrée, seule dans le sac, échoue ; le tirage de secours retombait sur la précédente.
  const list = [...tracks, T('jeu-c', 'jeu')];
  const values = [0, 0.5, 0]; // le menu, puis « jeu-b » au premier niveau, puis « jeu-a » en fin de piste
  let n = 0;
  const s = setup({ list, random: () => values[n++] ?? 0 });
  await s.on();
  s.radio.play('rond-point');
  assert.equal(s.radio.current.id, 'jeu-b');
  s.ready();
  s.playing();
  s.emit('FINISH');
  assert.equal(s.radio.current.id, 'jeu-a');
  s.ready();
  s.playing();
  s.radio.play('boss');
  s.ready();
  s.playing();
  s.radio.play('menu');
  s.ready();
  s.playing();
  s.radio.play('rond-point');
  assert.equal(s.radio.current.id, 'jeu-c', 'la seule qui reste dans le sac');
  s.emit('ERROR'); // chiffrée, sans module de lecture : elle échoue
  assert.ok(s.radio.failed.has('jeu-c'));
  assert.equal(s.radio.current.id, 'jeu-b', 'pas « jeu-a », qu’on vient d’entendre');
});

test('la dernière piste du tour échoue : celle qu’on vient d’entendre ne revient pas avant que les autres soient passées', async () => {
  // Relecture : le tour suivant repartait de la piste de secours seule, et la précédente revenait juste après elle.
  const list = [...tracks, T('jeu-c', 'jeu'), T('jeu-d', 'jeu')];
  const values = [0, 0, 0, 0.5, 0]; // le menu, puis « jeu-a », « jeu-b », « jeu-d », et « jeu-c » en dernier
  let n = 0;
  const s = setup({ list, random: () => values[n++] ?? 0.999 });
  await s.on();
  s.radio.play('rond-point');
  const heard = [s.radio.current.id];
  s.ready();
  s.playing();
  for (let i = 0; i < 2; i++) {
    s.emit('FINISH');
    heard.push(s.radio.current.id);
    s.ready();
    s.playing();
  }
  s.emit('FINISH');
  heard.push(s.radio.current.id);
  assert.deepEqual(heard, ['jeu-a', 'jeu-b', 'jeu-d', 'jeu-c']);
  s.emit('ERROR'); // « jeu-c », la dernière du tour, ne joue pas
  s.ready();
  const next = [s.radio.current.id];
  s.ready();
  s.playing();
  s.emit('FINISH');
  next.push(s.radio.current.id);
  assert.ok(!next.includes('jeu-d'), `« jeu-d », la dernière entendue, revient trop tôt : ${next.join(', ')}`);
  assert.deepEqual([...next].sort(), ['jeu-a', 'jeu-b']);
});

test('un nouveau tour ne commence ni par la dernière piste entendue, ni par la dernière du sac partagé', async () => {
  // Relecture, graine 167 : « sketogan », deux pistes à elles (Soir du 49-3, Millevaches), la dernière du tour échoue
  // au Rond-point, et « sketogan » revenait aussitôt : la dernière entendue était une piste d'un autre niveau.
  const values = [0, 0, 0, 0, 0]; // le menu, « jeu-a », « jeu-b », la piste du Soir, « jeu-c »
  let n = 0;
  const list = [...tracks, T('jeu-c', 'jeu'), T('propre-soir', 'soir-du-49-3')];
  const s = setup({ list, random: () => values[n++] ?? 0.999 });
  await s.on();
  s.radio.play('rond-point');
  s.ready();
  s.playing();
  s.emit('FINISH');
  s.ready();
  s.playing();
  s.radio.play('soir-du-49-3'); // sa piste à lui
  s.ready();
  s.playing();
  s.radio.play('rond-point');
  assert.deepEqual(s.widget.loads.map((u) => u.split('/').pop()), ['jeu-a', 'jeu-b', 'propre-soir', 'jeu-c']);
  s.emit('ERROR'); // « jeu-c », la dernière du tour, ne joue pas
  assert.notEqual(s.radio.current.id, 'jeu-b', '« jeu-b », la dernière du sac entendue, revient aussitôt');
  assert.equal(s.radio.current.id, 'jeu-a');
  // Le tour finit sur une piste à lui du niveau : la dernière du sac partagé attend aussi.
  const steps = [0, 0, 0.34, 0.5, 0]; // le menu, « propre-1 », « jeu-a », « jeu-b », « propre-2 »
  let m = 0;
  const own = [...tracks, T('propre-1', 'millevaches'), T('propre-2', 'millevaches')];
  const o = setup({ list: own, random: () => steps[m++] ?? 0.999 });
  await o.on();
  o.radio.play('millevaches');
  const heard = [o.radio.current.id];
  o.ready();
  o.playing();
  for (let i = 0; i < 4; i++) {
    o.emit('FINISH');
    heard.push(o.radio.current.id);
    o.ready();
    o.playing();
  }
  assert.deepEqual(heard.slice(0, 4), ['propre-1', 'jeu-a', 'jeu-b', 'propre-2']);
  assert.notEqual(heard[4], 'jeu-b', `« jeu-b » revient en tête du tour suivant : ${heard.join(', ')}`);
});

// ---------------------------------------------------------------------- « Suivant »
// Valentin, 17 novembre 2026 : « autorise à faire suivant dans la radio manif, par exemple depuis le menu de pause ».

test('« Suivant » en niveau : au hasard parmi les pistes du niveau, jamais celle en cours', async () => {
  // Valentin, 17 novembre 2026 : « Keep that and randomize the "Next" button ».
  const jeu = real.filter((t) => t.ou === 'jeu').map((t) => t.id);
  const s = setup({ list: real, random: seeded(5) });
  await s.on();
  s.radio.play('rond-point');
  s.ready();
  s.playing();
  const drawn = new Map();
  let repeats = 0;
  const seen = new Set([s.radio.current.id]);
  for (let i = 0; i < 600; i++) {
    const before = s.radio.current;
    s.radio.next();
    assert.notEqual(s.radio.current, before, 'jamais la piste en cours');
    assert.ok(jeu.includes(s.radio.current.id), s.radio.current.id);
    if (i < jeu.length && seen.has(s.radio.current.id)) repeats++; // un sac n'en redonnerait aucune avant la fin du tour
    seen.add(s.radio.current.id);
    drawn.set(s.radio.current.id, (drawn.get(s.radio.current.id) || 0) + 1);
    s.ready();
    s.playing();
  }
  assert.equal(drawn.size, jeu.length, 'toutes les pistes du niveau sortent');
  assert.ok(repeats > 0, 'un vrai tirage au hasard, pas le sac');
  for (const id of jeu) assert.ok(drawn.get(id) > 600 / jeu.length / 3, `${id} : ${drawn.get(id)}`);
});

test('« Suivant » au boss et au menu : un autre tirage ; passer Monarch saute Ryukken', async () => {
  const monarch = bundle.musiques['abattez-la-citadelle'];
  const ryukken = bundle.musiques['abattez-la-citadelle-ryukken'];
  const s = setup({ list: real, random: seeded(3) });
  await s.on();
  for (let i = 0; i < 30; i++) {
    const before = s.radio.current;
    s.radio.next();
    assert.notEqual(s.radio.current, before);
    assert.equal(s.radio.current.ou, 'menu');
    s.ready();
    s.playing();
  }
  s.radio.play('boss');
  s.ready();
  s.playing();
  let monarchs = 0;
  for (let i = 0; i < 200; i++) {
    const before = s.radio.current;
    s.radio.next();
    assert.notEqual(s.radio.current, before);
    assert.equal(s.radio.current.ou, 'boss');
    assert.notEqual(s.radio.current, ryukken, 'Ryukken ne vient qu’après Monarch, jamais par « Suivant »');
    if (before === monarch) monarchs++;
    s.ready();
    s.playing();
  }
  assert.ok(monarchs > 0, 'Monarch a été passée');
  // Monarch finie, Ryukken suit ; « Suivant » sur Ryukken : une autre piste du boss.
  while (s.radio.current !== monarch) {
    s.radio.next();
    s.ready();
    s.playing();
  }
  s.emit('FINISH');
  assert.equal(s.radio.current, ryukken);
  s.ready();
  s.playing();
  s.radio.next();
  assert.notEqual(s.radio.current, ryukken);
  assert.equal(s.radio.current.ou, 'boss');
});

test('« Suivant » sur Ryukken : ni Ryukken, ni Monarch qui la ramènerait trente secondes plus tard', async () => {
  // Relecture : Monarch pouvait sortir du tirage, et à sa fin, Ryukken revenait.
  const monarch = bundle.musiques['abattez-la-citadelle'];
  const ryukken = bundle.musiques['abattez-la-citadelle-ryukken'];
  const s = setup({ list: real, random: seeded(21) });
  await s.on();
  s.radio.play('boss');
  for (let i = 0; i < 200; i++) {
    while (s.radio.current !== monarch) s.radio.next();
    s.ready(); // le premier chargement rappelle, Monarch se charge
    s.ready();
    s.playing();
    s.emit('FINISH'); // l'extrait de Monarch fini, Ryukken suit
    assert.equal(s.radio.current, ryukken);
    s.ready();
    s.playing();
    s.radio.next();
    assert.ok(s.radio.current !== monarch && s.radio.current !== ryukken, `essai ${i} : ${s.radio.current.id}`);
    s.ready();
    s.playing();
  }
});

test('« Suivant » pendant un chargement : pas de second chargement, la piste demandée se charge au rappel', async () => {
  const s = setup({ list: [...tracks, T('jeu-c', 'jeu')] });
  await s.on();
  s.radio.play('rond-point'); // « jeu-a », en chargement
  s.radio.next(); // « jeu-b »
  s.radio.next(); // trois appuis rapides : « jeu-a » ou « jeu-c », jamais « jeu-b »
  s.radio.env.random = () => 0.99;
  s.radio.next();
  assert.equal(s.radio.current.id, 'jeu-c');
  assert.equal(s.widget.loads.length, 1, 'pas de load() avant le rappel du premier');
  s.ready();
  assert.equal(s.widget.loads.length, 2);
  assert.equal(s.lastUrl(), s.radio.current.url);
  s.ready();
  s.playing();
  assert.equal(s.radio.status, 'playing');
  assert.equal(s.radio.failed.size, 0);
});

test('« Suivant », musique coupée ou refusée : le bouton est masqué et rien ne se charge ; en pause, il relance', async () => {
  const s = setup();
  await s.on();
  assert.equal(s.shown.skip, true);
  s.radio.setEnabled(false);
  assert.equal(s.shown.skip, false);
  s.radio.next();
  assert.equal(s.widget.loads.length, 0);
  assert.equal(s.widget.plays, 0);
  // Refusée par le navigateur : le bouton de relance, pas « Suivant ».
  const b = setup({ activated: false });
  await b.on();
  b.radio.play('rond-point');
  b.ready();
  b.advance(START_TIMEOUT);
  assert.equal(b.radio.status, 'blocked');
  assert.equal(b.shown.skip, false);
  b.radio.next();
  assert.equal(b.widget.loads.length, 1);
  // Mise en pause par le joueur (le bouton du lecteur) : « Suivant » lance la suivante.
  const p = setup();
  await p.on();
  p.emit('PAUSE');
  assert.equal(p.radio.status, 'paused');
  assert.equal(p.shown.skip, true);
  p.radio.next();
  assert.equal(p.radio.status, 'loading');
  assert.equal(p.radio.current.id, 'menu-b');
});

// ---------------------------------------------------------------------- lecture automatique et ⏸
// Valentin, 17 novembre 2026 : « En arrivant sur le jeu il faut que je clique "Relancer la musique" alors que
// j'aimerais bien que ce soit auto play by default […] Left to the "Next" button, add a Pause button ».

test('lecture automatique : refusée faute de geste, pas de « Relancer » à toucher ; le premier geste, n’importe où, la lance', async () => {
  const s = setup({ activated: false });
  s.radio.setEnabled(true); // dès le chargement
  await s.flush();
  s.advance(START_TIMEOUT); // le navigateur n'a rien lancé
  assert.equal(s.radio.status, 'blocked');
  assert.equal(s.shown.status, 'blocked');
  assert.equal(s.shown.pause, true, 'le bouton de lecture est là…');
  assert.equal(s.shown.held, true, '… et montre ▶ : rien ne joue encore');
  s.activated = true; // un toucher, un clic ou une touche, ailleurs que sur la radio
  s.radio.unblock();
  assert.equal(s.widget.plays, 1);
  s.playing();
  assert.equal(s.radio.status, 'playing');
  // Refusée encore après un geste (Safari, à chaque nouvelle piste) : le geste suivant la lance aussi.
  s.radio.play('rond-point');
  s.ready();
  s.emit('PAUSE');
  s.emit('PAUSE');
  assert.equal(s.radio.status, 'blocked');
  s.radio.unblock();
  assert.equal(s.widget.plays, 3);
});

test('le premier geste pendant un chargement passe au lecteur', async () => {
  const s = setup({ activated: false });
  await s.on();
  s.radio.play('rond-point');
  s.ready(); // chargée, pas encore partie
  const plays = s.widget.plays;
  s.activated = true;
  s.radio.unblock();
  assert.equal(s.widget.plays, plays + 1);
});

test('⏸ tient : ni un niveau, ni le boss, ni « Recommencer », ni le menu ne relancent la musique ; ▶ la remet', async () => {
  const list = [...tracks, T('propre-a', 'rond-point')];
  const s = setup({ list });
  await s.on();
  s.radio.play('rond-point');
  s.ready();
  s.playing();
  assert.equal(s.shown.held, false);
  s.radio.togglePause();
  assert.equal(s.radio.status, 'paused');
  assert.equal(s.shown.held, true);
  const loads = s.widget.loads.length;
  const plays = s.widget.plays;
  s.radio.play('boss');
  s.radio.play('rond-point', null, { restart: true });
  s.radio.play('raffinerie');
  s.radio.play('menu');
  s.radio.unblock(); // des gestes, en jouant
  s.radio.setHidden(true);
  s.radio.setHidden(false);
  s.advance(LOAD_TIMEOUT * 2);
  assert.equal(s.widget.loads.length, loads, 'aucune piste chargée');
  assert.equal(s.widget.plays, plays, 'rien relancé');
  assert.equal(s.radio.status, 'paused');
  s.radio.togglePause(); // ▶ : la musique du moment (le menu), sa piste par défaut
  assert.equal(s.radio.current.id, 'menu-a');
  assert.equal(s.radio.status, 'loading');
  s.ready();
  s.playing();
  assert.equal(s.radio.status, 'playing');
  // ⏸ puis ▶ au même moment : la même piste reprend, sans recharger.
  s.radio.togglePause();
  const again = s.widget.loads.length;
  s.radio.togglePause();
  assert.equal(s.widget.loads.length, again);
  assert.equal(s.radio.current.id, 'menu-a');
  // Après ⏸ au menu, l'entrée dans un niveau garde sa piste à lui quand on remet la musique.
  s.playing();
  s.radio.togglePause();
  s.radio.play('rond-point');
  s.radio.togglePause();
  assert.equal(s.radio.current.id, 'propre-a');
});

test('⏸ pendant un chargement : la piste chargée ne part pas ; refusée, le bouton montre ▶ et un toucher la lance', async () => {
  const s = setup();
  await s.on();
  s.radio.play('rond-point');
  s.radio.togglePause();
  const pauses = s.widget.pauses;
  s.ready();
  assert.equal(s.widget.pauses, pauses + 1);
  assert.equal(s.radio.status, 'paused');
  const b = setup({ activated: false });
  b.radio.setEnabled(true);
  await b.flush();
  b.advance(START_TIMEOUT);
  assert.equal(b.radio.status, 'blocked');
  assert.equal(b.shown.held, true, '▶, pas ⏸');
  b.activated = true;
  b.radio.togglePause(); // le premier geste : ▶ (main.js laisse ce toucher au bouton)
  assert.equal(b.widget.plays, 1);
  assert.equal(b.radio.status, 'loading');
  assert.equal(b.radio.held, false);
});

test('⏭ en pause : la suivante joue ; couper puis remettre la musique dans les options lève la pause', async () => {
  const s = setup();
  await s.on();
  s.radio.togglePause();
  s.radio.next();
  assert.equal(s.radio.held, false);
  assert.equal(s.radio.status, 'loading');
  s.ready();
  s.playing();
  s.radio.togglePause();
  s.radio.setEnabled(false);
  s.radio.setEnabled(true);
  assert.equal(s.radio.held, false);
  assert.notEqual(s.radio.status, 'paused');
});

test('un toucher arrivé avant que le lecteur soit prêt n’est pas perdu ; refusé hors du geste, le suivant la lance', async () => {
  // Relecture : un toucher à 50 ms, avant READY, ne faisait rien ; puis « Relancer » réapparaissait.
  let resolve;
  const s = setup({ activated: false, connect: 'plus-tard' });
  s.radio.env.connect = (track, onEvent) => { s.connects.push(track.id); s.radio.__emit = onEvent; return new Promise((r) => { resolve = r; }); };
  s.emit = (n, d) => s.radio.__emit(n, d);
  s.radio.setEnabled(true);
  s.activated = true;
  s.radio.unblock(); // le premier toucher, à 50 ms
  assert.equal(s.widget.plays, 0);
  resolve(s.widget);
  await s.flush();
  assert.equal(s.widget.plays, 1, 'le lecteur prêt, le toucher lui est transmis');
  // Safari refuse cette lecture hors du geste : on attend, sans « Relancer ».
  s.emit('PAUSE');
  s.emit('PAUSE');
  assert.equal(s.radio.status, 'blocked');
  assert.equal(s.shown.held, true, '▶');
  s.radio.unblock(); // le toucher suivant
  assert.equal(s.widget.plays, 3);
  s.emit('PLAY_PROGRESS', { currentPosition: 300 });
  assert.equal(s.radio.status, 'playing');
});

test('▶ après un niveau : le son dans le même geste ; sur Safari, la piste chargée continue, ailleurs la musique du moment', async () => {
  const list = [...tracks, T('propre-a', 'rond-point')];
  // Chrome : la piste du moment se charge aussitôt (ce navigateur lance une piste chargée après un premier geste).
  const c = setup({ list });
  await c.on();
  c.radio.togglePause();
  c.radio.play('rond-point');
  c.radio.togglePause();
  assert.equal(c.radio.current.id, 'propre-a');
  // Safari : une piste chargée hors d'un geste a déjà été refusée ; ▶ reprend la piste chargée, dans le geste.
  const s = setup({ list });
  await s.on();
  s.radio.play('raffinerie');
  s.ready();
  s.emit('PAUSE'); // refusée après un premier geste
  assert.equal(s.radio.lazy, true);
  s.radio.unblock();
  s.playing();
  const playing = s.radio.current;
  s.radio.togglePause();
  s.radio.play('boss');
  s.radio.play('rond-point');
  const loads = s.widget.loads.length;
  const plays = s.widget.plays;
  s.radio.togglePause(); // ▶
  assert.equal(s.widget.plays, plays + 1, 'widget.play() dans le geste');
  assert.equal(s.widget.loads.length, loads, 'rien à charger');
  assert.equal(s.radio.current, playing);
  s.playing();
  assert.equal(s.radio.status, 'playing');
  s.emit('FINISH'); // à sa fin, la musique du moment
  assert.equal(s.radio.current.ou === 'jeu' || s.radio.current.ou === 'rond-point', true, s.radio.current.id);
});

test('⏸ puis le bouton lecture du lecteur SoundCloud : la pause est levée ; un reste de chargement ne la lève pas', async () => {
  const s = setup();
  await s.on();
  s.radio.togglePause();
  s.emit('PLAY'); // la piste qui se chargeait part, avant que notre pause soit confirmée
  assert.equal(s.radio.held, true);
  s.emit('PAUSE'); // notre pause, confirmée
  s.playing(); // le dernier « ça avance », parti avant la pause
  assert.equal(s.radio.held, true);
  s.emit('PLAY'); // le joueur, au bouton du lecteur
  assert.equal(s.radio.held, false);
  s.playing();
  assert.equal(s.radio.status, 'playing');
  s.radio.play('rond-point'); // la pause levée, un niveau change la musique comme d'habitude
  assert.equal(s.radio.current.ou, 'jeu');
});

test('« Gabber au boss, Internationale en niveau »', () => {
  // Valentin, 16 novembre 2026.
  const gabber = bundle.musiques['jeunesse-emmerde-le-fn-gabber'];
  const drill = bundle.musiques['internationale-jersey-drill'];
  assert.equal(gabber.ou, 'boss');
  assert.equal(drill.ou, 'jeu');
  const random = seeded(17);
  const boss = new Set();
  for (let i = 0; i < 1000; i++) boss.add(chooseTrack(real, { slot: 'boss', random }).id);
  assert.ok(boss.has(gabber.id), 'le gabber est tiré au boss, parmi les autres');
  assert.ok(!boss.has(drill.id), 'l’Internationale jersey drill n’est plus au boss');
  assert.ok(boss.has('abattez-la-citadelle') && !boss.has('abattez-la-citadelle-ryukken'), 'Ryukken ne vient qu’après Monarch');
  const level = new Set();
  for (let i = 0; i < 400; i++) level.add(nextLevelTrack(real, { slot: 'rond-point', random }).id);
  assert.ok(level.has(drill.id) && !level.has(gabber.id), 'en niveau : l’Internationale, pas le gabber');
});
