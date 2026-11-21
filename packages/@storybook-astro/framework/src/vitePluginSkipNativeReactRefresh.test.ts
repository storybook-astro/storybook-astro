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

type ConfigResolvedHook = (this: unknown, config: { plugins: readonly unknown[] }) => void;

// Runs the plugin's `configResolved` the way a given Vite calls it: Vite 6
// with no `this`, Vite 7 and 8 with their `meta`.
function runConfigResolved(context: unknown, plugins: readonly unknown[]) {
  const plugin = vitePluginSkipNativeReactRefresh() as unknown as { configResolved: ConfigResolvedHook };

  plugin.configResolved.call(context, { plugins });
}

// The plugin as Vite 6 runs it: its `configResolved` gets no `this`. In
// `resolveConfig` it still runs in Vite's own hook order, so a test can check
// the patch lands before Vite resolves each environment's plugins.
function asOnVite6() {
  const plugin = vitePluginSkipNativeReactRefresh() as unknown as { configResolved: ConfigResolvedHook };

  return {
    name: 'skip-native-react-refresh-as-on-vite6',
    configResolved(config: { plugins: readonly unknown[] }) {
      plugin.configResolved.call(undefined, config);
    }
  };
}

const vite6 = undefined;
const plainVite7 = { meta: { viteVersion: '7.3.1', rollupVersion: '4.0.0' } };
const rolldownVite7 = { meta: { viteVersion: '7.3.1', rolldownVersion: '1.0.0-beta.50' } };
const vite8 = { meta: { viteVersion: '8.0.16', rolldownVersion: '1.0.0' } };

describe("plugin-react's refresh wrapper on a Rolldown Vite (#380)", () => {
  test("keeps Vite 8's native builtin so Fast Refresh works (#380)", async () => {
    const names = await clientPluginNames([refreshWrapper(nativeBuiltin)]);

    expect(names).toContain('builtin:vite-react-refresh-wrapper');
  });

  test('keeps the builtin when Vite 8 reports its Rolldown version', async () => {
    const wrapper = refreshWrapper(nativeBuiltin);

    runConfigResolved(vite8, [wrapper]);

    expect(await wrapper.applyToEnvironment()).toBe(nativeBuiltin);
  });

  test('keeps the builtin on rolldown-vite 7, where it is native too', async () => {
    const wrapper = refreshWrapper(nativeBuiltin);

    runConfigResolved(rolldownVite7, [wrapper]);

    expect(await wrapper.applyToEnvironment()).toBe(nativeBuiltin);
  });
});

describe("plugin-react's refresh wrapper on a Vite that can't run the builtin (#379)", () => {
  test('is left out on Vite 6 when plugin-react sees a hoisted Vite 8', async () => {
    const wrapper = refreshWrapper(nativeBuiltin);

    runConfigResolved(vite6, [wrapper]);

    expect(await wrapper.applyToEnvironment()).toBe(false);
  });

  test('is left out on plain Vite 7 when plugin-react sees a hoisted Vite 8', async () => {
    const wrapper = refreshWrapper(nativeBuiltin);

    runConfigResolved(plainVite7, [wrapper]);

    expect(await wrapper.applyToEnvironment()).toBe(false);
  });

  test('keeps its JavaScript transform where it chooses that, so Fast Refresh keeps working', async () => {
    const wrapper = refreshWrapper(true);

    runConfigResolved(vite6, [wrapper]);

    expect(await wrapper.applyToEnvironment()).toBe(true);
  });

  test('keeps any other plugin it hands back', async () => {
    const otherPlugin = { name: 'some-other-plugin' };
    const wrapper = refreshWrapper(otherPlugin);

    runConfigResolved(vite6, [wrapper]);

    expect(await wrapper.applyToEnvironment()).toBe(otherPlugin);
  });

  // The suite runs on Vite 8, so these check Vite 8's hook order with Vite 6's `this`.
  test('is found however plugin-react was listed, nested arrays and Promises included', async () => {
    const config = await resolveConfig(
      {
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [asOnVite6(), Promise.resolve([[refreshWrapper(nativeBuiltin)]])]
      },
      'serve'
    );

    expect(config.environments.client.plugins.map((plugin) => plugin.name)).not.toContain(
      'builtin:vite-react-refresh-wrapper'
    );
  });

  test('is found when plugin-react is listed before this plugin, as a later viteFinal or a Vitest config may', async () => {
    const config = await resolveConfig(
      { root, configFile: false, logLevel: 'silent', plugins: [refreshWrapper(nativeBuiltin), asOnVite6()] },
      'serve'
    );

    expect(config.environments.client.plugins.map((plugin) => plugin.name)).not.toContain(
      'builtin:vite-react-refresh-wrapper'
    );
  });

  test('is patched once when the same plugin-react object is resolved again, as on a server restart', async () => {
    const wrapper = refreshWrapper(nativeBuiltin);

    runConfigResolved(vite6, [wrapper]);
    const patched = wrapper.applyToEnvironment;

    runConfigResolved(vite6, [wrapper]);

    expect(wrapper.applyToEnvironment).toBe(patched);
  });
});
