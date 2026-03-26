import type { SanitizationOptions } from './lib/sanitization.ts';

declare module 'virtual:astro-container-renderers' {
  import type { experimental_AstroContainer as AstroContainer } from 'astro/container';

  export function addRenderers(container: AstroContainer): void;
  export function resolveClientModules(specifier: string): string | undefined;
}

declare module 'virtual:astro-files' {
  const astroFiles: Record<string, unknown>;

  export default astroFiles;
}

declare module 'virtual:storybook-astro-renderer' {
  import type { RenderComponentInput, RenderResponseMessage } from '@storybook-astro/renderer/types';

  export function render(
    input: RenderComponentInput,
    timeoutMs?: number
  ): Promise<RenderResponseMessage['data']>;
  export function init(): void;
  export function applyStyles(): void;
}

declare module 'virtual:storybook-astro-sanitization-config' {
  const sanitization: SanitizationOptions | undefined;

  export default sanitization;
}

declare module 'virtual:storybook-astro-story-rules-config' {
  const configModule: unknown;

  export default configModule;
  export const storybookAstroStoryRulesConfigFilePath: string | undefined;
}

declare module 'virtual:storybook-astro-server-auth-config' {
  export const storybookAstroServerAuthToken: string | undefined;
  export const storybookAstroServerAuthHeader: string;
}

declare module 'virtual:storybook-renderer-fallback' {}
