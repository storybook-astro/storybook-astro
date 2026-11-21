import type {
  RenderComponentInput,
  RenderRequestOptions,
  RenderResponseMessage
} from '@storybook-astro/renderer/types';

export const isStaticMode = false;

type StorybookImportMetaEnv = ImportMeta & {
  env?: Record<string, string | undefined>;
};

type StorybookGlobalEnv = typeof globalThis & {
  STORYBOOK_ASTRO_SERVER_TOKEN?: string;
  STORYBOOK_ASTRO_SERVER_AUTH_HEADER?: string;
};

type ServerRendererDefaults = {
  authToken?: string;
  authHeader?: string;
};

const ASTRO_SERVER_UNAVAILABLE_ERROR_NAME = 'AstroRenderServerUnavailableError';

export function createServerRenderer(defaults: ServerRendererDefaults = {}) {
  return {
    // A serverless render function's first request also starts it; the
    // timeout leaves room for a slow cold start rather than retrying into one.
    render(data: RenderComponentInput, { signal, timeoutMs = 60_000 }: RenderRequestOptions = {}) {
      return renderWithHttp(data, timeoutMs, signal, defaults);
    },
    init() {
      // Fire-and-forget warmup at preview startup: starts a serverless
      // render function while the Storybook UI is still loading, so its cold
      // start doesn't land on the first story render.
      try {
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
        fetch('/api/render', { method: 'GET' }).catch(() => {});
      } catch {
        // Never let warmup break preview startup.
      }
    },
    applyStyles() {
      return;
    }
  };
}

async function renderWithHttp(
  data: RenderComponentInput,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  defaults: ServerRendererDefaults
) {
  // A story Storybook has already removed doesn't need the server's render.
  signal?.throwIfAborted();

  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const id = crypto.randomUUID();
  const serverUrl = '/api';
  const authToken = resolveAuthToken(defaults);
  const authHeader = resolveAuthHeader(defaults);
  const headers: Record<string, string> = {
    'content-type': 'application/json'
  };

  if (authToken) {
    headers[authHeader] =
      authHeader.toLowerCase() === 'authorization' && !authToken.startsWith('Bearer ')
        ? `Bearer ${authToken}`
        : authToken;
  }

  // One controller cancels the request on the timeout or when Storybook
  // removes the story. An abandoned request left open holds one of the
  // browser's few connections to the render server, so clicking through slow
  // stories used to queue the current story's request behind them until it
  // timed out (#342).
  const controller = new AbortController();
  const cancelForStory = () => controller.abort(signal?.reason);

  signal?.addEventListener('abort', cancelForStory);

  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const response = await fetch(`${serverUrl}/render`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.status === 401 || response.status === 403) {
      throw new Error(
        `Astro rendering server rejected the request with ${response.status}. ` +
          `Check STORYBOOK_ASTRO_SERVER_TOKEN and auth header configuration.`
      );
    }

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();

    return {
      id,
      html
    } satisfies RenderResponseMessage['data'];
  } catch (error) {
    clearTimeout(timeoutId);

    // The story went away, not the server: the renderer drops this render.
    if (signal?.aborted) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw createServerUnavailableError(
        serverUrl,
        `Request timed out after ${timeoutMs}ms while waiting for a render response.`
      );
    }

    if (error instanceof TypeError) {
      throw createServerUnavailableError(
        serverUrl,
        'The Astro rendering server is not reachable over HTTP.'
      );
    }

    throw error;
  } finally {
    signal?.removeEventListener('abort', cancelForStory);
  }
}

function resolveAuthToken(defaults: ServerRendererDefaults) {
  const envAuthToken = (import.meta as StorybookImportMetaEnv).env?.STORYBOOK_ASTRO_SERVER_TOKEN;
  const globalAuthToken = (globalThis as StorybookGlobalEnv).STORYBOOK_ASTRO_SERVER_TOKEN;

  return defaults.authToken || envAuthToken || globalAuthToken;
}

function resolveAuthHeader(defaults: ServerRendererDefaults) {
  const envAuthHeader = (import.meta as StorybookImportMetaEnv).env?.STORYBOOK_ASTRO_SERVER_AUTH_HEADER;
  const globalAuthHeader = (globalThis as StorybookGlobalEnv).STORYBOOK_ASTRO_SERVER_AUTH_HEADER;

  return (defaults.authHeader || envAuthHeader || globalAuthHeader || 'authorization').toLowerCase();
}

function createServerUnavailableError(serverUrl: string, reason: string) {
  const error = new Error(`Unable to reach Astro rendering server at ${serverUrl}. ${reason}`);

  error.name = ASTRO_SERVER_UNAVAILABLE_ERROR_NAME;

  return error;
}
