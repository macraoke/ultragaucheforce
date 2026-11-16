// Service worker d'UltraGauche Force : rend le jeu et ses bruitages jouables hors-ligne.
//
// Ce fichier est un MODÈLE : `npm run build` le recopie dans `dist/sw.js` en remplaçant
// les deux lignes marquées « rempli par le build ». Il n'existe pas en développement.
//
// Règles :
// - tout le jeu est mis en cache d'un bloc, sous un nom versionné : jamais de mélange de versions ;
// - « cache d'abord » : une fois installé, le jeu ne dépend plus du réseau ;
// - une nouvelle version attend que le joueur l'accepte depuis le menu (jamais en pleine partie) ;
// - on ne touche à aucune requête vers un autre site (le lecteur SoundCloud passe tel quel).

const VERSION = '__VERSION__'; // rempli par le build : empreinte de tous les fichiers
const FILES = ['__FILES__']; // rempli par le build : chemins relatifs à précharger

const PREFIX = 'ugf-'; // le domaine peut être partagé : on ne gère que nos propres caches
const CACHE = PREFIX + VERSION;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(FILES.map(async (url) => {
      // « no-cache » : le navigateur demande au serveur si sa copie est à jour. Ce que la page vient
      // de recevoir revient sans être retéléchargé (304), et rien de périmé n'entre dans le cache.
      const response = await fetch(new Request(url, { cache: 'no-cache' }));
      if (!response.ok) throw new Error(`${url} : ${response.status}`);
      await cache.put(url, response);
    }));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith(PREFIX) && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      const page = await cache.match('index.html');
      if (page) return page;
    }
    return fetch(request);
  })());
});
