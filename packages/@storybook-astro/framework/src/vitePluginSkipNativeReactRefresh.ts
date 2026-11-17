import type { Plugin } from 'vite';

// plugin-react's plugin objects outlive one config: addon-vitest's servers and
// a server restart resolve the same objects again, so each is patched once.
const patchedPlugins = new WeakSet<Plugin>();

/**
 * Vite 8 dev-server compatibility (Astro 7+). On Vite 8, @vitejs/plugin-react's
 * `vite:react:refresh-wrapper` plugin swaps itself for a Rolldown builtin
 * (`builtin:vite-react-refresh-wrapper`) that throws "Missing field
 * `moduleType`" while transforming Storybook's iframe.html inline bootstrap
 * script, which 500s every preview load. There is no config opt-out, so when
 * the plugin hands back the builtin, it's left out of that environment instead.
 * React components still render; only Fast Refresh is lost (component edits
 * full-reload).
 *
 * plugin-react decides from the Vite next to it, which in a monorepo can
 * differ from the running one (#379). So the builtin is also left out on Vite 6
 * and 7, where it can't run at all, and kept only on rolldown-vite 7, where
 * it's native and the 500 was never seen.
 *
 * The patch runs in `configResolved`, which Vite calls with every plugin,
 * flattened, before it asks each one which environments it applies to. That
 * covers plugin-react however it was added: by Astro's React integration, a
 * later `viteFinal`, or a Vitest config.
 */
export function vitePluginSkipNativeReactRefresh(): Plugin {
  return {
    name: 'storybook-astro:skip-native-react-refresh',
    configResolved(this: { meta?: { viteVersion?: string; rolldownVersion?: string } } | void, config) {
      // Vite 6 calls this hook with no `this`; the patch goes ahead there.
      const meta = this?.meta;
      const runsOnRolldownVite7 = Boolean(meta?.rolldownVersion) && Boolean(meta?.viteVersion?.startsWith('7.'));

      if (runsOnRolldownVite7) {
        return;
      }

      for (const plugin of config.plugins) {
        const chooseEnvironments = plugin.applyToEnvironment;

        if (plugin.name !== 'vite:react:refresh-wrapper' || !chooseEnvironments || patchedPlugins.has(plugin)) {
          continue;
        }

        patchedPlugins.add(plugin);
        // Patched in place: this object is the one Vite asks next.
        plugin.applyToEnvironment = async function (this: unknown, environment) {
          const applied = await chooseEnvironments.call(this, environment);
          const isNativeBuiltin =
            typeof applied === 'object' &&
            applied !== null &&
            (applied as { name?: string }).name === 'builtin:vite-react-refresh-wrapper';

          return isNativeBuiltin ? false : applied;
        } as Plugin['applyToEnvironment'];
      }
    }
  };
}
