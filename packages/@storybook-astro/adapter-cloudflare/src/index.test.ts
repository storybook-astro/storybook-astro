import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { cloudflare } from './index.ts';

test('builds the render app with @astrojs/cloudflare', async () => {
  const appDir = await mkdtemp(join(tmpdir(), 'storybook-astro-app-'));
  const adapter = cloudflare();

  expect((await adapter.createAstroAdapter(appDir)).name).toBe('@astrojs/cloudflare');
  expect(adapter.nextSteps).toContain('wrangler deploy');
});

test('writes a Wrangler config with Node.js compatibility when the project has none', async () => {
  const appDir = await mkdtemp(join(tmpdir(), 'storybook-astro-app-'));

  await cloudflare({ name: 'my-storybook' }).createAstroAdapter(appDir);

  expect(JSON.parse(await readFile(join(appDir, 'wrangler.jsonc'), 'utf-8'))).toEqual({
    name: 'my-storybook',
    compatibility_flags: ['nodejs_compat']
  });
});
