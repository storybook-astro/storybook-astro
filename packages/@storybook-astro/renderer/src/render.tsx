import { simulateDOMContentLoaded, simulatePageLoad } from 'storybook/internal/preview-api';
import type { ArgsStoryFn, Renderer, RenderContext, StoryContext } from 'storybook/internal/types';
import { dedent } from 'ts-dedent';
import 'astro:scripts/page.js';
import type { AstroComponentFactory, AstroRenderer, SlotValue } from './types';
import { serializeAstroComponentMarkers } from './astroComponentMarker';
import * as astroRenderer from 'virtual:storybook-astro-renderer';
import * as renderers from 'virtual:storybook-renderer-fallback';

type FallbackRenderer = {
  render: (args: Record<string, unknown>, context: StoryContext<Renderer>) => unknown;
  renderToCanvas: (ctx: RenderContext<Renderer>, canvasElement: HTMLElement) => void | Promise<void>;
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

// Tracks the renderer used in the previous renderToCanvas call so we can detect
// framework switches and clear the canvas before the new framework mounts.
let activeRenderer: string | undefined;

export async function renderToCanvas(
  ctx: RenderContext<AstroRenderer>,
  canvasElement: HTMLElement
): Promise<void> {
  const { storyFn, kind, name, showMain, showError, forceRemount, storyContext } = ctx;
  const renderer = ctx.storyContext.parameters?.renderer as string | undefined;
  const typedRenderers = renderers as RendererRegistry;

  // When the framework changes, clear the canvas so the previous framework's DOM
  // doesn't stack alongside the new one. Same-framework rerenders are unaffected.
  if (renderer !== activeRenderer) {
    canvasElement.innerHTML = '';
  }
  activeRenderer = renderer;

  if (renderer && Object.hasOwn(typedRenderers, renderer)) {
    showMain();
    await typedRenderers[renderer].renderToCanvas(ctx, canvasElement);

    if (renderer === 'svelte') {
      astroRenderer.applyStyles?.();
    }

    return;
  }

  const element = storyFn();

  showMain();

  if (isAstroComponent(element)) {
    try {
      await renderAstroToCanvas(element, storyContext.args, canvasElement, storyContext);
    } catch (error) {
      if (isAstroServerUnavailableError(error)) {
        showError({
          title: 'Unable to reach Astro rendering server.',
          description: dedent`
            Storybook could not connect to the Astro rendering server, so this Astro story cannot be rendered.
            ${error.message}
          `
        });

        return;
      }

      throw error;
    }

    return;
  }

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
  element: AstroComponentFactory,
  args: Record<string, unknown>,
  canvasElement: HTMLElement,
  storyContext?: StoryContext<AstroRenderer>
): Promise<void> {
  if (!element.moduleId) {
    throw new Error('Astro component missing moduleId');
  }

  const { slots = {}, ...componentArgs } = args;

  const response = await astroRenderer.render({
    component: element.moduleId,
    args: serializeAstroComponentMarkers(componentArgs) as Record<string, unknown>,
    slots: serializeAstroComponentMarkers(slots) as Record<string, SlotValue>,
    story: storyContext
      ? {
          id: storyContext.id,
          title: storyContext.title,
          name: storyContext.name
        }
      : undefined
  });

  astroRenderer.applyStyles?.();
  canvasElement.innerHTML = prepareServerRenderedHtml(response.html, canvasElement.ownerDocument);
  invokeScriptTags(canvasElement);
}

/** Parses the server HTML response and hoists any stylesheet links into the iframe head. */
function prepareServerRenderedHtml(html: string, document: Document) {
  const template = document.createElement('template');

  template.innerHTML = html;

  // Server mode returns stylesheet links in the HTML response. Keep those in
  // the iframe head so controls rerenders can reuse them instead of refetching.
  syncServerRenderedStylesheets(template.content, document);

  return template.innerHTML;
}

/** Keeps server-rendered stylesheets in the iframe head across controls rerenders. */
function syncServerRenderedStylesheets(fragment: DocumentFragment, document: Document) {
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
      document.head.appendChild(nextLink);
    }

    link.remove();
  });

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
      const separator = src.includes('?') ? '&' : '?';

      newScript.setAttribute('src', `${src}${separator}sbAstroReload=${(scriptReloadToken += 1)}`);
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
