/* eslint n/no-unsupported-features/node-builtins: ["error", {"ignores": ["fs/promises.cp"]}] */
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ServerAdapter } from './index.ts';
import { packageServer } from './packageServer.ts';

/** A portable directory for any Node host: `node storybook-node/server.mjs`. */
export function node(): ServerAdapter {
  return {
    name: 'node',
    async adapt(build) {
      const output = resolve(build.projectDir, 'storybook-node');

      await rm(output, { recursive: true, force: true });
      await mkdir(output, { recursive: true });
      await cp(build.staticDir, resolve(output, 'static'), { recursive: true });
      await packageServer(build, output, ['@hono/node-server', 'hono']);
      await writeFile(
        resolve(output, 'server.mjs'),
        [
          "import { fileURLToPath } from 'node:url';",
          "import { Hono } from 'hono';",
          "import { serve } from '@hono/node-server';",
          "import { serveStatic } from '@hono/node-server/serve-static';",
          "import renderApp from './storybook-server/index.js';",
          'const app = new Hono();',
          `app.route(${JSON.stringify(build.basePath)}, renderApp);`,
          "app.use('/*', serveStatic({ root: fileURLToPath(new URL('./static/', import.meta.url)) }));",
          'export const server = serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000), hostname: process.env.HOST ?? "0.0.0.0" });',
          ''
        ].join('\n')
      );
    }
  };
}
