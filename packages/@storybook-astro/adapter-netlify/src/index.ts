import type astroNetlify from '@astrojs/netlify';
import { importFromProject, type ServerAdapter } from '@storybook-astro/framework/adapters';

export type NetlifyAdapterOptions = Parameters<typeof astroNetlify>[0];

/**
 * Deploys server mode to Netlify: the Storybook UI as static files and the
 * `/api` render routes as a function. Built with the project's
 * `@astrojs/netlify`, which writes Netlify's Frameworks API output to `.netlify/v1`.
 */
export function netlify(options?: NetlifyAdapterOptions): ServerAdapter {
  return {
    name: 'netlify',
    async createAstroAdapter({ projectDir }) {
      const { default: createAdapter } = await importFromProject<{ default: typeof astroNetlify }>(
        projectDir,
        '@astrojs/netlify'
      );

      return createAdapter(options);
    },
    nextSteps: 'Deploy with: netlify deploy --build --prod (publish directory: storybook-server)'
  };
}
