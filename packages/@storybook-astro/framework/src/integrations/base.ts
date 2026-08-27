import type { AstroIntegration } from 'astro';

export type RendererDeclaration = {
  server?: {
    name: string,
    entrypoint: string,
  },
  client?: {
    name: string,
    entrypoint: string,
  }
};

export abstract class Integration {
  abstract readonly name: string;
  // Identifier used to import this integration's factory from
  // `@storybook-astro/framework/integrations` when generating the server
  // runtime module. Defaults to `name` for integrations whose public name
  // matches their factory export. Override when they diverge (e.g. Alpine's
  // `name` is "alpine" but its factory export is `alpinejs`).
  readonly factoryName?: string;
  abstract readonly dependencies: string[];
  abstract readonly options: Record<string | number | symbol, unknown>;
  abstract readonly renderer: RendererDeclaration;
  abstract readonly storybookEntryPreview?: string;
  // Packages this integration pulls into the browser through a client
  // entrypoint the dependency scanner cannot reach (a virtual module, or a
  // config-supplied entrypoint file). Vite would otherwise find them only once
  // the preview is running and reload the page to optimize them — harmless in
  // Storybook dev, but fatal mid-collection under `@storybook/addon-vitest`.
  readonly clientOptimizeDeps?: string[];

  abstract resolveClient(moduleName: string): string | undefined;
  abstract loadIntegration(resolveFrom?: string): Promise<AstroIntegration>;
}
