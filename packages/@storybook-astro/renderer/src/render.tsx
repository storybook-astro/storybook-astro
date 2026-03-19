import { simulateDOMContentLoaded, simulatePageLoad } from 'storybook/internal/preview-api';
import type { ArgsStoryFn, Renderer, RenderContext, StoryContext } from 'storybook/internal/types';
import { dedent } from 'ts-dedent';
import 'astro:scripts/page.js';
import type { AstroComponentFactory, AstroRenderer, RenderComponentInput, RenderPromise, RenderResponseMessage } from './types';
import * as renderers from 'virtual:storybook-renderer-fallback';

type FallbackRenderer = {
  render: (args: Record<string, unknown>, context: StoryContext<Renderer>) => unknown;
  renderToCanvas: (ctx: RenderContext<Renderer>, canvasElement: HTMLElement) => void | Promise<void>;
};

type RendererRegistry = Record<string, FallbackRenderer>;
type ViteHot = {
  send?: (event: string, data: unknown) => void;
  on?: (event: string, cb: (payload: unknown) => void) => void;
};

function getViteHot(): ViteHot | undefined {
  const meta = import.meta as ImportMeta & { hot?: ViteHot };

  return meta.hot;
}

// Cache for pending Astro component render requests
const messages = new Map<string, RenderPromise>();
const PRERENDERED_STORIES_FILE = 'astro-prerendered-stories.json';
let prerenderedStoriesPromise: Promise<Record<string, string>> | undefined;

/**
 * Renders a Storybook story component with appropriate handling for different component types.
 * 
 * This function serves as the main entry point for rendering components in Storybook's canvas.
 * It handles framework-specific renderers, Astro components, HTML elements, and function components.
 * 
 * @param args - The story arguments/props
 * @param context - Storybook render context containing component and metadata
 * @returns Rendered component or element
 */
export const render: ArgsStoryFn<AstroRenderer> = (args, context) => {
  const { id, component: Component } = context;
  const renderer = context.parameters?.renderer as string | undefined;
  const typedRenderers = renderers as RendererRegistry;

  // Delegate to framework-specific renderers (React, Vue, Solid, etc.)
  // The cast is safe: delegated results are consumed by the matching framework's renderToCanvas,
  // not by the Astro renderer pipeline.
  if (renderer && Object.hasOwn(typedRenderers, renderer)) {
    return typedRenderers[renderer].render(args, context) as AstroRenderer['storyResult'];
  }

  // Validate component exists
  if (!Component) {
    throw new Error(
      `Unable to render story ${id} as the component annotation is missing from the default export`
    );
  }

  // Handle string templates with placeholder substitution
  if (typeof Component === 'string') {
    return replaceTemplatePlaceholders(Component, args);
  }

  // Handle HTML elements by cloning and setting attributes
  if (Component instanceof HTMLElement) {
    return cloneElementWithArgs(Component, args);
  }

  // Handle function components (including Astro components)
  if (typeof Component === 'function') {
    const astroComponent = Component as unknown as AstroComponentFactory;
    
    // Return Astro components as-is for server-side rendering
    if (astroComponent.isAstroComponentFactory) {
      return astroComponent;
    }

    // If we have a renderer parameter but didn't delegate above, the renderer may not be loaded correctly
    if (renderer) {
      throw new Error(
        `Renderer '${renderer}' not found. Available renderers: ${Object.keys(typedRenderers).join(', ')}`
      );
    }

    // If we reach here without a renderer, this is a plain function component
    // For framework components, a renderer parameter should be specified
    throw new Error(
      `Component appears to be a framework component but no renderer is specified. ` +
      `Add 'parameters: { renderer: "framework-name" }' to your story configuration.`
    );
  }

  // Unsupported component type
  console.warn(dedent`
    Storybook's Astro renderer only supports rendering Astro components, DOM elements, and strings.
    Received: ${typeof Component} - ${Component}
  `);
  throw new Error(`Unable to render story ${id} - unsupported component type`);
};

/**
 * Replaces template placeholders in a string with corresponding argument values.
 * Placeholders follow the format {{key}} where key matches an argument name.
 * 
 * @param template - String template with {{key}} placeholders
 * @param args - Arguments object with replacement values
 * @returns String with placeholders replaced
 */
function replaceTemplatePlaceholders(template: string, args: Record<string, unknown>): string {
  let output = template;
  
  Object.entries(args).forEach(([key, value]) => {
    const placeholder = `{{${key}}}`;
    const replacement = String(value);

    output = output.replace(new RegExp(placeholder, 'g'), replacement);
  });
  
  return output;
}

/**
 * Clones an HTML element and sets attributes based on the provided arguments.
 * Non-string values are JSON-stringified before being set as attributes.
 * 
 * @param element - HTMLElement to clone
 * @param args - Arguments to set as attributes
 * @returns Cloned element with attributes set
 */
function cloneElementWithArgs(element: HTMLElement, args: Record<string, unknown>): HTMLElement {
  const output = element.cloneNode(true) as HTMLElement;
  
  Object.entries(args).forEach(([key, value]) => {
    const attributeValue = typeof value === 'string' ? value : JSON.stringify(value);

    output.setAttribute(key, attributeValue);
  });
  
  return output;
}

/**
 * Renders a story component to the Storybook canvas element.
 * Handles different types of rendered elements including Astro components,
 * strings, DOM nodes, and framework-specific components.
 */
export async function renderToCanvas(
  ctx: RenderContext<AstroRenderer>,
  canvasElement: HTMLElement
): Promise<void> {
  const { storyFn, kind, name, showMain, showError, forceRemount, storyContext } = ctx;
  const renderer = ctx.storyContext.parameters?.renderer as string | undefined;
  const typedRenderers = renderers as RendererRegistry;

  // Delegate to framework-specific renderers BEFORE calling storyFn().
  // Framework renderers (React, Solid, Vue, etc.) manage their own reactive
  // roots and call storyFn() internally. Calling storyFn() here first would
  // create orphaned reactive effects that corrupt the framework's state.
  if (renderer && Object.hasOwn(typedRenderers, renderer)) {
    showMain();
    await typedRenderers[renderer].renderToCanvas(ctx, canvasElement);
    // Apply Vite styles for frameworks that need it (Svelte)
    // Vue handles its own styles and this interferes with its CSS processing
    if (renderer === 'svelte') {
      applyAstroStyles();
    }

    return;
  }

  const element = storyFn();

  showMain();

  // Handle Astro components with server-side rendering
  if (isAstroComponent(element)) {
    await renderAstroToCanvas(element, storyContext.args, canvasElement, storyContext);

    return;
  }

  // Handle string content
  if (typeof element === 'string') {
    renderStringToCanvas(element, canvasElement);

    return;
  }

  // Handle DOM nodes
  if (element instanceof window.Node) {
    renderNodeToCanvas(element, canvasElement, forceRemount);

    return;
  }

  // Unsupported element type
  showError({
    title: `Expecting an HTML snippet or DOM node from the story: "${name}" of "${kind}".`,
    description: dedent`
      Did you forget to return the HTML snippet from the story?
      Use "() => <your snippet or node>" or when defining the story.
    `
  });
}

/**
 * Type guard to check if an element is an Astro component.
 */
function isAstroComponent(element: unknown): element is AstroComponentFactory {
  const result = (
    typeof element === 'function' &&
    element !== null &&
    'isAstroComponentFactory' in element &&
    (element as AstroComponentFactory).isAstroComponentFactory === true
  );

  return result;
}

/**
 * Renders an Astro component to the canvas using server-side rendering.
 *
 * In static builds, uses pre-rendered HTML from astro-prerendered-stories.json.
 */
async function renderAstroToCanvas(
  element: AstroComponentFactory,
  args: Record<string, unknown>,
  canvasElement: HTMLElement,
  storyContext?: StoryContext<AstroRenderer>
): Promise<void> {
  const hot = getViteHot();

  if (!hot) {
    const prerenderedHtml = await resolvePrerenderedStoryHtml(
      storyContext?.id,
      storyContext?.parameters?.__astroPrerendered
    );

    if (prerenderedHtml) {
      canvasElement.innerHTML = prerenderedHtml;
      activateScriptTags(canvasElement);

      return;
    }
  }

  if (!element.moduleId) {
    throw new Error('Astro component missing moduleId');
  }

  const { slots = {}, ...componentArgs } = args;
  const { html } = await renderAstroComponent({
    component: element.moduleId,
    args: componentArgs,
    slots: slots as Record<string, string>,
    story: storyContext
      ? {
          id: storyContext.id,
          title: storyContext.title,
          name: storyContext.name
        }
      : undefined
  });

  applyAstroStyles();
  canvasElement.innerHTML = html;
  activateScriptTags(canvasElement);
}

/**
 * Renders string content to the canvas.
 */
function renderStringToCanvas(content: string, canvasElement: HTMLElement): void {
  canvasElement.innerHTML = content;
  simulatePageLoad(canvasElement);
}

/**
 * Renders a DOM node to the canvas.
 */
function renderNodeToCanvas(
  element: Node,
  canvasElement: HTMLElement,
  forceRemount: boolean
): void {
  // Skip if same element and no remount needed
  if (canvasElement.firstChild === element && !forceRemount) {
    return;
  }

  canvasElement.innerHTML = '';
  canvasElement.appendChild(element);
  simulateDOMContentLoaded();
}

/**
 * Applies Astro-specific styles by executing dynamically generated style scripts.
 * This handles Vite's style injection for Astro components.
 */
function applyAstroStyles(): void {
  const viteStyleElements = document.querySelectorAll('style[data-vite-dev-id]');
  
  Array.from(viteStyleElements)
    .filter((el) => /__vite__updateStyle/.test(el.innerHTML))
    .forEach((styleElement) => {
      const script = document.createElement('script');

      script.type = 'module';
      
      const safeScriptContent = styleElement.innerHTML
        .replaceAll('import.meta.hot.accept(', 'import.meta.hot?.accept(')
        .replaceAll('import.meta.hot.prune(', 'import.meta.hot?.prune(');
      
      script.appendChild(document.createTextNode(safeScriptContent));
      
      // Execute and remove immediately
      document.head.appendChild(script);
      document.head.removeChild(script);
    });
}

/**
 * Activates script tags within a container by replacing them with executable versions.
 * This is necessary because innerHTML doesn't execute scripts for security reasons.
 */
function activateScriptTags(container: HTMLElement): void {
  const scriptElements = container.querySelectorAll('script') as NodeListOf<HTMLScriptElement>;
  
  Array.from(scriptElements).forEach((oldScript: HTMLScriptElement) => {
    const newScript = document.createElement('script');
    
    // Copy all attributes
    Array.from(oldScript.attributes).forEach((attr: Attr) => {
      newScript.setAttribute(attr.name, attr.value);
    });
    
    // Copy script content
    newScript.appendChild(document.createTextNode(oldScript.innerHTML));
    
    // Replace old script with new executable one
    oldScript.parentNode?.replaceChild(newScript, oldScript);
  });
}


/**
 * Renders an Astro component using server-side rendering via Vite HMR communication.
 *
 * @param data - Component render request data
 * @param timeoutMs - Maximum time to wait for rendering (default: 5000ms)
 * @returns Promise that resolves with the rendered HTML
 */
async function renderAstroComponent(
  data: RenderComponentInput, 
  timeoutMs = 5000
): Promise<RenderResponseMessage['data']> {
  // In static builds, import.meta.hot is undefined — no dev server to handle SSR.
  const hot = getViteHot();

  if (!hot) {
    return {
      id: 'static-build',
      html:
        '<div style="padding: 20px; border: 2px dashed #8b8b8b; border-radius: 8px; ' +
        'text-align: center; color: #6b6b6b; font-family: system-ui, sans-serif; ' +
        'background: #f8f8f8">' +
        '<p style="margin: 0 0 8px; font-size: 16px; font-weight: 600">' +
        'Astro Component</p>' +
        '<p style="margin: 0; font-size: 13px">' +
        'Astro components require server-side rendering and cannot be displayed ' +
        'in a static build. Run <code style="background: #e8e8e8; padding: 2px 6px; ' +
        'border-radius: 3px">storybook dev</code> for interactive rendering.</p>' +
        '</div>'
    };
  }

  const id = crypto.randomUUID();

  const promise = new Promise<RenderResponseMessage['data']>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      messages.delete(id);
      reject(new Error(`Astro component render request ${id} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    messages.set(id, { resolve, reject, timeoutId });
  });

  // Send render request via Vite HMR
  hot.send?.('astro:render:request', { ...data, id });

  return promise;
}

/**
 * Initializes the Astro renderer with Alpine.js support and Vite HMR listeners.
 * This IIFE sets up the necessary event handlers for hot module replacement
 * and handles Alpine.js initialization for interactive components.
 */
(function initializeAstroRenderer(): void {
  // Initialize Alpine.js if present
  initializeAlpineJS();
  
  // Set up Vite HMR listeners for style updates and component rendering
  setupViteHMRListeners();
})();

/**
 * Initializes Alpine.js if it's available in the window.
 */
function initializeAlpineJS(): void {
  if ('Alpine' in window && window.Alpine) {
    // Only start Alpine if it hasn't been started yet
    if (!window.Alpine._isStarted) {
      window.Alpine.start();
    }
  }
}

/**
 * Sets up Vite HMR listeners for handling style updates and Astro component responses.
 */
function setupViteHMRListeners(): void {
  // Listen for Vite updates to refresh Astro styles
  const hot = getViteHot();

  hot?.on?.('vite:afterUpdate', (payload: unknown) => {
    const typedPayload = payload as { updates?: Array<{ path: string }> };
    const hasAstroStyleUpdates = (typedPayload.updates ?? []).some((update) => 
      isAstroStyleUpdate(update.path)
    );
    
    if (hasAstroStyleUpdates) {
      applyAstroStyles();
    }
  });

  // Listen for Astro component render responses
  hot?.on?.('astro:render:response', (payload: unknown) => {
    const data = payload as RenderResponseMessage['data'];
    const pendingRequest = messages.get(data.id);
    
    if (pendingRequest) {
      const { resolve, timeoutId } = pendingRequest;
      
      // Clean up and resolve
      clearTimeout(timeoutId);
      messages.delete(data.id);
      resolve(data);
    }
  });
}

/**
 * Checks if a file path represents an Astro style update that needs processing.
 * 
 * @param path - File path from Vite update
 * @returns True if this is an Astro style file that needs reprocessing
 */
function isAstroStyleUpdate(path: string): boolean {
  // Match Astro style files: *.astro?astro&type=style&index=0&lang.css
  return /\.astro\?astro&type=style&index=\d+&lang\.(css|scss|sass|less|stylus)$/.test(path);
}

async function resolvePrerenderedStoryHtml(storyId: string | undefined, fallbackHtml: unknown) {
  if (typeof fallbackHtml === 'string') {
    return fallbackHtml;
  }

  if (!storyId) {
    throw new Error('Astro static renderer expected a story id, but none was provided.');
  }

  const prerenderedStories = await loadPrerenderedStories();
  const html = prerenderedStories[storyId];

  if (html === undefined) {
    throw new Error(
      `No prerendered HTML was found for story "${storyId}". Rebuild Storybook static output.`
    );
  }

  return html;
}

async function loadPrerenderedStories() {
  if (!prerenderedStoriesPromise) {
    const jsonPath = resolvePrerenderedStoriesUrl();

    prerenderedStoriesPromise = fetch(jsonPath).then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to load ${PRERENDERED_STORIES_FILE}. Received ${response.status} ${response.statusText}.`
        );
      }

      return (await response.json()) as Record<string, string>;
    });
  }

  return prerenderedStoriesPromise;
}

function resolvePrerenderedStoriesUrl() {
  return new URL(PRERENDERED_STORIES_FILE, window.location.href).toString();
}
