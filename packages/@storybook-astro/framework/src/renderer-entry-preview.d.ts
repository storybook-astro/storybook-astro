// Ambient declaration for the renderer's runtime-only entry-preview module.
//
// `@storybook-astro/renderer/entry-preview` is built into JS but no .d.ts is
// emitted, because the source imports Vite virtual modules that fail isolated
// DTS compilation. We import the runtime values from `definePreview` so the
// renderer's `renderToCanvas`, `render`, and `parameters` end up composed into
// CSF4 previews — see src/index.ts for the why.
declare module '@storybook-astro/renderer/entry-preview' {
  import type { ArgsStoryFn, Renderer, RenderContext } from 'storybook/internal/types';
  import type { DecoratorApplicator } from 'storybook/internal/csf';

  export const parameters: { renderer: 'astro' };
  export const render: ArgsStoryFn<Renderer>;
  export const renderToCanvas: (
    context: RenderContext<Renderer>,
    canvasElement: HTMLElement
  ) => void | Promise<void>;
  // Re-exported from the renderer's decorators.ts
  // (docs/specs/decorators.md#renderer-composition) so classic CSF3
  // previews pick up decorator composition too.
  // `definePreview` (src/index.ts) doesn't use this export — it imports the
  // decorators module directly instead, since that module has no virtual-module
  // imports and doesn't need the lazy entry-preview load.
  export const applyDecorators: DecoratorApplicator<Renderer>;
}
