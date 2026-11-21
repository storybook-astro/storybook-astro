/* eslint n/no-unsupported-features/node-builtins: ["error", {"ignores": ["fetch"]}] */
// Local preview of a Vercel or Netlify server-mode build, run from an app's
// directory: `node ../server-shared/serve-build.mjs <vercel|netlify> <port>`.
//
// Neither @astrojs/vercel nor @astrojs/netlify supports `astro preview`, so
// this routes like the platform does for this app: a static file when one
// exists, otherwise the render function the build produced, called the way
// the platform calls it. It doesn't emulate the rest of the platform
// (header rules, limits); `vercel dev` / `netlify serve` or a deploy do.
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';

const [platform, port = '3000'] = process.argv.slice(2);
const { staticDir, renderFunction } = await loadBuild(platform);
const app = new Hono();

app.use('*', serveStatic({ root: relative(process.cwd(), staticDir) }));
app.all('*', (context) => renderFunction(context.req.raw));

serve({ fetch: app.fetch, port: Number(port), hostname: '127.0.0.1' }, () => {
  console.warn(`${platform} build at http://127.0.0.1:${port}`);
});

async function loadBuild(platform) {
  if (platform === 'vercel') {
    const functionDir = resolve('.vercel/output/functions/_render.func');
    const { handler } = JSON.parse(await readFile(join(functionDir, '.vc-config.json'), 'utf8'));
    const { default: vercelFunction } = await import(pathToFileURL(join(functionDir, handler)).href);

    return {
      staticDir: resolve('.vercel/output/static'),
      renderFunction:
        typeof vercelFunction.fetch === 'function'
          ? (request) => vercelFunction.fetch(request)
          : await serveNodeHandler(vercelFunction)
    };
  }

  if (platform === 'netlify') {
    const { default: netlifyFunction } = await import(
      pathToFileURL(resolve('.netlify/v1/functions/ssr/ssr.mjs')).href
    );

    return {
      staticDir: resolve('storybook-server'),
      renderFunction: (request) => netlifyFunction(request, { ip: '127.0.0.1' })
    };
  }

  throw new Error(`Unknown platform "${platform}"; expected vercel or netlify.`);
}

/**
 * `@astrojs/vercel` 9 (Astro 5) exports a Node `(req, res)` handler instead
 * of a fetch handler; it runs on its own port, and requests are forwarded.
 */
async function serveNodeHandler(handler) {
  const functionServer = createServer(handler);

  functionServer.listen(0, '127.0.0.1');
  await once(functionServer, 'listening');

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
