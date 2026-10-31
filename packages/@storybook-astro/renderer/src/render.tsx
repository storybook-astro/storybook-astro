import { simulateDOMContentLoaded, simulatePageLoad } from 'storybook/internal/preview-api';
import type {
  ArgsStoryFn,
  Renderer,
  RenderContext,
  StoryContext,
  TeardownRenderToCanvas
} from 'storybook/internal/types';
import { dedent } from 'ts-dedent';
import 'astro:scripts/page.js';
import type { AstroComponentFactory, AstroComponentSlot, AstroRenderer, SlotValue } from './types';
import { serializeAstroComponentMarkers } from './astroComponentMarker';
import { isDecoratedTree } from './decoratedTree';
import {
  addStylesheetBeforeStoryStyles,
  moveStoryStylesToHead,
  removeStoryStyles
} from './storyStyles.ts';
import * as astroRenderer from 'virtual:storybook-astro-renderer';
import * as renderers from 'virtual:storybook-renderer-fallback';

type FallbackRenderer = {
  render: (args: Record<string, unknown>, context: StoryContext<Renderer>) => unknown;
  renderToCanvas: (
    ctx: RenderContext<Renderer>,
    canvasElement: HTMLElement
  ) => void | TeardownRenderToCanvas | Promise<void | TeardownRenderToCanvas>;
};

type RendererRegistry = Record<string, FallbackRenderer>;

export const render: ArgsStoryFn<AstroRenderer> = (args, context) => {
  const { id, component: Component } = context;
  const renderer = context.parameters?.renderer as string | undefined;
  const typedRenderers = renderers as RendererRegistry;

  if (renderer && Object.hasOwn(typedRenderers, renderer)) {
    return typedRenderers[renderer].render(args, context) as AstroRenderer['storyResult'];
  }

  if (!Component) {
    throw new Error(
      `Unable to render story ${id} as the component annotation is missing from the default export`
    );
  }

  if (typeof Component === 'string') {
    return replaceTemplatePlaceholders(Component, args);
  }

  if (Component instanceof HTMLElement) {
    return cloneElementWithArgs(Component, args);
  }

  if (typeof Component === 'function') {
    const astroComponent = Component as unknown as AstroComponentFactory;

    if (astroComponent.isAstroComponentFactory) {
      return astroComponent;
    }

    if (renderer) {
      throw new Error(
        `Renderer '${renderer}' not found. Available renderers: ${Object.keys(typedRenderers).join(', ')}`
      );
    }

    throw new Error(
      `Component appears to be a framework component but no renderer is specified. ` +
        `Add 'parameters: { renderer: "framework-name" }' to your story configuration.`
    );
  }

  console.warn(dedent`
    Storybook's Astro renderer only supports rendering Astro components, DOM elements, and strings.
    Received: ${typeof Component} - ${Component}
  `);

  throw new Error(`Unable to render story ${id} - unsupported component type`);
};

function replaceTemplatePlaceholders(template: string, args: Record<string, unknown>): string {
  let output = template;

  Object.entries(args).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;

    output = output.replace(new RegExp(placeholder, 'g'), String(value));
  });

  return output;
}

function cloneElementWithArgs(element: HTMLElement, args: Record<string, unknown>): HTMLElement {
  const output = element.cloneNode(true) as HTMLElement;

  Object.entries(args).forEach(([key, value]) => {
    output.setAttribute(key, typeof value === 'string' ? value : JSON.stringify(value));
  });

  return output;
}

// Tracks the renderer last used to render into a given canvas, so we can detect
// framework switches and clear that canvas before the new framework mounts.
// Keyed per canvas (not a single module global): the Docs page renders stories
// into their own canvases, and a global would let a Docs render of one framework
// suppress the cleanup when a different framework's story later reuses the shared
// story canvas — stacking two components until a reload.
const lastRendererByCanvas = new WeakMap<HTMLElement, string | undefined>();

// Each render into a canvas gets its own token. The latest token is the last
// render that started, and only it may write the server's response, so a slow
// response can't replace a newer story. The shown token is the Astro render on
// the canvas, if any, and an Astro teardown only clears the canvas while it
// still shows the teardown's own render. A Docs story block runs its teardown
// a microtask late, after the next render into the same canvas may have
// written, and that late teardown must leave the new story alone.
const latestRenderByCanvas = new WeakMap<HTMLElement, object>();
const shownRenderByCanvas = new WeakMap<HTMLElement, object>();

/** Clears an Astro render's markup and CSS, unless the canvas has moved on to another render. */
function teardownAstroRender(canvasElement: HTMLElement, renderToken: object): TeardownRenderToCanvas {
  return () => {
    if (shownRenderByCanvas.get(canvasElement) !== renderToken) {
      return;
    }

    shownRenderByCanvas.delete(canvasElement);
    clearAstroRender(canvasElement);
  };
}

/** The markup goes with its CSS, so the old story never shows unstyled while the next one renders. */
function clearAstroRender(canvasElement: HTMLElement) {
  removeStoryStyles(canvasElement);
  canvasElement.innerHTML = '';
}

export async function renderToCanvas(
  ctx: RenderContext<AstroRenderer>,
  canvasElement: HTMLElement
): Promise<void | TeardownRenderToCanvas> {
  const { storyFn, kind, name, showMain, showError, forceRemount, storyContext } = ctx;
  const renderer = ctx.storyContext.parameters?.renderer as string | undefined;
  const typedRenderers = renderers as RendererRegistry;

  // On the Docs page a story renders inside `.sbdocs-content`, whose typography
  // styles bleed into the rendered component (e.g. overriding an `<h2>`'s color).
  // Storybook exempts `.sb-unstyled` descendants from that typography, so tag the
  // canvas container with it in docs view to preserve each component's own look.
  canvasElement.classList.toggle('sb-unstyled', storyContext?.viewMode === 'docs');

  // When this canvas's framework changes, clear it so the previous framework's
  // DOM doesn't stack alongside the new one. Same-framework rerenders are
  // unaffected.
  if (renderer !== lastRendererByCanvas.get(canvasElement)) {
    canvasElement.innerHTML = '';
  }
  lastRendererByCanvas.set(canvasElement, renderer);

  const thisRender = {};

  if (renderer && Object.hasOwn(typedRenderers, renderer)) {
    latestRenderByCanvas.set(canvasElement, thisRender);

    // The canvas no longer shows an Astro render, so a late Astro teardown
    // leaves it alone, and this removes that render's CSS instead.
    shownRenderByCanvas.delete(canvasElement);
    removeStoryStyles(canvasElement);
    showMain();
    // The framework's teardown isn't returned yet, so its root stays mounted
    // until the next render of that framework into this canvas (#238).
    await typedRenderers[renderer].renderToCanvas(ctx, canvasElement);

    if (renderer === 'svelte') {
      astroRenderer.applyStyles?.();
    }

    return;
  }

  const element = storyFn();

  // Only once the story function succeeds, so a story that throws doesn't
  // make an earlier render's response look out of date.
  latestRenderByCanvas.set(canvasElement, thisRender);
  showMain();

  if (isAstroComponent(element) || isDecoratedTree(element)) {
    try {
      await renderAstroToCanvas(element, storyContext.args, canvasElement, thisRender, storyContext);
    } catch (error) {
      // Storybook keeps the last render's teardown when a render throws, and
      // that teardown no longer matches once this render has written, so
      // clean up here. A render that failed before writing leaves the canvas
      // to whichever render it shows, with the error shown over it.
      if (shownRenderByCanvas.get(canvasElement) === thisRender) {
        shownRenderByCanvas.delete(canvasElement);
        clearAstroRender(canvasElement);
      }

      // A newer render has taken over the canvas, so this one's error is
      // out of date and shouldn't show over the newer story.
      if (latestRenderByCanvas.get(canvasElement) === thisRender) {
        if (!isAstroServerUnavailableError(error)) {
          throw error;
        }

        showError({
          title: 'Unable to reach Astro rendering server.',
          description: dedent`
            Storybook could not connect to the Astro rendering server, so this Astro story cannot be rendered.
            ${error.message}
          `
        });
      }
    }

    // Storybook calls this when it removes the story: on navigation, on a
    // remount, for each story on a Docs page when the page goes, and at the
    // start of the next portable story run. It replaces the teardown Storybook
    // held, so when this render didn't write (a server error, or a newer
    // render took over) it clears whatever Astro render the canvas shows.
    const shownRender = shownRenderByCanvas.get(canvasElement);

    return shownRender && teardownAstroRender(canvasElement, shownRender);
  }

  // A story that rendered Astro before can return something else on a
  // rerender, and Storybook then drops the teardown that would remove its CSS.
  removeStoryStyles(canvasElement);
  shownRenderByCanvas.delete(canvasElement);

  if (typeof element === 'string') {
    canvasElement.innerHTML = element;
    simulatePageLoad(canvasElement);

    return;
  }

  if (element instanceof window.Node) {
    if (canvasElement.firstChild === element && !forceRemount) {
      return;
    }

    canvasElement.innerHTML = '';
    canvasElement.appendChild(element);
    simulateDOMContentLoaded();

    return;
  }

  canvasElement.innerHTML = '';
  showError({
    title: `Expecting an HTML snippet or DOM node from the story: "${name}" of "${kind}".`,
    description: dedent`
      Did you forget to return the HTML snippet from the story?
      Use "() => <your snippet or node>" or when defining the story.
    `
  });
}

function isAstroComponent(element: unknown): element is AstroComponentFactory {
  return (
    typeof element === 'function' &&
    element !== null &&
    'isAstroComponentFactory' in element &&
    (element as AstroComponentFactory).isAstroComponentFactory === true
  );
}

async function renderAstroToCanvas(
  element: AstroComponentFactory | AstroComponentSlot | SlotValue[],
  args: Record<string, unknown>,
  canvasElement: HTMLElement,
  renderToken: object,
  storyContext?: StoryContext<AstroRenderer>
): Promise<void> {
  // An undecorated story's root moduleId is `element` itself. A decorated tree
  // carries the story leaf somewhere inside it instead (wherever a decorator
  // placed `Story()`), so its moduleId comes from the story's own meta
  // component — set independently of decoration, same as the plain `render()`
  // path above.
  const rootComponent = isAstroComponent(element)
    ? element
    : (storyContext?.component as AstroComponentFactory | undefined);

  if (!rootComponent?.moduleId) {
    throw new Error('Astro component missing moduleId');
  }

  const { slots = {}, ...componentArgs } = args;
  const decoratedTree = isDecoratedTree(element) ? element : undefined;

  const response = await astroRenderer.render({
    component: rootComponent.moduleId,
    args: serializeAstroComponentMarkers(componentArgs) as Record<string, unknown>,
    slots: serializeAstroComponentMarkers(slots) as Record<string, SlotValue>,
    ...(decoratedTree ? { node: serializeAstroComponentMarkers(decoratedTree) as SlotValue } : {}),
    story: storyContext
      ? {
          id: storyContext.id,
          title: storyContext.title,
          name: storyContext.name
        }
      : undefined
  });

  // A newer render into this canvas started while this one waited on the
  // server, so this response is out of date.
  if (latestRenderByCanvas.get(canvasElement) !== renderToken) {
    return;
  }

  astroRenderer.applyStyles?.();
  canvasElement.innerHTML = prepareServerRenderedHtml(response.html, canvasElement, storyContext?.viewMode);
  shownRenderByCanvas.set(canvasElement, renderToken);
  invokeScriptTags(canvasElement);
}

/** Parses the server HTML response and hoists its stylesheet links and component CSS into the iframe head. */
function prepareServerRenderedHtml(html: string, canvasElement: HTMLElement, viewMode?: string) {
  const template = moveStoryStylesToHead(html, canvasElement);

  // Server mode returns stylesheet links in the HTML response. Keep those in
  // the iframe head so controls rerenders can reuse them instead of refetching.
  syncServerRenderedStylesheets(template.content, canvasElement.ownerDocument, viewMode);

  return template.innerHTML;
}

/**
 * Keeps server-rendered stylesheets in the iframe head across controls rerenders.
 *
 * In the Canvas (one story at a time) we drop links the current render no longer
 * uses, so a previous story's stylesheets don't linger. On a Docs page every
 * story renders into the *same* head, so dropping "stale" links would let each
 * story strip the others' stylesheets (e.g. CodeTabs' per-framework CSS) — there
 * we only add, letting all stories' stylesheets coexist.
 */
function syncServerRenderedStylesheets(
  fragment: DocumentFragment,
  document: Document,
  viewMode?: string
) {
  const nextHrefs = new Set<string>();
  const stylesheetLinks = Array.from(fragment.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));

  stylesheetLinks.forEach((link) => {
    const href = link.getAttribute('href');

    if (!href) {
      link.remove();

      return;
    }

    nextHrefs.add(href);

    if (!document.head.querySelector(`link[data-storybook-astro-style="${cssEscape(href)}"]`)) {
      const nextLink = document.createElement('link');

      Array.from(link.attributes).forEach((attribute) => {
        nextLink.setAttribute(attribute.name, attribute.value);
      });

      nextLink.setAttribute('data-storybook-astro-style', href);
      addStylesheetBeforeStoryStyles(nextLink, document);
    }

    link.remove();
  });

  // On a Docs page, multiple stories share one head — keep every story's
  // stylesheets. Only the single-story Canvas prunes links it no longer needs.
  if (viewMode === 'docs') {
    return;
  }

  Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[data-storybook-astro-style]')).forEach(
    (link) => {
      const href = link.getAttribute('data-storybook-astro-style');

      if (href && !nextHrefs.has(href)) {
        link.remove();
      }
    }
  );
}

/** Escapes one attribute value for use inside a CSS attribute selector. */
function cssEscape(value: string) {
  return value.replace(/(["\\])/g, '\\$1');
}

// Each story render re-injects the component's scripts. The browser executes a
// given module URL at most once per realm, so re-inserting an external module
// script (`<script type="module" src="…">` — what Astro compiles hoisted
// `<script>` blocks into) is a silent no-op on story navigation: client setup
// runs on the first view and never again until a full page reload. Bump a
// unique query on the src so the browser re-imports and re-runs it against the
// freshly rendered DOM. Inline and classic scripts already re-run on insertion.
let scriptReloadToken = 0;

function invokeScriptTags(element: HTMLElement) {
  Array.from<HTMLScriptElement>(element.querySelectorAll('script')).forEach((oldScript) => {
    const newScript = document.createElement('script');

    Array.from(oldScript.attributes).forEach((attribute) => {
      newScript.setAttribute(attribute.name, attribute.value);
    });

    const src = newScript.getAttribute('src');

    if (src && newScript.type === 'module') {
      // The token goes first in the query: a processed Astro script's URL ends
      // in `&lang.ts`, and Vite only compiles it as TypeScript while that stays
      // the last parameter (issue #187).
      const token = `sbAstroReload=${(scriptReloadToken += 1)}`;
      const queryStart = src.indexOf('?');

      newScript.setAttribute(
        'src',
        queryStart === -1
          ? `${src}?${token}`
          : `${src.slice(0, queryStart)}?${token}&${src.slice(queryStart + 1)}`
      );
    }

    newScript.appendChild(document.createTextNode(oldScript.innerHTML));
    oldScript.parentNode?.replaceChild(newScript, oldScript);
  });
}

function isAstroServerUnavailableError(error: unknown): error is Error {
  if (!(error instanceof Error)) {
    return false;
  }

  return (
    error.name === 'AstroRenderServerUnavailableError' ||
    error.message.includes('Unable to reach Astro rendering server')
  );
}

(function initializeAstroRenderer() {
  if ('Alpine' in window && window.Alpine && !window.Alpine._isStarted) {
    window.Alpine.start();
  }

  astroRenderer.init?.();
})();
