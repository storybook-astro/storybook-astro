declare module 'virtual:astro-container-renderers' {
  import type { experimental_AstroContainer as AstroContainer } from 'astro/container';

  export function addRenderers(container: AstroContainer): void;
  export function resolveClientModules(specifier: string): string | undefined;
}

declare module 'virtual:storybook-renderer-fallback' {}
