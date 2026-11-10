/// <reference types="vite/client" />
import type {
  RenderComponentInput,
  RenderPromise,
  RenderRequestOptions,
  RenderResponseMessage
} from '@storybook-astro/renderer/types';

const pendingMessages = new Map<string, RenderPromise>();
const ASTRO_SERVER_UNAVAILABLE_ERROR_NAME = 'AstroRenderServerUnavailableError';

export const isStaticMode = false;

export async function render(
  data: RenderComponentInput,
  { signal, timeoutMs = 5000 }: RenderRequestOptions = {}
) {
  // A story Storybook has already removed doesn't need the server's render.
  signal?.throwIfAborted();

  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const id = crypto.randomUUID();

  const promise = new Promise<RenderResponseMessage['data']>((resolve, reject) => {
    const forget = () => {
      clearTimeout(timeoutId);
      pendingMessages.delete(id);
      signal?.removeEventListener('abort', abandon);
    };

    // Storybook removed the story, so stop waiting on its response now
    // instead of holding the entry and its timer until the response or the
    // timeout (#342). The middleware still finishes the render.
    const abandon = () => {
      forget();
      reject(signal?.reason);
    };

    const timeoutId = setTimeout(() => {
      forget();

      const error = new Error(
        `Unable to reach Astro rendering server. No render response was received within ${timeoutMs}ms.`
      );

      error.name = ASTRO_SERVER_UNAVAILABLE_ERROR_NAME;

      reject(error);
    }, timeoutMs);

    signal?.addEventListener('abort', abandon);
    pendingMessages.set(id, {
      resolve: (response) => {
        forget();
        resolve(response);
      },
      reject,
      timeoutId
    });
  });

  import.meta.hot?.send('astro:render:request', {
    ...data,
    id
  });

  return promise;
}

export function init() {
  import.meta.hot?.on('astro:render:response', (data: RenderResponseMessage['data']) => {
    if (!data.id || !pendingMessages.has(data.id)) {
      return;
    }

    const pendingMessage = pendingMessages.get(data.id);

    if (!pendingMessage) {
      return;
    }

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
