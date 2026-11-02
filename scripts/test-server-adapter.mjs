/* eslint n/no-unsupported-features/node-builtins: ["error", {"ignores": ["fs/promises.cp", "fetch", "Request"]}] */
// Runs a server-mode Vercel build's render function from a temporary directory
// outside the repo, the way Vercel runs it: anything the function forgot to
// bundle or trace fails here instead of on the first deploy.
//
// Usage: node scripts/test-server-adapter.mjs integration/astro6-server
// (after `yarn build:vercel` in that app).
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const appDir = resolve(process.argv[2] ?? 'integration/astro6-server');
const output = join(appDir, '.vercel/output');
const config = JSON.parse(await readFile(join(output, 'config.json'), 'utf8'));

assert.equal(config.version, 3);
await readFile(join(output, 'static/index.html'));
await readFile(join(output, 'static/iframe.html'));

const functionDir = join(output, 'functions/_render.func');
const { handler } = JSON.parse(await readFile(join(functionDir, '.vc-config.json'), 'utf8'));
const isolated = await mkdtemp(join(tmpdir(), 'storybook-server-adapter-'));
let server;

try {
  await cp(functionDir, isolated, { recursive: true, verbatimSymlinks: true });
  process.chdir(isolated);

  const { default: renderFunction } = await import(pathToFileURL(join(isolated, handler)).href);
  const request = await createRequester(renderFunction);
  const health = await request('/api');

  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'OK');

  const index = JSON.parse(await readFile(join(output, 'static/index.json'), 'utf8'));
  const render = async (body) => {
    const response = await request('/api/render', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slots: {}, ...body })
    });
    const html = await response.text();

    assert.equal(response.status, 200, html);

    return html;
  };

  // Astro 7's fixture renders a component with every framework renderer,
  // whose server files a trace can miss.
  const codeTabs = index.entries['astro-code-tabs--default'];

  if (codeTabs) {
    for (const framework of ['react', 'solid', 'preact', 'svelte', 'vue', 'alpine']) {
      const html = await render({
        component: await realComponentPath(codeTabs.componentPath),
        args: { framework },
        story: { id: codeTabs.id, title: codeTabs.title, name: codeTabs.name }
      });

      assert.ok(html.includes(`data-testid="${framework}-code-tabs"`), `${framework}: missing renderer output`);
    }
  }

  for (const [id, expected] of [
    ['astro-githubstars--default', '2413'],
    ['astro-githubstars--one-k', '1000'],
    // astro6-server mocks this one with a replacement path instead of a factory.
    ['astro-githubstars--hundred-k', '100,000'],
    ['astro-npmweeklydownloads--default', '4,011 weekly npm downloads']
  ]) {
    const story = index.entries[id];

    assert.ok(story, `Missing story ${id}`);

    const html = await render({
      component: await realComponentPath(story.componentPath),
      args: {
        repository: 'storybook-astro/storybook-astro',
        packageName: '@storybook-astro/framework',
        label: 'Custom adapter label'
      },
      story: { id, title: story.title, name: story.name }
    });

    assert.ok(html.includes(expected), `${id}: expected ${expected}, received ${html}`);
  }

  console.warn('Relocated Vercel function: health, story rules mocks and every renderer passed.');
} finally {
  server?.close();
  await rm(isolated, { recursive: true, force: true });
}

/**
 * `@astrojs/vercel` 10+ exports a web `{ fetch }` handler; 9 (Astro 5) exports
 * a Node `(req, res)` handler, served here the way Vercel's launcher would.
 */
async function createRequester(renderFunction) {
  if (typeof renderFunction.fetch === 'function') {
    return (path, init) => renderFunction.fetch(new Request(`https://storybook.test${path}`, init));
  }

  server = createServer(renderFunction);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const origin = `http://127.0.0.1:${server.address().port}`;

  return (path, init) => fetch(`${origin}${path}`, init);
}

/** The module id the preview sends: the component's real path, as Vite resolved it. */
function realComponentPath(componentPath) {
  return realpath(resolve(appDir, componentPath));
}
