import { afterEach, describe, expect, test, vi } from 'vitest';
import { createServerRenderer } from './renderer-server.ts';

const renderPayload = {
  component: '/src/components/Button.astro',
  args: { label: 'Click' },
  slots: {},
  story: undefined
};

describe('createServerRenderer', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('sends bearer auth header with default authorization header', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '<div>rendered</div>'
    }));

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-1' });

    const renderer = createServerRenderer({
      serverUrl: 'http://localhost:4000',
      authToken: 'secret'
    });

    const story = new AbortController();
    const removeListener = vi.spyOn(story.signal, 'removeEventListener');

    await expect(
      renderer.render(renderPayload, { signal: story.signal, timeoutMs: 1000 })
    ).resolves.toEqual({
      id: 'uuid-1',
      html: '<div>rendered</div>'
    });
    // A settled request stops listening on the story's signal, so rerenders
    // don't pile up listeners on it.
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:4000/render',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer secret'
        }
      })
    );
  });

  test('uses custom auth header without bearer prefix', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: async () => '<div>ok</div>'
    }));

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-2' });

    const renderer = createServerRenderer({
      serverUrl: 'http://localhost:5000',
      authToken: 'token-123',
      authHeader: 'x-storybook-token'
    });

    await renderer.render(renderPayload, { timeoutMs: 1000 });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:5000/render',
      expect.objectContaining({
        headers: {
          'content-type': 'application/json',
          'x-storybook-token': 'token-123'
        }
      })
    );
  });

  test('throws a clear error when server rejects auth', async () => {
    vi.stubGlobal('fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => ''
      }))
    );
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-3' });

    const renderer = createServerRenderer({
      serverUrl: 'http://localhost:6000',
      authToken: 'wrong'
    });

    await expect(renderer.render(renderPayload, { timeoutMs: 1000 })).rejects.toThrow(
      'Astro rendering server rejected the request with 401.'
    );
  });

  test('cancels the request when Storybook removes the story (issue #342)', async () => {
    let requestSignal: AbortSignal | undefined;
    const fetchMock = vi.fn(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          requestSignal = init.signal;
          init.signal.addEventListener('abort', () => reject(init.signal.reason));
        })
    );

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-4' });

    const story = new AbortController();
    const renderer = createServerRenderer({ serverUrl: 'http://localhost:7000' });
    const rendering = renderer.render(renderPayload, { signal: story.signal, timeoutMs: 1000 });

    story.abort();

    await expect(rendering).rejects.toMatchObject({ name: 'AbortError' });
    expect(requestSignal?.aborted).toBe(true);
  });

  test('doesn\'t send a request for a story Storybook has already removed (issue #342)', async () => {
    const fetchMock = vi.fn();

    vi.stubGlobal('fetch', fetchMock);

    const story = new AbortController();

    story.abort();

    const renderer = createServerRenderer({ serverUrl: 'http://localhost:7000' });

    await expect(
      renderer.render(renderPayload, { signal: story.signal })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('still reports a timed-out request as an unreachable server', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(new DOMException('The operation was aborted.', 'AbortError'))
            );
          })
      )
    );
    vi.stubGlobal('crypto', { randomUUID: () => 'uuid-5' });

    const renderer = createServerRenderer({ serverUrl: 'http://localhost:7000' });
    const rendering = renderer.render(renderPayload, {
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
