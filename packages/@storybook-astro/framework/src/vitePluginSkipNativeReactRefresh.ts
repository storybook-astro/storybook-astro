import type { Plugin } from 'vite';

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
 * This keys off plugin-react's own choice rather than a Vite version. That
 * choice reads Vite from plugin-react's install location, so in a monorepo
 * where that Vite is 8 and the running one is 6 or 7, Fast Refresh is off
 * there too (#379).
 *
 * The patch runs in `configResolved`, which Vite calls with every plugin,
 * flattened, before it asks each one which environments it applies to. That
 * covers plugin-react however it was added: by Astro's React integration, a
 * later `viteFinal`, or a Vitest config.
 */
export function vitePluginSkipNativeReactRefresh(): Plugin {
  return {
    name: 'storybook-astro:skip-native-react-refresh',
    apply: 'serve',
    configResolved(config) {
      for (const plugin of config.plugins) {
        const chooseEnvironments = plugin.applyToEnvironment;

        if (plugin.name !== 'vite:react:refresh-wrapper' || !chooseEnvironments) {
          continue;
        }

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
