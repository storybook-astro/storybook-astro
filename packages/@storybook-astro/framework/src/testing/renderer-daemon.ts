import { createServer as createHttpServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ViteDevServer } from 'vite';
import { createViteServer } from '../viteStorybookAstroMiddlewarePlugin.ts';
import { resolveTestingIntegrationsForRoot } from './integration-config.ts';
import { runWithWorkingDirectory } from './working-directory.ts';
import { ssrLoadModuleWithFsFallback } from '../lib/ssr-load-module-with-fs-fallback.ts';

const RENDER_PATH = '/render';

export const TESTING_RENDERER_DAEMON_URL_ENV = 'STORYBOOK_ASTRO_TESTING_RENDERER_DAEMON_URL';

type RenderPayload = {
  resolveFrom: string;
  component: string;
  args?: Record<string, unknown>;
  slots?: Record<string, unknown>;
};

type RenderHandler = (data: {
  component: string;
  args?: Record<string, unknown>;
  slots?: Record<string, unknown>;
}) => Promise<string>;

type RunningDaemon = {
  url: string;
  close: () => Promise<void>;
};

async function readJsonBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return null;
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as unknown;
}

function createBadRequest(message: string) {
  const error = new Error(message);

  (error as Error & { statusCode?: number }).statusCode = 400;

  return error;
}

function assertRenderPayload(payload: unknown): asserts payload is RenderPayload {
  if (!payload || typeof payload !== 'object') {
    throw createBadRequest('Invalid render payload.');
  }

  const record = payload as Record<string, unknown>;

  if (typeof record.resolveFrom !== 'string' || record.resolveFrom.length === 0) {
    throw createBadRequest('Missing render payload field: resolveFrom.');
  }

  if (typeof record.component !== 'string' || record.component.length === 0) {
    throw createBadRequest('Missing render payload field: component.');
  }

  if (
    'args' in record &&
    typeof record.args !== 'undefined' &&
    (typeof record.args !== 'object' || record.args === null || Array.isArray(record.args))
  ) {
    throw createBadRequest('Render payload field args must be an object when provided.');
  }

  if (
    'slots' in record &&
    typeof record.slots !== 'undefined' &&
    (typeof record.slots !== 'object' || record.slots === null || Array.isArray(record.slots))
  ) {
    throw createBadRequest('Render payload field slots must be an object when provided.');
  }
}

function getErrorStatusCode(error: unknown) {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    const statusCode = (error as { statusCode?: unknown }).statusCode;

    if (typeof statusCode === 'number' && Number.isInteger(statusCode) && statusCode >= 400) {
      return statusCode;
    }
  }

  return 500;
}

export async function startTestingRendererDaemon(): Promise<RunningDaemon> {
  // One daemon process serves all Vitest workers; cache is keyed by project root.
  const viteServerPromises = new Map<string, Promise<ViteDevServer>>();
  const renderHandlerPromises = new Map<string, Promise<RenderHandler>>();

  async function getViteServer(resolveFrom: string) {
    if (!viteServerPromises.has(resolveFrom)) {
      const integrations = resolveTestingIntegrationsForRoot(resolveFrom);

      viteServerPromises.set(
        resolveFrom,
        runWithWorkingDirectory(resolveFrom, () => createViteServer(integrations, resolveFrom))
      );
    }

    return viteServerPromises.get(resolveFrom)!;
  }

  async function getRenderHandler(resolveFrom: string) {
    if (!renderHandlerPromises.has(resolveFrom)) {
      renderHandlerPromises.set(resolveFrom, (async () => {
        const integrations = resolveTestingIntegrationsForRoot(resolveFrom);
        const viteServer = await getViteServer(resolveFrom);
        // In the workspace this file is src/testing/renderer-daemon.ts so
        // '../middleware.ts' resolves to src/middleware.ts (Vite handles .ts).
        // When compiled by tsup, this code lands in a dist/chunk-*.js file so
        // '../middleware.ts' would resolve to framework/middleware.ts which does
        // not exist; fall back to './middleware.js' (sibling in dist/).
        const middlewareSrcPath = fileURLToPath(new URL('../middleware.ts', import.meta.url));
        const middlewareModulePath = existsSync(middlewareSrcPath)
          ? middlewareSrcPath
          : fileURLToPath(new URL('./middleware.js', import.meta.url));
        const middleware = await runWithWorkingDirectory(resolveFrom, () =>
          viteServer.ssrLoadModule(middlewareModulePath, {
            fixStacktrace: true
          })
        );

        return middleware.handlerFactory(integrations, {
          loadModule: (id: string) =>
            ssrLoadModuleWithFsFallback(viteServer, id, {
              fixStacktrace: true
            })
        }) as Promise<RenderHandler>;
      })());
    }

    return renderHandlerPromises.get(resolveFrom)!;
  }

  const server = createHttpServer(async (request, response) => {
    // Allow cross-origin requests from browser-like test environments (e.g. happy-dom).
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    response.setHeader('Access-Control-Allow-Headers', 'content-type');

    if (request.method === 'OPTIONS') {
      response.statusCode = 204;
      response.end();

      return;
    }

    if (request.method !== 'POST' || request.url !== RENDER_PATH) {
      response.statusCode = 404;
      response.end();

      return;
    }

    try {
      const payload = await readJsonBody(request);

      assertRenderPayload(payload);

      const handler = await getRenderHandler(payload.resolveFrom);
      const html = await handler({
        component: payload.component,
        args: payload.args,
        slots: payload.slots
      });

      response.statusCode = 200;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ html }));
    } catch (error) {
      const statusCode = getErrorStatusCode(error);

      response.statusCode = statusCode;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        error: error instanceof Error ? error.message : String(error)
      }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Failed to start Storybook Astro testing renderer daemon.');
  }

  const url = `http://127.0.0.1:${address.port}${RENDER_PATH}`;

  return {
    url,
    close: async () => {
      await Promise.all(
        [...viteServerPromises.values()].map(async (viteServerPromise) => {
          const viteServer = await viteServerPromise;

          await viteServer.close();
        })
      );

      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);

            return;
          }

          resolve();
        });
      });
    }
  };
}

export function getTestingRendererDaemonUrl() {
  const value = process.env[TESTING_RENDERER_DAEMON_URL_ENV];

  if (!value || value.length === 0) {
    return null;
  }

  return value;
}

export async function renderViaTestingRendererDaemon(payload: RenderPayload) {
  const daemonUrl = getTestingRendererDaemonUrl();

  if (!daemonUrl) {
    // Daemon is optional so local in-worker rendering can still be used as fallback.
    return null;
  }

  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const response = await fetch(daemonUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const parsed = (await response.json()) as {
    html?: string;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(parsed.error ?? `Renderer daemon returned ${response.status}.`);
  }

  if (typeof parsed.html !== 'string') {
    throw new Error('Renderer daemon returned an invalid payload.');
  }

  return parsed.html;
}
