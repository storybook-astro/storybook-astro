import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type astroCloudflare from '@astrojs/cloudflare';
import { importFromProject, type ServerAdapter } from '@storybook-astro/framework/adapters';
import type { AstroInlineConfig } from 'astro';

export type CloudflareAdapterOptions = NonNullable<Parameters<typeof astroCloudflare>[0]> & {
  /** Worker name, when the adapter writes the Wrangler config. Defaults to `storybook`. */
  name?: string;
};

/**
 * Deploys server mode to Cloudflare Workers: one Worker serves the Storybook
 * UI as static assets and renders Astro stories at `/api`. Built with
 * the project's `@astrojs/cloudflare`, so the Worker runs the compiled render app and never
 * starts Vite.
 */
export function cloudflare({ name = 'storybook', ...options }: CloudflareAdapterOptions = {}): ServerAdapter {
  return {
    name: 'cloudflare',
    async createAstroAdapter({ projectDir, appDir }) {
      const { default: createAdapter } = await importFromProject<{ default: typeof astroCloudflare }>(projectDir, '@astrojs/cloudflare');
      let configPath = options.configPath;

      // Without a Wrangler config of your own, write a minimal one: the render
      // runtime's HTML sanitizer needs Node.js APIs on Workers.
      if (!configPath) {
        configPath = resolve(appDir, 'wrangler.jsonc');
        // eslint-disable-next-line camelcase -- Wrangler's config key
        const wranglerConfig = { name, compatibility_flags: ['nodejs_compat'] };

        await writeFile(configPath, `${JSON.stringify(wranglerConfig, null, 2)}\n`);
      }

      return createAdapter({
        // Images are served as they are, instead of through a Cloudflare
        // Images binding the account may not have.
        imageService: 'passthrough',
        ...options,
        configPath
      });
    },
    // Stories never use sessions; without a driver, the adapter would add a
    // KV namespace binding that a deploy provisions in the account. Astro 6+
    // types only driver objects, but every supported Astro still accepts the
    // name of a built-in driver.
    astroConfig: { session: { driver: 'memory' } as unknown as AstroInlineConfig['session'] },
    nextSteps: [
      'Preview locally with: wrangler dev -c storybook-server/server/wrangler.json',
      'Deploy with: wrangler deploy -c storybook-server/server/wrangler.json'
    ].join('\n')
  };
}
