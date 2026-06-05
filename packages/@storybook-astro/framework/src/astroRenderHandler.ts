import type { experimental_AstroContainer as AstroContainer } from 'astro/container';
import type { SanitizationOptions } from './lib/sanitization.ts';
import { resolveSanitizationOptions, sanitizeRenderPayload } from './lib/sanitization.ts';
import { reviveDateStrings } from './lib/revive-dates.ts';
import { runWithStoryRules, type ResolveRulesConfigModule } from './storyRulesRuntime.ts';
import type { RenderStoryInput } from './types.ts';

type AstroCreateResult = {
  createAstro?: (...args: unknown[]) => unknown;
};

type AstroComponentFactory = ((
  result: AstroCreateResult,
  props: unknown,
  slots: unknown
) => unknown) & {
  isAstroComponentFactory?: boolean;
  moduleId?: string;
  propagation?: unknown;
};

export type HandlerProps = {
  component: string;
  args?: Record<string, unknown>;
  slots?: Record<string, unknown>;
  story?: RenderStoryInput;
};

type CreateAstroRenderHandlerOptions = {
  container: Awaited<ReturnType<typeof AstroContainer.create>>;
  sanitization?: SanitizationOptions;
  rulesConfigFilePath?: string;
  resolveRulesConfigModule?: ResolveRulesConfigModule;
  loadModule: (id: string) => Promise<{ default: unknown }>;
  invalidateModuleGraph?: () => void;
};

export function createAstroRenderHandler(options: CreateAstroRenderHandlerOptions) {
  const sanitizationOptions = resolveSanitizationOptions(options.sanitization);
  const componentCache = new Map<string, Promise<AstroComponentFactory>>();
  let renderQueue = Promise.resolve<void>(undefined);

  async function loadPatchedComponent(componentId: string, useCache = true) {
    if (!useCache) {
      const { default: component } = await options.loadModule(componentId);

      return patchCreateAstroCompat(component);
    }

    if (!componentCache.has(componentId)) {
      componentCache.set(
        componentId,
        (async () => {
          const { default: component } = await options.loadModule(componentId);

          return patchCreateAstroCompat(component);
        })()
      );
    }

    const cachedComponent = componentCache.get(componentId);

    if (!cachedComponent) {
      throw new Error(`Failed to load Astro component: ${componentId}`);
    }

    try {
      return await cachedComponent;
    } catch (error) {
      componentCache.delete(componentId);
      throw error;
    }
  }

  return async function handler(data: HandlerProps) {
    const executeRender = async () => {
      return runWithStoryRules(
        {
          story: data.story,
          rulesConfigFilePath: options.rulesConfigFilePath,
          resolveRulesConfigModule: options.resolveRulesConfigModule,
          invalidateModuleGraph: options.invalidateModuleGraph
        },
        async (selectedRules) => {
          const patchedComponent = await loadPatchedComponent(
            data.component,
            selectedRules.moduleMocks.size === 0
          );
          const processedArgs = await processImageMetadata(data.args ?? {});
          const revivedArgs = reviveDateStrings(processedArgs);
          const sanitizedPayload = sanitizeRenderPayload(
            {
              args: revivedArgs,
              slots: data.slots ?? {}
            },
            sanitizationOptions
          );

          return options.container.renderToString(
            patchedComponent as Parameters<typeof options.container.renderToString>[0],
            {
              props: sanitizedPayload.args,
              slots: sanitizedPayload.slots
            }
          );
        }
      );
    };

    const resultPromise = renderQueue.then(executeRender, executeRender);

    renderQueue = resultPromise.then(
      () => undefined,
      () => undefined
    );

    return resultPromise;
  };
}

export function patchCreateAstroCompat(component: unknown): AstroComponentFactory {
  if (typeof component !== 'function') {
    throw new Error('Expected Astro component factory to be a function.');
  }

  const originalComponent = component as AstroComponentFactory;
  const wrapped = ((result: AstroCreateResult, props: unknown, slots: unknown) => {
    if (result && typeof result.createAstro === 'function') {
      const originalCreateAstro = result.createAstro;
      const runtimeExpectsAstroGlobal = originalCreateAstro.length >= 3;

      result.createAstro = (...args: unknown[]) => {
        if (args.length === 3 && !runtimeExpectsAstroGlobal) {
          return originalCreateAstro(args[1], args[2]);
        }

        return originalCreateAstro(...args);
      };
    }

    return originalComponent(result, props, slots);
  }) as AstroComponentFactory;

  wrapped.isAstroComponentFactory = originalComponent.isAstroComponentFactory;
  wrapped.moduleId = originalComponent.moduleId;
  wrapped.propagation = originalComponent.propagation;

  return wrapped;
}

async function processImageMetadata(
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const processed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (isImageMetadata(value)) {
      // Keep ImageMetadata as an object so Astro's image pipeline still
      // recognizes it as an imported image and skips local path validation.
      processed[key] = value;

      continue;
    }

    if (Array.isArray(value)) {
      processed[key] = await Promise.all(
        value.map(async (item) => {
          if (isImageMetadata(item)) {
            return item;
          }

          if (isRecord(item)) {
            return processImageMetadata(item);
          }

          return item;
        })
      );

      continue;
    }

    if (isRecord(value)) {
      processed[key] = await processImageMetadata(value);

      continue;
    }

    processed[key] = value;
  }

  return processed;
}

function isImageMetadata(value: unknown): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    typeof value.src === 'string' &&
    ('width' in value || 'height' in value || 'format' in value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
