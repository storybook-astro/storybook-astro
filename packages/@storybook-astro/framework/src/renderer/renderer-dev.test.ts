import { afterEach, describe, expect, test, vi } from 'vitest';
import type { RenderResponseMessage } from '@storybook-astro/renderer/types';
import { init, render } from './renderer-dev.ts';

const renderPayload = {
  component: '/src/components/Button.astro',
  args: { label: 'Click' },
  slots: {},
  story: undefined
};

describe('dev render requests', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('resolve with the server\'s response and drop its timeout', async () => {
    vi.useFakeTimers();

    // A stand-in for Vite's HMR client: vitest.config.ts points the
    // transport's `import.meta.hot` calls here.
    let deliverResponse!: (data: RenderResponseMessage['data']) => void;
    let sentRequestId: string | undefined;

    vi.stubGlobal('__storybookAstroTestHot', {
      on: (event: string, handler: typeof deliverResponse) => {
        if (event === 'astro:render:response') {
          deliverResponse = handler;
        }
      },
      send: (_event: string, request: { id: string }) => {
        sentRequestId = request.id;
      }
    });
    init();

    const story = new AbortController();
    const removeListener = vi.spyOn(story.signal, 'removeEventListener');
    const rendering = render(renderPayload, { signal: story.signal, timeoutMs: 5000 });
    const response = { id: sentRequestId!, html: '<button>Click</button>' };

    deliverResponse(response);

    await expect(rendering).resolves.toBe(response);
    expect(vi.getTimerCount()).toBe(0);
    // A settled request stops listening on the story's signal, so rerenders
    // don't pile up listeners on it.
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  test('stop waiting on the response, and its timeout, when Storybook removes the story (issue #342)', async () => {
    vi.useFakeTimers();

    const story = new AbortController();
    const rendering = render(renderPayload, { signal: story.signal, timeoutMs: 5000 });

    expect(vi.getTimerCount()).toBe(1);

    story.abort();

    await expect(rendering).rejects.toMatchObject({ name: 'AbortError' });
    expect(vi.getTimerCount()).toBe(0);
  });

  test('aren\'t made for a story Storybook has already removed (issue #342)', async () => {
    vi.useFakeTimers();

    const story = new AbortController();

    story.abort();

    await expect(render(renderPayload, { signal: story.signal })).rejects.toMatchObject({
      name: 'AbortError'
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  test('still time out when no response arrives', async () => {
    vi.useFakeTimers();

    const rendering = render(renderPayload, {
      signal: new AbortController().signal,
      timeoutMs: 1000
    });
    const failure = expect(rendering).rejects.toMatchObject({
      name: 'AstroRenderServerUnavailableError'
    });

    await vi.advanceTimersByTimeAsync(1000);
    await failure;
  });
});
