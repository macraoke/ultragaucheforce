// La mesure d'audience : rien sans clé ni en développement ; avec une clé, le script officiel de PostHog,
// réglé pour ne rien écrire sur l'appareil, ne créer aucun profil et ne capturer ni clic ni saisie.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { measure, measuring, runStarted, runEnded, heroRescued } from '../src/client/mesure.js';
import { play, flat, run as steps } from './sim/helpers.js';
import { build, measureSnippet } from '../tools/build.mjs';

const ROOT = new URL('../', import.meta.url);
const source = (path) => readFileSync(new URL(path, ROOT), 'utf8');

test('mesure : sans PostHog sur la page, rien ne part et rien ne casse', () => {
  assert.equal(measuring(), false);
  measure('game_started', { level: 'essai' });
  const sent = [];
  globalThis.posthog = { capture: (...args) => sent.push(args) };
  try {
    assert.equal(measuring(), true);
    measure('game_ended', { level: 'essai', outcome: 'won', seconds: 12 });
    globalThis.posthog.capture = () => { throw new Error('script en panne'); };
    measure('game_ready'); // une panne de la mesure ne remonte jamais dans le jeu
  } finally {
    delete globalThis.posthog;
  }
  assert.deepEqual(sent, [['game_ended', { level: 'essai', outcome: 'won', seconds: 12 }, undefined]]);
});

test('mesure : aucune dépendance, et le serveur de développement ne charge rien de PostHog', () => {
  const pkg = JSON.parse(source('package.json'));
  assert.equal(pkg.dependencies, undefined, 'zéro dépendance');
  assert.ok(!readdirSync(ROOT).includes('package-lock.json'));
  assert.ok(!/posthog/i.test(source('index.html')), 'la page du dépôt (celle de npm start) ne parle pas de PostHog');
  assert.ok(!/posthog/i.test(source('tools/dev.mjs')));
  for (const banned of ['localStorage', 'sessionStorage', 'document.cookie', 'indexedDB', 'identify']) {
    assert.ok(!source('src/client/mesure.js').replace(/\/\/.*$/gm, '').includes(banned), banned);
  }
});

test('mesure : sans clé, rien ; une clé mal formée arrête le build', () => {
  assert.equal(measureSnippet({}), '');
  assert.equal(measureSnippet({ token: '  ' }), '');
  assert.throws(() => measureSnippet({ token: "phc_x'</script>" }), /phc_/);
  assert.throws(() => measureSnippet({ token: 'phc_abc', host: 'http://eu.i.posthog.com' }), /https/);
});

test('mesure : avec une clé, le chargeur officiel, réglé au plus anonyme', () => {
  const snippet = measureSnippet({ token: 'phc_essai123' });
  assert.match(snippet, /^<script>\n[\s\S]*<\/script>$/);
  assert.ok(!/^\s*\/\//m.test(snippet), 'les commentaires du modèle restent dans le dépôt');
  assert.match(snippet, /init\("phc_essai123", \{/);
  assert.match(snippet, /api_host: "https:\/\/eu\.i\.posthog\.com"/, 'l’hôte européen par défaut');
  assert.match(snippet, /-assets\.i\.posthog\.com"\)\+"\/static\/array\.js"/, 'le script officiel, depuis l’hôte de PostHog');
  assert.match(snippet, /localhost\|127/, 'jamais en local');
  for (const setting of ["cookieless_mode: 'always'", "persistence: 'memory'", "person_profiles: 'never'", 'autocapture: false', 'disable_session_recording: true',
    'capture_exceptions: true', 'capture_heatmaps: false', 'capture_dead_clicks: false', 'rageclick: false', 'mask_all_text: true', 'before_send: clean']) {
    assert.ok(snippet.includes(setting), setting);
  }
  assert.ok(!snippet.includes('identify('), 'pas d’identify');
});

test('mesure : le filtre avant envoi retire les paramètres des adresses et ce qui distingue un appareil', () => {
  const window = {};
  const run = new Function('window', 'location', 'document', measureSnippet({ token: 'phc_essai123' }).replace(/<\/?script>/g, ''));
  const document = { createElement: () => ({}), getElementsByTagName: () => [{ parentNode: { insertBefore() {} } }] };
  run(window, { hostname: 'ultragaucheforce.github.io' }, document);
  const [[token, config]] = window.posthog._i;
  assert.equal(token, 'phc_essai123');
  const event = config.before_send({
    event: '$pageview', $set: { a: 1 },
    properties: { $current_url: 'https://ultragaucheforce.github.io/?debug&fbclid=x#a', $referrer: 'https://t.co/abc?s=1', $raw_user_agent: 'Mozilla', $host: 'ultragaucheforce.github.io', $timezone: 'Europe/Paris', $screen_width: 390, $browser: 'Chrome', level: 'bismillah',
      fbclid: 'abc', utm_source: null, $session_entry_fbclid: 'abc', $session_entry_url: 'https://ultragaucheforce.github.io/?x=1', $initial_utm_source: 'a' },
  });
  assert.deepEqual(event.properties, {
    $current_url: 'https://ultragaucheforce.github.io/', $referrer: 'https://t.co/abc', $browser: 'Chrome', level: 'bismillah',
    // le hachage du mode sans cookie en a besoin ; PostHog retire l'agent utilisateur brut après le calcul
    $raw_user_agent: 'Mozilla', $host: 'ultragaucheforce.github.io', $timezone: 'Europe/Paris',
    $session_entry_url: 'https://ultragaucheforce.github.io/',
    $geoip_disable: true, $process_person_profile: false,
  });
  assert.equal(event.$set, undefined);

  // Une erreur dans un script de la page : l'adresse est aussi dans la pile d'appels et dans le message.
  const error = config.before_send({
    event: '$exception',
    properties: { $exception_list: [{
      type: 'Error', value: 'échec à https://ultragaucheforce.github.io/?fbclid=x#a ligne 3',
      stacktrace: { frames: [{ filename: 'https://ultragaucheforce.github.io/?fbclid=x#a', lineno: 3 }, { filename: 'https://ultragaucheforce.github.io/src/client/main.js', lineno: 9 }] },
    }] },
  });
  const [exception] = error.properties.$exception_list;
  assert.equal(exception.value, 'échec à https://ultragaucheforce.github.io/ ligne 3');
  assert.deepEqual(exception.stacktrace.frames.map((f) => f.filename),
    ['https://ultragaucheforce.github.io/', 'https://ultragaucheforce.github.io/src/client/main.js']);
  assert.ok(!JSON.stringify(error).includes('fbclid'), 'aucun paramètre, à aucune profondeur');

  const local = {};
  run(local, { hostname: 'localhost' }, document);
  assert.equal(local.posthog, undefined, 'en local, rien');
});

test('mesure : le build l’ajoute à la page avec une clé, et le service worker ne la met pas en cache', (t) => {
  const plain = mkdtempSync(join(tmpdir(), 'ugf-build-'));
  const measured = mkdtempSync(join(tmpdir(), 'ugf-build-'));
  t.after(() => [plain, measured].forEach((dir) => rmSync(dir, { recursive: true, force: true })));
  const a = build(plain, {});
  const b = build(measured, { POSTHOG_PROJECT_TOKEN: 'phc_essai123', POSTHOG_HOST: 'https://eu.i.posthog.com' });
  const page = (dir) => readFileSync(join(dir, 'index.html'), 'utf8');
  assert.ok(!/posthog/i.test(page(plain)), 'sans clé, rien de PostHog dans la page');
  assert.ok(!page(plain).includes('mesure d’audience'), 'ni le repère');
  assert.match(page(measured), /window\.posthog\.init\("phc_essai123"/);
  const snippet = measureSnippet({ token: 'phc_essai123', host: 'https://eu.i.posthog.com' });
  assert.ok(page(measured).includes(snippet), 'le chargeur entre dans la page tel quel, sans motif de remplacement interprété');
  assert.doesNotThrow(() => new Function(snippet.replace(/<\/?script>/g, '')), 'du JavaScript valide');
  assert.notEqual(a.version, b.version, 'brancher la mesure change la version : le service worker sert la nouvelle page');
  const worker = readFileSync(join(measured, 'sw.js'), 'utf8');
  assert.ok(!/posthog/i.test(worker), 'aucun fichier de PostHog dans le précache');
  assert.match(worker, /!OWN\.has\(url\.href\)\) return/, 'seuls les fichiers du jeu passent par le cache (tests/sw.test.js)');
});

test('mesure : une partie qui commence, un camarade libéré, puis la victoire ou la défaite', () => {
  const sent = [];
  globalThis.posthog = { capture: (...args) => sent.push(args) };
  try {
    const game = play(flat({ width: 100 }));
    const run = runStarted({ level: 'bismillah', mode: 'campagne', hero: 'alpha', heroSource: 'choisi', input: 'clavier', again: false });
    heroRescued(run, 'beta');
    steps(game, 120, { right: true });
    runEnded(run, game, 'won');
    runEnded(run, game, 'lost');
    runEnded(run, null, 'abandoned', 'fermeture', { transport: 'sendBeacon' });
    runEnded(null, game, 'won'); // pas de partie mesurée : rien
    const width = game.world.w * 16;
    const progress = Math.round((100 * game.hero.x) / width);
    assert.ok(progress > 0 && progress < 100, `${progress} %`);
    assert.deepEqual(sent, [
      ['game_started', { level: 'bismillah', mode: 'campagne', hero: 'alpha', hero_source: 'choisi', input: 'clavier', again: false }, undefined],
      ['hero_rescued', { level: 'bismillah', mode: 'campagne', hero_from: 'alpha', hero_to: 'beta' }, undefined],
      ['game_ended', { level: 'bismillah', mode: 'campagne', hero: 'alpha', outcome: 'won', seconds: 2, crowd: game.crowd, lives: game.lives, progress }, undefined],
      ['game_ended', { level: 'bismillah', mode: 'campagne', hero: 'alpha', outcome: 'lost', seconds: 2, crowd: game.crowd, lives: game.lives, progress }, undefined],
      ['game_ended', { level: 'bismillah', mode: 'campagne', hero: 'alpha', outcome: 'abandoned', seconds: 0, via: 'fermeture' }, { transport: 'sendBeacon' }],
    ]);
  } finally {
    delete globalThis.posthog;
  }
});

test('mesure : le filtre avant envoi garde les propriétés des événements du jeu, rien d’autre', () => {
  const window = {};
  const run = new Function('window', 'location', 'document', measureSnippet({ token: 'phc_essai123' }).replace(/<\/?script>/g, ''));
  run(window, { hostname: 'ultragaucheforce.github.io' }, { createElement: () => ({}), getElementsByTagName: () => [{ parentNode: { insertBefore() {} } }] });
  const [[, config]] = window.posthog._i;
  const kept = { track: 'monarch', slot: 'niveau', level: 'bismillah', seconds: 43, percent: 26, volume: 30, cause: 'suivante', via: 'radio', reason: 'muette',
    mode: 'campagne', hero: 'alpha', hero_source: 'choisi', again: false, crowd: 120, lives: 2, progress: 64, hero_from: 'alpha', hero_to: 'beta' };
  const event = config.before_send({ event: 'music_skipped', properties: { ...kept, pseudo: 'x', texte: 'y' } });
  assert.deepEqual(event.properties, { ...kept, $geoip_disable: true, $process_person_profile: false });
});
