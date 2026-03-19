import type { ViteDevServer } from 'vite';

type SsrLoadModuleOptions = {
  fixStacktrace?: boolean;
};

export async function ssrLoadModuleWithFsFallback<TModule = unknown>(
  viteServer: Pick<ViteDevServer, 'ssrLoadModule'>,
  id: string,
  options?: SsrLoadModuleOptions
) {
  const ids = [id];

  if (id.startsWith('/') && !id.startsWith('/@fs/')) {
    ids.push(`/@fs${id}`);
  }

  let lastError: unknown;

  for (const candidate of ids) {
    try {
      return await viteServer.ssrLoadModule(candidate, options) as TModule;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}
