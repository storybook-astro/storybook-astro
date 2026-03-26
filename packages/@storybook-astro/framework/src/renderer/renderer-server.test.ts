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

    await expect(renderer.render(renderPayload, 1000)).resolves.toEqual({
      id: 'uuid-1',
      html: '<div>rendered</div>'
    });

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

    await renderer.render(renderPayload, 1000);

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

    await expect(renderer.render(renderPayload, 1000)).rejects.toThrow(
      'Astro rendering server rejected the request with 401.'
    );
  });
});
