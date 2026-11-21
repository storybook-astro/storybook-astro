import type { Plugin } from 'vite';

// plugin-react's plugin objects outlive one config: addon-vitest's servers and
// a server restart resolve the same objects again, so each is patched once.
const patchedPlugins = new WeakSet<Plugin>();

/**
 * Leaves @vitejs/plugin-react's native refresh wrapper out of a Vite that can't
 * run it. On Vite 8, plugin-react's `vite:react:refresh-wrapper` plugin swaps
 * itself for a Rolldown builtin (`builtin:vite-react-refresh-wrapper`), but
 * plugin-react decides from the Vite next to it, which in a monorepo can
 * differ from the running one (#379). On Vite 6 or plain Vite 7 it can hand
 * back a hoisted Vite 8's builtin, which fails every client module transform
 * there ("Missing field `moduleType`"), so iframe.html and every story return
 * a 500. The builtin is left out of that environment, which costs Fast Refresh
 * there. Other plugin-react settings chosen for the hoisted Vite 8 (such as its
 * `oxc.jsx` config) may not apply either.
 *
 * On a Rolldown Vite (Vite 8, or rolldown-vite 7) the builtin is native and
 * kept, so Fast Refresh works. It used to be dropped there too, for a "Missing
 * field `moduleType`" 500 on iframe.html (#139) that doesn't reproduce on Vite
 * 8.0.0 to 8.3.8 and most likely came from the #379 mismatch (#380).
 *
 * The patch runs in `configResolved`, which Vite calls with every plugin,
 * flattened, before it asks each one which environments it applies to. That
 * covers plugin-react however it was added: by Astro's React integration, a
 * later `viteFinal`, or a Vitest config.
 */
export function vitePluginSkipNativeReactRefresh(): Plugin {
  return {
    name: 'storybook-astro:skip-native-react-refresh',
    configResolved(this: { meta?: { rolldownVersion?: string } } | void, config) {
      // Vite 6 calls this hook with no `this`, and plain Vite 7 passes `meta`
      // without `rolldownVersion`; the patch goes ahead on both.
      if (this?.meta?.rolldownVersion) {
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
