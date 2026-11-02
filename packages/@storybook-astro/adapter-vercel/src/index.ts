import type astroVercel from '@astrojs/vercel';
import { importFromProject, type ServerAdapter } from '@storybook-astro/framework/adapters';

export type VercelAdapterOptions = Parameters<typeof astroVercel>[0];

/**
 * Deploys server mode to Vercel: the Storybook UI as static files and the
 * `/api` render routes as a function. Built with the project's
 * `@astrojs/vercel`, which writes Vercel's Build Output API to `.vercel/output`.
 */
export function vercel(options?: VercelAdapterOptions): ServerAdapter {
  return {
    name: 'vercel',
    async createAstroAdapter({ projectDir }) {
      const { default: createAdapter } = await importFromProject<{ default: typeof astroVercel }>(projectDir, '@astrojs/vercel');

      return createAdapter(options);
    },
    nextSteps: 'Deploy the prebuilt output with: vercel deploy --prebuilt'
  };
}
