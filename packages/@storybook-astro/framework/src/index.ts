// Re-export types from storybook internal
export type {
  Args,
  ArgTypes,
  Parameters,
  ProjectAnnotations,
  StrictArgs
} from 'storybook/internal/types';

import { definePreview as definePreviewBase, type PreviewAddon, type InferTypes, type Preview as CsfPreview } from 'storybook/internal/csf';
import { combineParameters } from 'storybook/internal/preview-api';
import type { ArgsStoryFn, ProjectAnnotations, RenderContext, Renderer } from 'storybook/internal/types';
import { defaultPreviewParameters } from '@storybook-astro/renderer/preview-defaults';
import { applyDecorators } from '@storybook-astro/renderer/decorators';
import type { AstroRenderer } from './portable-stories.ts';

// CSF4 consumers reach `definePreview` from the preview iframe; Node test setup
// files (e.g. `vitest.setup.ts`) only import the type helpers and
// `setProjectAnnotations`. Loading `@storybook-astro/renderer/entry-preview` at
// module scope here would pull `render.tsx`'s virtual-module chain — including
// the configured framework integrations like Alpine.js — into the Node test
// process, which has no `MutationObserver` etc. The dynamic import below keeps
// that load inside `definePreview` so test setups don't pay for it.
// Types come from src/renderer-entry-preview.d.ts; entry-preview.ts itself
// isn't dts-built because it imports Vite virtual modules.
import type * as RendererEntryPreviewModule from '@storybook-astro/renderer/entry-preview';

type RendererEntryPreview = typeof RendererEntryPreviewModule;
let rendererImpl: RendererEntryPreview | undefined;
let rendererLoadPromise: Promise<RendererEntryPreview> | undefined;

function loadRendererEntryPreview(): Promise<RendererEntryPreview> {
  rendererLoadPromise ??= import('@storybook-astro/renderer/entry-preview').then((mod) => {
    rendererImpl = mod;

    return mod;
  });

  return rendererLoadPromise;
}

const composedRender: ArgsStoryFn<AstroRenderer> = (args, context) => {
  if (!rendererImpl) {
    throw new Error(
      '@storybook-astro: renderer not ready when `render` was called. ' +
        'This should be reached only after `definePreview()` has kicked off the renderer load. ' +
        'If you see this in tests, import the renderer module yourself or render via portable stories.'
    );
  }

  return rendererImpl.render(args, context);
};

const composedRenderToCanvas = async (
  context: RenderContext<Renderer>,
  canvasElement: HTMLElement
): Promise<void> => {
  const impl = await loadRendererEntryPreview();

  return impl.renderToCanvas(context, canvasElement);
};

/**
 * Preview configuration type for `.storybook/preview.ts` in Astro projects.
 * Reflects the full type returned by `definePreview`, including addon type extensions.
 * Use this to annotate your preview module when needed:
 *
 * ```ts
 * import type { Preview } from '@storybook-astro/framework';
 * const preview: Preview = { ... };
 * export default preview;
 * ```
 */
export type Preview<Addons extends PreviewAddon<never>[] = []> = CsfPreview<AstroRenderer & InferTypes<Addons>>;

// Export portable stories functionality
export {
  composeStories,
  composeStory,
  setProjectAnnotations,
  type AstroRenderer
} from './portable-stories.ts';

// Export framework types
export type {
  FrameworkOptions,
  RenderMode,
  RenderStoryInput,
  ServerBuildOptions,
  SanitizationOptions,
  StoryRulesOptions,
  StorybookConfig
} from './types.ts';

// Preview configuration helper
export function definePreview<Addons extends PreviewAddon<never>[] = []>(
  input: ProjectAnnotations<AstroRenderer> & { addons?: Addons }
): CsfPreview<AstroRenderer & InferTypes<Addons>> {
  // Kick off the renderer load eagerly so the impl is ready by the time
  // Storybook calls renderToCanvas — but don't await, so this stays sync.
  // Only do this in a browser: the renderer's entry-preview imports browser-only
  // modules (and the `virtual:storybook-astro-renderer` graph) that aren't
  // available when `.storybook/preview.ts` is evaluated under Node during build
  // prerendering. renderToCanvas never runs there, and the browser path still
  // loads the renderer lazily via `composedRenderToCanvas`.
  if (typeof document !== 'undefined') {
    void loadRendererEntryPreview();
  }

  return definePreviewBase<AstroRenderer, Addons>({
    ...input,
    // CSF-factory stories compose only this `definePreview` chain — they never
    // see the renderer's entry-preview annotation that carries our default
    // parameters (e.g. the Docs story height). Merge those defaults here, under
    // the user's parameters so their overrides still win.
    parameters: combineParameters(defaultPreviewParameters, {
      renderer: 'astro' as const,
      ...input.parameters
    }),
    render: input.render ?? composedRender,
    renderToCanvas: input.renderToCanvas ?? composedRenderToCanvas,
    applyDecorators: input.applyDecorators ?? applyDecorators
  });
}
