import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';

const port = 6019;
const builtStorybookServer = (await import(pathToFileURL(resolve('storybook-server/index.js')).href)).default;

const app = new Hono();

app.route('/api/storybook-astro', builtStorybookServer);
app.use('/*', serveStatic({ root: './storybook-static' }));
app.get('*', serveStatic({ root: './storybook-static', path: './index.html' }));

serve({ fetch: app.fetch, port }, () => {
  globalThis.console.warn(`Storybook Vercel preview ready at http://127.0.0.1:${port}`);
});
