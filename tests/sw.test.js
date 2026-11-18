// Le service worker, exécuté dans un faux navigateur : à la racine du domaine, il ne répond
// qu'aux fichiers du jeu et laisse passer le reste (une autre appli dans /macraoke/, d'autres sites).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const TEMPLATE = readFileSync(new URL('../tools/sw-template.js', import.meta.url), 'utf8');
const ORIGIN = 'https://ultragaucheforce.github.io';

function worker({ names = [] } = {}) {
  const listeners = {};
  const stored = new Map(['index.html', 'style.css', 'src/client/main.js'].map((p) => [`${ORIGIN}/${p}`, `cache:${p}`]));
  const deleted = [];
  const fetched = [];
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    registration: { scope: `${ORIGIN}/` },
    clients: { claim: async () => {} },
    addEventListener: (type, fn) => { listeners[type] = fn; },
  };
  const caches = {
    open: async () => ({ match: async (key) => stored.get(new URL(key, self.location).href) }),
    keys: async () => names,
    delete: async (name) => { deleted.push(name); return true; },
  };
  const fetch = async (request) => { fetched.push(request.url); return `réseau:${request.url}`; };
  const source = TEMPLATE
    .replace("'__VERSION__'", '"v2"')
    .replace("['__FILES__']", JSON.stringify(['index.html', 'style.css', 'src/client/main.js']));
  runInNewContext(source, { self, caches, fetch, URL });

  async function request(path, mode = 'no-cors', method = 'GET') {
    let answer;
    const url = path.includes('://') ? path : ORIGIN + path;
    listeners.fetch({ request: { url, mode, method }, respondWith: (p) => { answer = p; } });
    return answer ? await answer : undefined; // undefined : le navigateur va au réseau sans le service worker
  }
  async function activate() {
    let done;
    listeners.activate({ waitUntil: (p) => { done = p; } });
    await done;
  }
  return { request, activate, deleted, fetched };
}

test('service worker : il sert le jeu depuis son cache', async () => {
  const sw = worker();
  assert.equal(await sw.request('/', 'navigate'), 'cache:index.html');
  assert.equal(await sw.request('/?debug#a', 'navigate'), 'cache:index.html');
  assert.equal(await sw.request('/index.html', 'navigate'), 'cache:index.html');
  assert.equal(await sw.request('/style.css?v=1'), 'cache:style.css');
  assert.equal(await sw.request('/src/client/main.js'), 'cache:src/client/main.js');
});

test('service worker : il ne répond jamais pour la macraoké ni pour un autre site', async () => {
  const sw = worker();
  assert.equal(await sw.request('/macraoke/', 'navigate'), undefined);
  assert.equal(await sw.request('/macraoke/index.html', 'navigate'), undefined);
  assert.equal(await sw.request('/macraoke/assets/index-abc.js'), undefined);
  assert.equal(await sw.request('/page-inconnue', 'navigate'), undefined);
  assert.equal(await sw.request('https://w.soundcloud.com/player/'), undefined);
  assert.equal(await sw.request('/style.css', 'no-cors', 'POST'), undefined);
  assert.deepEqual(sw.fetched, []);
});

test('service worker : il ne supprime que ses propres anciens caches', async () => {
  const sw = worker({ names: ['ugf-v1', 'ugf-v2', 'macraoke-v1', 'workbox-precache-v2'] });
  await sw.activate();
  assert.deepEqual(sw.deleted, ['ugf-v1']);
});
