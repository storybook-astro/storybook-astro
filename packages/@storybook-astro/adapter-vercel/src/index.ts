import astroVercel from '@astrojs/vercel';
import type { ServerAdapter } from '@storybook-astro/framework/adapters';

export type VercelAdapterOptions = Parameters<typeof astroVercel>[0];

/**
 * Deploys server mode to Vercel: the Storybook UI as static files and the
 * `/api` render routes as a function. Built with `@astrojs/vercel`, which
 * writes Vercel's Build Output API to `.vercel/output`.
 */
export function vercel(options?: VercelAdapterOptions): ServerAdapter {
  return {
    name: 'vercel',
    createAstroAdapter: () => astroVercel(options),
    nextSteps: 'Deploy the prebuilt output with: vercel deploy --prebuilt'
  };
}
