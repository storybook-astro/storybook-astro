import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { resolveConfig, type PluginOption } from 'vite';
import { vitePluginSkipNativeReactRefresh } from './vitePluginSkipNativeReactRefresh.ts';

const nativeBuiltin = { name: 'builtin:vite-react-refresh-wrapper' };

// Stands in for @vitejs/plugin-react's refresh wrapper, which hands back
// Vite 8's native builtin, keeps its own JavaScript transform (`true`), or
// skips an environment (`false`).
function refreshWrapper(choice: unknown) {
  return { name: 'vite:react:refresh-wrapper', applyToEnvironment: async () => choice };
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skip-native-react-refresh-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

async function clientPluginNames(plugins: PluginOption[]) {
  const config = await resolveConfig(
    { root, configFile: false, logLevel: 'silent', plugins: [vitePluginSkipNativeReactRefresh(), ...plugins] },
    'serve'
  );

  return config.environments.client.plugins.map((plugin) => plugin.name);
}

describe("plugin-react's refresh wrapper in the Storybook dev server (#378)", () => {
  test("is left out where it would swap in Vite 8's native builtin, which breaks Storybook's iframe", async () => {
    const names = await clientPluginNames([refreshWrapper(nativeBuiltin)]);

    expect(names).not.toContain('vite:react:refresh-wrapper');
    expect(names).not.toContain('builtin:vite-react-refresh-wrapper');
  });

  test('keeps its JavaScript transform where it chooses that, so Fast Refresh keeps working', async () => {
    expect(await clientPluginNames([refreshWrapper(true)])).toContain('vite:react:refresh-wrapper');
  });

  test('keeps any other plugin it hands back', async () => {
    expect(await clientPluginNames([refreshWrapper({ name: 'some-other-plugin' })])).toContain('some-other-plugin');
  });

  test('is found however plugin-react was listed, nested arrays and Promises included', async () => {
    const names = await clientPluginNames([Promise.resolve([[refreshWrapper(nativeBuiltin)]])]);

    expect(names).not.toContain('builtin:vite-react-refresh-wrapper');
  });

  test("is kept on rolldown-vite 7, which also offers the builtin but never showed the 500, so Fast Refresh keeps working", async () => {
    const plugin = vitePluginSkipNativeReactRefresh() as unknown as {
      configResolved: (this: unknown, config: { plugins: unknown[] }) => void;
    };
    const wrapper = refreshWrapper(nativeBuiltin);

    plugin.configResolved.call({ meta: { viteVersion: '7.3.1', rolldownVersion: '1.0.0-beta.50' } }, { plugins: [wrapper] });

    expect(await wrapper.applyToEnvironment()).toBe(nativeBuiltin);
  });

  test('is left out on plain Vite 7 when plugin-react sees a hoisted Vite 8, since Vite 7 cannot run it', async () => {
    const plugin = vitePluginSkipNativeReactRefresh() as unknown as {
      configResolved: (this: unknown, config: { plugins: unknown[] }) => void;
    };
    const wrapper = refreshWrapper(nativeBuiltin);

    plugin.configResolved.call({ meta: { viteVersion: '7.3.1', rollupVersion: '4.0.0' } }, { plugins: [wrapper] });

    expect(await wrapper.applyToEnvironment()).toBe(false);
  });

  test('is patched once when the same plugin-react object is resolved again, as on a server restart', async () => {
    const wrapper = refreshWrapper(nativeBuiltin);
    const plugin = vitePluginSkipNativeReactRefresh() as unknown as {
      configResolved: (this: unknown, config: { plugins: unknown[] }) => void;
    };

    plugin.configResolved.call(undefined, { plugins: [wrapper] });
    const patched = wrapper.applyToEnvironment;

    plugin.configResolved.call(undefined, { plugins: [wrapper] });

    expect(wrapper.applyToEnvironment).toBe(patched);
  });

  test('is found when plugin-react is listed before this plugin, as a later viteFinal or a Vitest config may', async () => {
    const config = await resolveConfig(
      { root, configFile: false, logLevel: 'silent', plugins: [refreshWrapper(nativeBuiltin), vitePluginSkipNativeReactRefresh()] },
      'serve'
    );

    expect(config.environments.client.plugins.map((plugin) => plugin.name)).not.toContain(
      'builtin:vite-react-refresh-wrapper'
    );
  });
});
