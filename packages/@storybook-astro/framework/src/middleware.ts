import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import type { Integration } from './integrations/index.ts';
import type { SanitizationOptions } from './lib/sanitization.ts';
import { resolveSanitizationOptions, sanitizeRenderPayload } from './lib/sanitization.ts';
import { addRenderers } from 'virtual:astro-container-renderers';

export type HandlerProps = {
  component: string;
  args?: Record<string, unknown>;
  slots?: Record<string, unknown>;
};

type HandlerFactoryOptions = {
  sanitization?: SanitizationOptions;
  loadModule?: (id: string) => Promise<{ default: any }>;
};

export async function handlerFactory(integrations: Integration[], options?: HandlerFactoryOptions) {
  const safeIntegrations = integrations ?? [];
  const container = await AstroContainer.create({
    // Somewhat hacky way to force client-side Storybook's Vite to resolve modules properly
    resolve: async (s) => {
      if (s.startsWith('astro:scripts')) {
        return `/@id/${s}`;
      }

      for (const integration of safeIntegrations) {
        const resolution = integration.resolveClient(s);

        if (resolution) {
          return resolution;
        }
      }

      return s;
    }
  });

  addRenderers(container);
  const sanitizationOptions = resolveSanitizationOptions(options?.sanitization);
  const loadModule = options?.loadModule ?? ((id: string) => import(/* @vite-ignore */ id));
  // Cache module load + compatibility patch to avoid repeating SSR module work per render.
  const componentCache = new Map<string, Promise<any>>();

  async function loadPatchedComponent(componentId: string) {
    if (!componentCache.has(componentId)) {
      componentCache.set(componentId, (async () => {
        const { default: Component } = await loadModule(componentId);

        return patchCreateAstroCompat(Component);
      })());
    }

    const cachedComponent = componentCache.get(componentId)!;

    try {
      return await cachedComponent;
    } catch (error) {
      // Drop failed entries so transient/module errors can recover on the next request.
      componentCache.delete(componentId);
      throw error;
    }
  }

  return async function handler(data: HandlerProps) {
    const patchedComponent = await loadPatchedComponent(data.component);

    // Process args to convert ImageMetadata objects to usable URLs
    const processedArgs = await processImageMetadata(data.args || {});

    const sanitizedPayload = sanitizeRenderPayload(
      {
        args: processedArgs,
        slots: data.slots ?? {}
      },
      sanitizationOptions
    );

    const result = await container.renderToString(patchedComponent, {
      props: sanitizedPayload.args,
      slots: sanitizedPayload.slots
    });

    return result;
  };
}

/**
 * Wraps an Astro component factory to bridge createAstro calling conventions when
 * Astro 6 runtime is paired with compiler output that still passes $$Astro.
 *
 * Astro 5 runtime defines createAstro($$Astro, $$props, $$slots) [3 params].
 * Astro 6 runtime defines createAstro($$props, $$slots) [2 params].
 * Some Astro 6 compiler output still calls with 3 args, so we strip $$Astro only
 * when the runtime expects 2 params.
 *
 * The wrapper intercepts the result object and patches its createAstro method to
 * handle both calling conventions.
 */
function patchCreateAstroCompat(Component: any): any {
  const wrapped = (result: any, props: any, slots: any) => {
    if (result && result.createAstro) {
      const origCreateAstro = result.createAstro;
      // Astro 5 runtime exposes createAstro with 3 params; Astro 6 exposes 2.
      // Using function arity lets us adapt without hard-coding Astro version checks.
      const runtimeExpectsAstroGlobal = origCreateAstro.length >= 3;

      result.createAstro = (...args: any[]) => {
        if (args.length === 3 && !runtimeExpectsAstroGlobal) {
          // Compiler v2 -> Astro 6 runtime: strip $$Astro.
          return origCreateAstro(args[1], args[2]);
        }

        // Matching convention: pass through unchanged.
        return origCreateAstro(...args);
      };
    }

    return Component(result, props, slots);
  };

  // Copy component factory metadata so the Container treats it as a valid Astro component
  wrapped.isAstroComponentFactory = Component.isAstroComponentFactory;
  wrapped.moduleId = Component.moduleId;
  wrapped.propagation = Component.propagation;

  return wrapped;
}

/**
 * Recursively processes arguments to convert ImageMetadata objects to usable image URLs.
 * This allows Astro's Image component to work properly in Storybook by converting
 * optimized asset references to direct file paths.
 */
async function processImageMetadata(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const processed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (isImageMetadata(value)) {
      // Convert ImageMetadata to a usable URL
      processed[key] = convertImageMetadataToUrl(value);
    } else if (Array.isArray(value)) {
      // Process arrays recursively
      processed[key] = await Promise.all(
        value.map(async (item) =>
          typeof item === 'object' && item !== null
            ? await processImageMetadata(item as Record<string, unknown>)
            : item
        )
      );
    } else if (typeof value === 'object' && value !== null) {
      // Process nested objects recursively
      processed[key] = await processImageMetadata(value as Record<string, unknown>);
    } else {
      processed[key] = value;
    }
  }

  return processed;
}

/**
 * Type guard to check if a value is an ImageMetadata object.
 * ImageMetadata objects typically have properties like src, width, height, format.
 */
function isImageMetadata(value: unknown): value is Record<string, any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'src' in value &&
    typeof (value as any).src === 'string' &&
    ('width' in value || 'height' in value || 'format' in value)
  );
}

/**
 * Converts an ImageMetadata object to a usable URL for Storybook.
 * In a Storybook environment, we use the raw file path instead of optimized URLs.
 */
function convertImageMetadataToUrl(imageMetadata: Record<string, any>): string {
  // For Storybook, use the raw src path which should be the file path
  // This bypasses Astro's image optimization which doesn't work in Storybook
  return imageMetadata.src || imageMetadata.fsPath || String(imageMetadata);
}
