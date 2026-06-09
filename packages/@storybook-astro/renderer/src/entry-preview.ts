// import 'astro:runtime/server/astro-island';

// `./render.tsx` statically imports Vite virtual modules (`virtual:storybook-*`
// and `astro:scripts/page.js`) and the configured framework integrations (e.g.
// Alpine.js). Pulling that chain happens at module-load time, which would
// otherwise crash any non-preview consumer that just imports
// `@storybook-astro/renderer/entry-preview` for its `renderToCanvas`/`render`
// symbols (notably the framework's main entry, which is loaded by Vitest setup
// files in plain Node — no `MutationObserver` for Alpine, etc.).
//
// Loading is deferred to first-call so the preview iframe (where the virtuals
// resolve) still works the same, but importing this file in a Node test process
// is side-effect-free.
import type * as RenderModule from './render.tsx';

type RenderImpl = typeof RenderModule;
let implPromise: Promise<RenderImpl> | undefined;

function loadImpl(): Promise<RenderImpl> {
  implPromise ??= import('./render.tsx');

  return implPromise;
}

export const parameters = { renderer: 'astro' as const };

export const render: RenderImpl['render'] = async (args, context) => {
  const impl = await loadImpl();

  return impl.render(args, context);
};

export const renderToCanvas: RenderImpl['renderToCanvas'] = async (context, canvasElement) => {
  const impl = await loadImpl();

  return impl.renderToCanvas(context, canvasElement);
};
