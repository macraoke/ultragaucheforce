// `npm start` : sert le jeu tel quel depuis le dépôt, sans étape de build.
// `/content.json` est reconstruit à chaque requête : modifier un fichier de `content/`
// puis recharger la page suffit. Les icônes sont dessinées à la volée, comme dans le build.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { loadContent, ROOT } from './content.mjs';
import { formatError } from '../src/content/rules.js';
import { makeIcons } from './png.mjs';

const PORT = Number(process.env.PORT) || 8080;
// Par défaut, seule cette machine peut se connecter. Pour tester sur un téléphone du même
// réseau : HOST=0.0.0.0 npm start
const HOST = process.env.HOST || '127.0.0.1';
const posthogConfig = JSON.stringify({ host: process.env.POSTHOG_HOST, token: process.env.POSTHOG_PROJECT_TOKEN });
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
};

let lastReport = '';

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const send = (status, type, body) => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  try {
    if (url.pathname === '/content.json') {
      const { bundle, errors } = loadContent();
      const report = errors.map(formatError).join('\n');
      if (report !== lastReport) console.log(report ? `\nContenu à corriger :\n${report}\n` : '\nContenu valide.\n');
      lastReport = report;
      return send(200, TYPES['.json'], JSON.stringify({ ...bundle, erreurs: errors }));
    }
    if (url.pathname.startsWith('/icons/')) {
      const icon = makeIcons(loadContent().bundle)[url.pathname.slice(1)];
      return icon ? send(200, TYPES['.png'], icon) : send(404, 'text/plain; charset=utf-8', 'Introuvable');
    }
    let path = normalize(decodeURIComponent(url.pathname));
    if (path.endsWith('/')) path += 'index.html';
    if (path.includes('..')) return send(403, 'text/plain', 'Interdit');
    let body = await readFile(join(ROOT, path));
    if (path === 'index.html') body = Buffer.from(body.toString().replace('window.__POSTHOG_CONFIG__ = null;', `window.__POSTHOG_CONFIG__ = ${posthogConfig};`));
    send(200, TYPES[extname(path)] || 'application/octet-stream', body);
  } catch {
    send(404, 'text/plain; charset=utf-8', 'Introuvable');
  }
}).listen(PORT, HOST, () => {
  console.log(`UltraGauche Force : http://localhost:${PORT}  (Galerie : http://localhost:${PORT}/galerie.html)`);
});
