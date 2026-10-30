import type { InlineConfig } from 'vite';

// Adapters type their Vite config against the framework's own Vite copy.
export type { InlineConfig as ViteConfig, Plugin as VitePlugin } from 'vite';
export { node } from './node.ts';
export { vercel } from './vercel.ts';
export { packageServer } from './packageServer.ts';

/** A completed, host-independent Storybook server build. All paths are absolute. */
export type ServerBuild = {
  projectDir: string;
  staticDir: string;
  serverDir: string;
};

/** Providers own packaging and HTTP entrypoints; the render runtime owns neither. */
export type ServerAdapter = {
  name: string;
  /**
   * For hosts that cannot run Vite at request time (e.g. Cloudflare Workers).
   * The build then compiles every story component into one self-contained
   * `storybook-server/index.js`, using this host-specific Vite config.
   */
  compiledServer?: {
    vite?: InlineConfig;
  };
  adapt(build: ServerBuild): Promise<void>;
};
