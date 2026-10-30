import astroNode from '@astrojs/node';
import type { ServerAdapter } from '@storybook-astro/framework/adapters';

export type NodeAdapterOptions = Partial<Parameters<typeof astroNode>[0]>;

/**
 * Runs server mode as a Node.js server: one process serves the Storybook UI
 * and renders Astro stories at `/api`. Built with `@astrojs/node`, in its
 * `standalone` mode unless you pass another.
 */
export function node(options: NodeAdapterOptions = {}): ServerAdapter {
  return {
    name: 'node',
    createAstroAdapter: () => astroNode({ mode: 'standalone', ...options }),
    nextSteps: 'Start the server with: node storybook-server/server/entry.mjs'
  };
}
