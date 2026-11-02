import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = await realpath(resolve(projectRoot, 'public'));
const options = { port: process.env.PORT || '4173', host: '0.0.0.0' };

for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index];
  // Compatible with preview launchers: this server never selects another port.
  if (argument === '--strictPort') continue;
  if (argument === '--help' || argument === '-h') {
    console.log('Uso: npm run dev -- [--port 4173] [--host 0.0.0.0]');
    process.exit(0);
  }
  const match = /^--(port|host)(?:=(.*))?$/.exec(argument);
  if (!match) throw new Error(`Argumento desconocido: ${argument}`);
  const value = match[2] ?? process.argv[++index];
  if (!value || value.startsWith('--')) throw new Error(`Falta el valor de --${match[1]}.`);
  options[match[1]] = value;
}

const port = Number(options.port);
if (!/^\d+$/.test(options.port) || !Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error('El puerto debe ser un entero entre 0 y 65535.');
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

function insideRoot(path) {
  const local = relative(publicRoot, path);
  return local === '' || (!isAbsolute(local) && local !== '..' && !local.startsWith(`..${sep}`));
}

function respond(request, response, code, message, extraHeaders = {}) {
  const body = `${message}\n`;
  response.writeHead(code, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  response.end(request.method === 'HEAD' ? undefined : body);
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    respond(request, response, 405, 'Método no permitido.', { Allow: 'GET, HEAD' });
    return;
  }
  let requestPath;
  try {
    // Decode before normalization, so encoded dot segments cannot escape public/.
    requestPath = decodeURIComponent((request.url || '/').split('?')[0]);
  } catch {
    respond(request, response, 400, 'Ruta inválida.');
    return;
  }
  if (!requestPath.startsWith('/') || requestPath.includes('\0') || requestPath.includes('\\')) {
    respond(request, response, 400, 'Ruta inválida.');
    return;
  }
  const candidate = resolve(publicRoot, `.${requestPath}`);
  if (!insideRoot(candidate)) {
    respond(request, response, 403, 'Acceso no permitido.');
    return;
  }
  try {
    let canonical = await realpath(candidate);
    if (!insideRoot(canonical)) {
      respond(request, response, 403, 'Acceso no permitido.');
      return;
    }
    let info = await stat(canonical);
    if (info.isDirectory()) {
      canonical = await realpath(resolve(canonical, 'index.html'));
      if (!insideRoot(canonical)) {
        respond(request, response, 403, 'Acceso no permitido.');
        return;
      }
      info = await stat(canonical);
    }
    if (!info.isFile()) {
      respond(request, response, 404, 'No encontrado.');
      return;
    }
    response.writeHead(200, {
      'Content-Type': types[extname(canonical).toLowerCase()] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    if (request.method === 'HEAD') {
      response.end();
      return;
    }
    const stream = createReadStream(canonical);
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    stream.pipe(response);
  } catch (error) {
    const code = error.code === 'EACCES' ? 403 : 404;
    respond(request, response, code, code === 403 ? 'Acceso no permitido.' : 'No encontrado.');
  }
});

server.on('error', (error) => {
  console.error(`No se pudo iniciar el servidor: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, options.host, () => {
  const actualPort = server.address().port;
  const host = options.host === '0.0.0.0' || options.host === '::' ? 'localhost' : options.host;
  const displayHost = host.includes(':') ? `[${host}]` : host;
  console.log(`HDM Telas: http://${displayHost}:${actualPort}`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
