/* eslint n/no-unsupported-features/node-builtins: ["error", {"ignores": ["Request", "Response", "Headers", "fetch", "stream.Readable.toWeb"]}] */
// Local preview of a Vercel or Netlify server-mode build, run from an app's
// directory: `node ../server-shared/serve-build.mjs <vercel|netlify> <port>`.
//
// It routes like the platform does for this app: a static file when one
// exists, otherwise the render function the build produced, called with a
// web Request exactly like the platform calls it. It doesn't emulate the
// rest of the platform (headers rules, regions, limits); deploy for that.
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

const [platform, port = '3000'] = process.argv.slice(2);
const { staticDir, handle } = await loadBuild(platform);

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const file = await findStaticFile(decodeURIComponent(url.pathname));

    if (file && (req.method === 'GET' || req.method === 'HEAD')) {
      res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' });
      createReadStream(file).pipe(res);

      return;
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const response = await handle(
      new Request(url, {
        method: req.method,
        headers: Object.entries(req.headers).flatMap(([name, value]) =>
          [value].flat().filter(Boolean).map((item) => [name, item])
        ),
        ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {})
      })
    );

    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end(String(error));
  }
});

server.listen(Number(port), '127.0.0.1', () => {
  console.warn(`${platform} build at http://127.0.0.1:${port}`);
});

async function loadBuild(platform) {
  if (platform === 'vercel') {
    const functionDir = resolve('.vercel/output/functions/_render.func');
    const { handler } = JSON.parse(await readFile(join(functionDir, '.vc-config.json'), 'utf8'));
    const { default: renderFunction } = await import(pathToFileURL(join(functionDir, handler)).href);

    const staticDir = resolve('.vercel/output/static');

    if (typeof renderFunction.fetch === 'function') {
      return { staticDir, handle: (request) => renderFunction.fetch(request) };
    }

    return { staticDir, handle: await serveNodeHandler(renderFunction) };
  }

  if (platform === 'netlify') {
    const { default: renderFunction } = await import(
      pathToFileURL(resolve('.netlify/v1/functions/ssr/ssr.mjs')).href
    );

    return {
      staticDir: resolve('storybook-server'),
      handle: (request) => renderFunction(request, { ip: '127.0.0.1' })
    };
  }

  throw new Error(`Unknown platform "${platform}"; expected vercel or netlify.`);
}

/**
 * `@astrojs/vercel` 9 (Astro 5) exports a Node `(req, res)` handler; it runs
 * on its own port, and requests are forwarded to it.
 */
async function serveNodeHandler(handler) {
  const functionServer = createServer(handler);

  await new Promise((resolve) => functionServer.listen(0, '127.0.0.1', resolve));

  const origin = `http://127.0.0.1:${functionServer.address().port}`;

  return (request) => {
    const url = new URL(request.url);

    return fetch(`${origin}${url.pathname}${url.search}`, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      duplex: 'half',
      redirect: 'manual'
    });
  };
}

async function findStaticFile(pathname) {
  const path = resolve(staticDir, `.${pathname}`);

  if (!path.startsWith(staticDir)) {
    return undefined;
  }

  for (const candidate of [path, join(path, 'index.html')]) {
    const stats = await stat(candidate).catch(() => undefined);

    if (stats?.isFile()) {
      return candidate;
    }
  }

  return undefined;
}

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
};
