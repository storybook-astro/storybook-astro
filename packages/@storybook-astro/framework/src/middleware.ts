import { pathToFileURL } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import type { Integration } from './integrations/index.ts';
import { installPassthroughImageService } from './lib/passthrough-image-service.ts';
import type { SanitizationOptions } from './lib/sanitization.ts';
import { resolveSanitizationOptions, sanitizeRenderPayload } from './lib/sanitization.ts';
import { resolveStoryModuleMock, withStoryModuleMocks } from './module-mocks.ts';
import { selectStoryRules, withStoryRuleCleanups } from './rules.ts';
import type { RenderStoryInput } from './types.ts';
import { addRenderers, resolveClientModules } from 'virtual:astro-container-renderers';

type ResolveRulesConfigModule = () => unknown | Promise<unknown>;

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

type HandlerFactoryOptions = {
  sanitization?: SanitizationOptions;
  rulesConfigFilePath?: string;
  resolveRulesConfigModule?: ResolveRulesConfigModule;
  loadModule?: (id: string) => Promise<{ default: unknown }>;
};

export async function handlerFactory(_integrations: Integration[], options?: HandlerFactoryOptions) {
  // Inject a passthrough image service before any component renders. See
  // `lib/passthrough-image-service.ts` for why this is necessary.
  installPassthroughImageService();

  const container = await AstroContainer.create({
    // Somewhat hacky way to force client-side Storybook's Vite to resolve modules properly
    resolve: async (specifier) => {
      const mockedModule = resolveStoryModuleMock(specifier);

      if (mockedModule) {
        return mockedModule;
      }

      if (specifier.startsWith('astro:scripts')) {
        return `/@id/${specifier}`;
      }

      const resolution = resolveClientModules(specifier);

      if (resolution) {
        return resolution;
      }

      return specifier;
    }
  });

  addRenderers(container);
  const sanitizationOptions = resolveSanitizationOptions(options?.sanitization);
  const loadModule =
    options?.loadModule ??
    ((id: string) => {
      const normalizedId = /^[a-zA-Z]:[/\\]/.test(id) ? pathToFileURL(id).href : id;

      return import(/* @vite-ignore */ normalizedId);
    });
  const componentCache = new Map<string, Promise<AstroComponentFactory>>();
  let renderQueue = Promise.resolve<void>(undefined);

  async function loadPatchedComponent(componentId: string, useCache = true) {
    if (!useCache) {
      const { default: component } = await loadModule(componentId);

      return patchCreateAstroCompat(component);
    }

    if (!componentCache.has(componentId)) {
      componentCache.set(componentId, (async () => {
        const { default: component } = await loadModule(componentId);

        return patchCreateAstroCompat(component);
      })());
    }

    const cachedComponent = componentCache.get(componentId);

    if (!cachedComponent) {
      throw new Error(`Failed to load Astro component: ${componentId}`);
    }

    try {
      return await cachedComponent;
    } catch (error) {
      // Drop failed entries so transient/module errors can recover on the next request.
      componentCache.delete(componentId);
      throw error;
    }
  }

  return async function handler(data: HandlerProps) {
    const executeRender = async () => {
      const rulesConfigModule = options?.resolveRulesConfigModule
        ? await options.resolveRulesConfigModule()
        : undefined;

      const selectedRules = await selectStoryRules({
        configModule: rulesConfigModule,
        configFilePath: options?.rulesConfigFilePath,
        story: data.story
      });

      return withStoryRuleCleanups(selectedRules.cleanups, async () => {
        return withStoryModuleMocks(selectedRules.moduleMocks, async () => {
          const patchedComponent = await loadPatchedComponent(
            data.component,
            selectedRules.moduleMocks.size === 0
          );
          const processedArgs = await processImageMetadata(data.args ?? {});
          const sanitizedPayload = sanitizeRenderPayload(
            {
              args: processedArgs,
              slots: data.slots ?? {}
            },
            sanitizationOptions
          );

          return container.renderToString(
            patchedComponent as Parameters<typeof container.renderToString>[0],
            {
              props: sanitizedPayload.args,
              slots: sanitizedPayload.slots
            }
          );
        });
      });
    };

    const resultPromise = renderQueue.then(executeRender, executeRender);

    renderQueue = resultPromise.then(
      () => undefined,
      () => undefined
    );

    return resultPromise;
  };
}

function patchCreateAstroCompat(component: unknown): AstroComponentFactory {
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
      // Keep ImageMetadata as a plain object — Astro's image service checks
      // isESMImportedImage (typeof src === 'object') and skips the /@fs/ string
      // validation that throws LocalImageUsedWrongly. Converting to a URL string
      // causes that error when the string starts with /@fs/.
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
