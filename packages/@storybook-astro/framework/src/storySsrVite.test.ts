import { describe, expect, test } from 'vitest';
import { createStorybookBrowserStubPlugin } from './storySsrVite.ts';

type HookFn = (id: string) => unknown;

/** Calls a Vite resolveId/load hook regardless of whether it's a function or an object hook. */
function callHook(hook: unknown, id: string) {
  const handler = (typeof hook === 'function' ? hook : (hook as { handler: HookFn }).handler) as HookFn;

  return handler.call({}, id);
}

describe('createStorybookBrowserStubPlugin', () => {
  test('stubs @storybook/preview with a working CSF4 factory', async () => {
    const plugin = createStorybookBrowserStubPlugin();

    const resolved = callHook(plugin.resolveId, '@storybook/preview');
    const source = callHook(plugin.load, resolved) as string;

    // The stub must run as a real module: prerendering loads it to read each
    // story's component and args, so evaluate the emitted source and exercise it.
    const previewModule = await import(`data:text/javascript,${encodeURIComponent(source)}`);
    const component = () => '';
    const meta = previewModule.default.meta({ component, args: { size: 'lg' } });
    const story = meta.story({ args: { label: 'Primary' } });

    expect(story._tag).toBe('Story');
    expect(story.input).toEqual({ args: { label: 'Primary' } });
    expect(story.meta.input.component).toBe(component);
    expect(story.meta.input.args).toEqual({ size: 'lg' });
  });

  test('stubs the browser-only docs packages', () => {
    const plugin = createStorybookBrowserStubPlugin();

    for (const specifier of [
      '@storybook/addon-docs',
      '@storybook/addon-docs/blocks',
      '@storybook/blocks'
    ]) {
      const resolved = callHook(plugin.resolveId, specifier);

      expect(resolved).toBeTruthy();
      expect(callHook(plugin.load, resolved)).toContain('export default');
    }
  });

  test('leaves unrelated specifiers untouched', () => {
    const plugin = createStorybookBrowserStubPlugin();

    expect(callHook(plugin.resolveId, '@storybook/addon-a11y')).toBeNull();
    expect(callHook(plugin.resolveId, 'astro/runtime/server/index.js')).toBeNull();
  });
});
