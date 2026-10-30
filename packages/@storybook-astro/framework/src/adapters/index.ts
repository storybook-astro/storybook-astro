import type { AstroInlineConfig, AstroIntegration } from 'astro';

/**
 * Where server mode runs. The render app is a regular Astro app, so a host is
 * an official Astro adapter (`@astrojs/node`, `@astrojs/vercel`,
 * `@astrojs/cloudflare`, …) built by `astro build`. Adapter packages such as
 * `@storybook-astro/adapter-node` wrap one with Storybook defaults.
 */
export type ServerAdapter = {
  name: string;
  /**
   * Creates the Astro adapter that builds the render app for this host.
   * `appDir` is where the app's sources are generated, for host config files
   * the adapter needs beside them.
   */
  createAstroAdapter(appDir: string): AstroIntegration | Promise<AstroIntegration>;
  /** Astro config this host needs on top of the render app's own. */
  astroConfig?: AstroInlineConfig;
  /** Printed after a successful build: how to run or deploy the output. */
  nextSteps?: string;
};
