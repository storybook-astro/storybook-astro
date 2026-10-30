/* eslint n/no-unsupported-features/node-builtins: ["error", {"ignores": ["fs/promises.cp"]}] */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ServerAdapter } from '@storybook-astro/framework/adapters';
import { createWorkerViteConfig } from './workerViteConfig.ts';

export type CloudflareAdapterOptions = {
  /** Worker name in your Cloudflare account. Defaults to `storybook`. */
  name?: string;
  /** Workers compatibility date. Defaults to `2026-07-01`. */
  compatibilityDate?: string;
};

/**
 * Packages server mode as one Cloudflare Worker: it serves the static
 * Storybook and renders Astro stories at `/api`. Deploy with
 * `wrangler deploy -c storybook-cloudflare/wrangler.jsonc`.
 */
export function cloudflare(options: CloudflareAdapterOptions = {}): ServerAdapter {
  return {
    name: 'cloudflare',
    compiledServer: {
      vite: createWorkerViteConfig()
    },
    async adapt(build) {
      const output = resolve(build.projectDir, 'storybook-cloudflare');

      await rm(output, { recursive: true, force: true });
      await mkdir(output, { recursive: true });
      await cp(build.staticDir, resolve(output, 'static'), { recursive: true });
      await cp(build.serverDir, resolve(output, 'server'), { recursive: true });
      await writeFile(
        resolve(output, 'wrangler.jsonc'),
        `${JSON.stringify(createWranglerConfig(options), null, 2)}\n`
      );
    }
  };
}

function createWranglerConfig(options: CloudflareAdapterOptions) {
  return {
    name: options.name ?? 'storybook',
    main: './server/index.js',
    compatibility_date: options.compatibilityDate ?? '2026-07-01',
    compatibility_flags: ['nodejs_compat'],
    // The framework already bundled the server; upload its files as they are.
    no_bundle: true,
    find_additional_modules: true,
    base_dir: './server',
    rules: [
      { type: 'ESModule', globs: ['**/*.js'] },
      { type: 'CompiledWasm', globs: ['**/*.wasm'] }
    ],
    assets: {
      directory: './static',
      run_worker_first: ['/api', '/api/*']
    }
  };
}
