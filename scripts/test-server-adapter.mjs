/* eslint n/no-unsupported-features/node-builtins: ["error", {"ignores": ["fs/promises.cp", "fetch"]}] */
// Exercise the actual packaged server from a temporary directory outside the repo.
// This catches missing runtime files that the workspace's node_modules would hide.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (process.argv[2] === '--child') {
  if (process.argv[3] === 'node') {
    const { server } = await import(pathToFileURL(resolve('server.mjs')).href);

    if (!server.listening) {
      await once(server, 'listening');
    }
    process.send({ port: server.address().port });
  } else {
    const handler = (await import(pathToFileURL(resolve('handler.mjs')).href)).default;
    const server = createServer(handler);

    server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
  }
} else {
  const appDir = resolve(process.argv[2] ?? 'integration/astro6-server');
  const target = process.argv[3] ?? 'vercel';
  const output = join(appDir, target === 'node' ? 'storybook-node' : '.vercel/output');

  if (target === 'vercel') {
    const config = JSON.parse(await readFile(join(output, 'config.json'), 'utf8'));

    assert.equal(config.version, 3);
    const functionConfig = JSON.parse(
      await readFile(join(output, 'functions/render.func/.vc-config.json'), 'utf8')
    );

    assert.equal(functionConfig.filePathMap, undefined);
  }
  await readFile(join(output, 'static/index.html'));
  await readFile(join(output, 'static/iframe.html'));
  const functionDir = target === 'node' ? output : join(output, 'functions/render.func');
  const isolated = await mkdtemp(join(tmpdir(), 'storybook-server-adapter-'));
  let child;
  let logs = '';

  try {
    await cp(functionDir, isolated, { recursive: true, verbatimSymlinks: true });
    child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--child', target], {
      cwd: isolated,
      env: { ...process.env, NODE_PATH: '', INIT_CWD: isolated, HOST: '127.0.0.1', PORT: '0' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc']
    });
    child.stdout.on('data', (data) => {
      logs += data;
    });
    child.stderr.on('data', (data) => {
      logs += data;
    });
    const ready = await Promise.race([
      once(child, 'message'),
      once(child, 'exit').then(([code]) => {
        throw new Error(`Packaged server exited (${code}): ${logs}`);
      })
    ]);
    const origin = `http://127.0.0.1:${ready[0].port}`;
    const health = await fetch(`${origin}/api`);

    assert.equal(health.status, 200);
    const index = JSON.parse(await readFile(join(output, 'static/index.json'), 'utf8'));

    // Run compiler fixtures before story-rule mocks invalidate the module graph.
    // Svelte currently loses its render context after that invalidation even
    // in the unpackaged server; that runtime issue is independent of tracing.
    // Astro 7's larger fixture exercises the compilers and server renderers
    // whose dynamic files a Node-only trace can otherwise miss.
    const codeTabs = index.entries['astro-code-tabs--default'];

    if (codeTabs) {
      for (const framework of ['react', 'solid', 'preact', 'svelte', 'vue', 'alpine']) {
        const response = await fetch(`${origin}/api/render`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            component: resolve(appDir, codeTabs.componentPath),
            args: { framework },
            slots: {}
          })
        });
        const html = await response.text();

        assert.equal(response.status, 200, `${framework}: ${html}`);
        assert.ok(
          html.includes(`data-framework="${framework}"`),
          `${framework}: missing rendered component`
        );
        assert.ok(
          html.includes(`data-testid="${framework}-code-tabs"`),
          `${framework}: missing renderer output`
        );
      }
    }

    for (const [id, expected] of [
      ['astro-githubstars--default', '2413'],
      ['astro-githubstars--one-k', '1000'],
      ['astro-npmweeklydownloads--default', 'Custom adapter label']
    ]) {
      const story = index.entries[id];

      assert.ok(story, `Missing story ${id}`);
      const response = await fetch(`${origin}/api/render`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          component: resolve(appDir, story.componentPath),
          args: {
            repository: 'storybook-astro/storybook-astro',
            packageName: '@storybook-astro/framework',
            label: 'Custom adapter label'
          },
          slots: {},
          story: { id, title: story.title, name: story.name }
        })
      });
      const html = await response.text();

      assert.equal(response.status, 200, html);
      assert.ok(html.includes(expected), `${id}: expected ${expected}, received ${html}`);
      assert.ok(!html.includes(isolated), 'HTML contains an absolute deployment path');
      if (id === 'astro-npmweeklydownloads--default') {
        assert.ok(
          html.includes('4,011 weekly npm downloads'),
          'User-owned MSW hook did not supply the expected fixture'
        );
      }
    }
    if (target === 'node') {
      assert.equal((await fetch(origin)).status, 200);
      assert.equal((await fetch(`${origin}/iframe.html`)).status, 200);
    }
    console.warn(
      `Relocated ${target} output: health, factory mocks, MSW hooks and changed args passed.`
    );
  } catch (error) {
    console.error(logs);
    throw error;
  } finally {
    if (child && child.exitCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    await rm(isolated, { recursive: true, force: true });
  }
}
