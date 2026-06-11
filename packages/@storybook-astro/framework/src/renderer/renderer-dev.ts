import type {
  RenderComponentInput,
  RenderPromise,
  RenderResponseMessage
} from '@storybook-astro/renderer/types';

const pendingMessages = new Map<string, RenderPromise>();
const ASTRO_SERVER_UNAVAILABLE_ERROR_NAME = 'AstroRenderServerUnavailableError';

export const isStaticMode = false;

export async function render(data: RenderComponentInput, timeoutMs = 5000) {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const id = crypto.randomUUID();

  const promise = new Promise<RenderResponseMessage['data']>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      pendingMessages.delete(id);

      const error = new Error(
        `Unable to reach Astro rendering server. No render response was received within ${timeoutMs}ms.`
      );

      error.name = ASTRO_SERVER_UNAVAILABLE_ERROR_NAME;

      reject(error);
    }, timeoutMs);

    pendingMessages.set(id, { resolve, reject, timeoutId });
  });

  import.meta.hot?.send('astro:render:request', {
    ...data,
    id
  });

  return promise;
}

export function init() {
  import.meta.hot?.on('vite:afterUpdate', (payload) => {
    if (payload.updates.some((update) => isAstroStyleUpdate(update.path))) {
      applyStyles();
    }
  });

  import.meta.hot?.on('astro:render:response', (data: RenderResponseMessage['data']) => {
    if (!data.id || !pendingMessages.has(data.id)) {
      return;
    }

    const pendingMessage = pendingMessages.get(data.id);

    if (!pendingMessage) {
      return;
    }

    clearTimeout(pendingMessage.timeoutId);
    pendingMessages.delete(data.id);
    pendingMessage.resolve(data);
  });
}

export function applyStyles() {
  Array.from(document.querySelectorAll('style[data-vite-dev-id]'))
    .filter((element) => /__vite__updateStyle/.test(element.innerHTML))
    .forEach((element) => {
      const script = document.createElement('script');

      script.type = 'module';

      const safeScriptContent = element.innerHTML
        .replaceAll('import.meta.hot.accept(', 'import.meta.hot?.accept(')
        .replaceAll('import.meta.hot.prune(', 'import.meta.hot?.prune(');

      script.appendChild(document.createTextNode(safeScriptContent));
      document.head.appendChild(script);
      document.head.removeChild(script);
    });
}

function isAstroStyleUpdate(path: string): boolean {
  return /\.astro\?astro&type=style&index=\d+&lang\.(css|scss|sass|less|stylus)$/.test(path);
}
