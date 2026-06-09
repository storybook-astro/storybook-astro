// Ambient declaration for the renderer's runtime-only entry-preview module.
//
// `@storybook-astro/renderer/entry-preview` is built into JS but no .d.ts is
// emitted, because the source imports Vite virtual modules that fail isolated
// DTS compilation. We import the runtime values from `definePreview` so the
// renderer's `renderToCanvas`, `render`, and `parameters` end up composed into
// CSF4 previews — see src/index.ts for the why.
declare module '@storybook-astro/renderer/entry-preview' {
  import type { ArgsStoryFn, Renderer, RenderContext } from 'storybook/internal/types';

  export const parameters: { renderer: 'astro' };
  export const render: ArgsStoryFn<Renderer>;
  export const renderToCanvas: (
    context: RenderContext<Renderer>,
    canvasElement: HTMLElement
  ) => void | Promise<void>;
}
