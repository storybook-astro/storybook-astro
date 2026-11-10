import { afterEach, describe, expect, test, vi } from 'vitest';
import { render } from './renderer-dev.ts';

const renderPayload = {
  component: '/src/components/Button.astro',
  args: { label: 'Click' },
  slots: {},
  story: undefined
};

describe('dev render requests', () => {
  afterEach(() => {
    vi.useRealTimers();
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
