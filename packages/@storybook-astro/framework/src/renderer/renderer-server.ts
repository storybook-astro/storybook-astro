import type { RenderComponentInput, RenderResponseMessage } from '@storybook-astro/renderer/types';

export const isStaticMode = false;

type StorybookImportMetaEnv = ImportMeta & {
  env?: Record<string, string | undefined>;
};

type StorybookGlobalEnv = typeof globalThis & {
  STORYBOOK_ASTRO_SERVER_URL?: string;
  STORYBOOK_ASTRO_SERVER_TOKEN?: string;
  STORYBOOK_ASTRO_SERVER_AUTH_HEADER?: string;
};

type ServerRendererDefaults = {
  serverUrl?: string;
  authToken?: string;
  authHeader?: string;
};

const ASTRO_SERVER_UNAVAILABLE_ERROR_NAME = 'AstroRenderServerUnavailableError';

export function createServerRenderer(defaults: ServerRendererDefaults = {}) {
  return {
    // Serverless render endpoints boot a full Vite SSR runtime on cold start
    // (~10-15s on Vercel), so the server-mode timeout is far above the HMR
    // renderer's — an aborted first render would just retry into another
    // cold start.
    render(data: RenderComponentInput, timeoutMs = 60_000) {
      return renderWithHttp(data, timeoutMs, defaults);
    },
    init() {
      // Fire-and-forget warmup at preview startup: any request boots the
      // serverless function and its Vite SSR runtime while the Storybook UI
      // is still loading, hiding most of the ~10-15s cold start that would
      // otherwise land on the first story render. GET /render is unrouted
      // (Hono 404s it) but still initializes the function module.
      try {
        // eslint-disable-next-line n/no-unsupported-features/node-builtins
        fetch(`${resolveServerUrl(defaults)}/render`, { method: 'GET' }).catch(() => {});
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
  defaults: ServerRendererDefaults
) {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const id = crypto.randomUUID();
  const serverUrl = resolveServerUrl(defaults);
  const authToken = resolveAuthToken(defaults);
  const authHeader = resolveAuthHeader(defaults);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers: Record<string, string> = {
      'content-type': 'application/json'
    };

    if (authToken) {
      headers[authHeader] =
        authHeader.toLowerCase() === 'authorization' && !authToken.startsWith('Bearer ')
          ? `Bearer ${authToken}`
          : authToken;
    }

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
  }
}

function resolveServerUrl(defaults: ServerRendererDefaults) {
  const envServerUrl = (import.meta as StorybookImportMetaEnv).env?.STORYBOOK_ASTRO_SERVER_URL;
  const globalServerUrl = (globalThis as StorybookGlobalEnv).STORYBOOK_ASTRO_SERVER_URL;

  return defaults.serverUrl || envServerUrl || globalServerUrl || 'http://localhost:3000';
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
