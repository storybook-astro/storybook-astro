/* eslint n/no-unsupported-features/node-builtins: ["error", {"ignores": ["fs/promises.cp"]}] */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ServerAdapter } from './index.ts';
import { packageServer } from './packageServer.ts';

export type VercelAdapterOptions = {
  /** Vercel Node.js runtime, such as `nodejs22.x`. Defaults to `nodejs24.x`. */
  runtime?: string;
  maxDuration?: number;
  memory?: number;
};

/** Emits Build Output API v3 directly. NF3 packages dependencies; no Vercel CLI build is needed. */
export function vercel(options: VercelAdapterOptions = {}): ServerAdapter {
  return {
    name: 'vercel',
    async adapt(build) {
      // Native dependencies are copied from the installed tree, not cross-compiled.
      if (process.platform !== 'linux' || !['x64', 'arm64'].includes(process.arch)) {
        throw new Error(
          'Build the Vercel adapter on Linux (x64 or arm64), using CI or a container.'
        );
      }
      const output = resolve(build.projectDir, '.vercel/output');
      const functionDir = resolve(output, 'functions/render.func');

      await rm(output, { recursive: true, force: true });
      await mkdir(functionDir, { recursive: true });
      await cp(build.staticDir, resolve(output, 'static'), { recursive: true });
      await packageServer(build, functionDir, ['@hono/node-server']);
      await writeFile(
        resolve(functionDir, 'handler.mjs'),
        [
          "import { getRequestListener } from '@hono/node-server';",
          "import app from './storybook-server/index.js';",
          'export default getRequestListener(app.fetch);',
          ''
        ].join('\n')
      );
      await writeFile(
        resolve(functionDir, '.vc-config.json'),
        JSON.stringify(
          {
            runtime: options.runtime ?? 'nodejs24.x',
            handler: 'handler.mjs',
            launcherType: 'Nodejs',
            architecture: process.arch === 'arm64' ? 'arm64' : 'x86_64',
            maxDuration: options.maxDuration ?? 60,
            ...(options.memory === undefined ? {} : { memory: options.memory })
          },
          null,
          2
        )
      );
      await writeFile(
        resolve(output, 'config.json'),
        JSON.stringify(
          {
            version: 3,
            routes: [{ src: '^/api(?:/.*)?$', dest: '/render' }, { handle: 'filesystem' }]
          },
          null,
          2
        )
      );
    }
  };
}
