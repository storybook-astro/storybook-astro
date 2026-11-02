import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AstroInlineConfig, AstroIntegration } from 'astro';

/**
 * Where server mode runs. The render app is a regular Astro app, so a host is
 * an official Astro adapter (`@astrojs/node`, `@astrojs/vercel`,
 * `@astrojs/cloudflare`, …) built by `astro build`. Adapter packages such as
 * `@storybook-astro/adapter-node` wrap one with Storybook defaults.
 */
export type ServerAdapter = {
  name: string;
  /** Creates the Astro adapter that builds the render app for this host. */
  createAstroAdapter(app: RenderApp): AstroIntegration | Promise<AstroIntegration>;
  /** Astro config this host needs on top of the render app's own. */
  astroConfig?: AstroInlineConfig;
  /** Printed after a successful build: how to run or deploy the output. */
  nextSteps?: string;
};

export type RenderApp = {
  /** The Storybook project, whose Astro builds the render app. */
  projectDir: string;
  /** Where the render app's sources are generated, for host config files beside them. */
  appDir: string;
};

/**
 * Imports a package as the project resolves it. An Astro adapter has to match
 * the project's Astro version, so adapter packages load `@astrojs/*` from the
 * project rather than from wherever they are installed themselves.
 */
export async function importFromProject<T>(projectDir: string, specifier: string): Promise<T> {
  const require = createRequire(resolve(projectDir, 'package.json'));
  let entry: string;

  try {
    entry = require.resolve(specifier);
  } catch {
    throw new Error(
      `[storybook-astro] ${specifier} is not installed in ${projectDir}. ` +
        'Install the version that matches your Astro version.'
    );
  }

  return import(pathToFileURL(entry).href);
}
