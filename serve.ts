// Starlight Keep's local play server (Node 22, standard library only).
//
// `node serve.ts` serves game/ on http://localhost:8080 (or --port <n>), so
// the game can be played in a desktop browser with no build step. It only
// serves files from inside game/, sends the content types a browser game
// needs, and answers 403/404 for anything else. A development convenience,
// not a server for the internet.
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_ROOT = resolve(fileURLToPath(new URL('./game', import.meta.url)));

function portFromArgs(argv) {
  const at = argv.indexOf('--port');
  const wanted = at === -1 ? 8080 : Number(argv[at + 1]);
  return Number.isInteger(wanted) && wanted > 0 && wanted < 65536 ? wanted : 8080;
}

function contentTypeFor(file) {
  switch (extname(file).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.js': case '.mjs': return 'text/javascript; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.png': return 'image/png';
    case '.jpg': case '.jpeg': return 'image/jpeg';
    case '.gif': return 'image/gif';
    case '.webp': return 'image/webp';
    case '.svg': return 'image/svg+xml';
    case '.ico': return 'image/x-icon';
    case '.woff2': return 'font/woff2';
    case '.wasm': return 'application/wasm';
    case '.wav': return 'audio/wav';
    case '.mp3': return 'audio/mpeg';
    case '.ogg': return 'audio/ogg';
    case '.txt': return 'text/plain; charset=utf-8';
    default: return 'application/octet-stream';
  }
}

function resolveInsideGame(requestPath) {
  const cleaned = requestPath.endsWith('/') ? `${requestPath}index.html` : requestPath;
  const file = resolve(join(GAME_ROOT, normalize(cleaned)));
  if (file !== GAME_ROOT && !file.startsWith(GAME_ROOT + sep)) return null;
  return file;
}

const port = portFromArgs(process.argv.slice(2));

createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('bad request');
    return;
  }
  const file = resolveInsideGame(pathname);
  if (file === null) {
    response.writeHead(403).end('forbidden');
    return;
  }
  let size;
  try {
    const stats = statSync(file);
    if (!stats.isFile()) throw new Error('not a file');
    size = stats.size;
  } catch {
    response.writeHead(404).end('not found');
    return;
  }
  response.writeHead(200, {
    'content-type': contentTypeFor(file),
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`Starlight Keep is on http://localhost:${port}`);
});
