/**
 * A project-level Vite plugin, declared under `vite.plugins` in astro.config
 * rather than as an Astro integration — the same shape as `vite-svg-loader`
 * or `@tailwindcss/vite` in a real project.
 *
 * It exists so CI exercises issue #169: plugins declared here have to reach
 * every render pipeline (the Storybook build, the prerender SSR server, the
 * island asset build and the dev SSR server), not just the main build. A
 * component importing `virtual:project-banner` fails to resolve in whichever
 * pipeline is missing the plugin.
 */
const VIRTUAL_ID = 'virtual:project-banner';
const RESOLVED_ID = '\0virtual:project-banner';

export function projectBanner() {
  return {
    name: 'project-banner',

    resolveId(id) {
      if (id === VIRTUAL_ID) {
        return RESOLVED_ID;
      }
    },

    load(id) {
      if (id === RESOLVED_ID) {
        return `export default 'Served by the project Vite plugin';`;
      }
    }
  };
}
