import { pathToFileURL } from 'node:url';
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import type { Integration } from './integrations/index.ts';
import type { SanitizationOptions } from './lib/sanitization.ts';
import { resolveSanitizationOptions, sanitizeRenderPayload } from './lib/sanitization.ts';
import { resolveStoryModuleMock, withStoryModuleMocks } from './module-mocks.ts';
import { applyMswHandlers } from './msw.ts';
import { selectStoryRules } from './rules.ts';
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
  mode?: 'development' | 'production';
  sanitization?: SanitizationOptions;
  rulesConfigFilePath?: string;
  resolveRulesConfigModule?: ResolveRulesConfigModule;
  loadModule?: (id: string) => Promise<{ default: unknown }>;
};

export async function handlerFactory(_integrations: Integration[], options?: HandlerFactoryOptions) {
  const mode = options?.mode ?? 'development';
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
        mode,
        story: data.story
      });

      await applyMswHandlers(selectedRules.mswHandlers);

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

        return container.renderToString(patchedComponent, {
          props: sanitizedPayload.args,
          slots: sanitizedPayload.slots
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
      processed[key] = convertImageMetadataToUrl(value);

      continue;
    }

    if (Array.isArray(value)) {
      processed[key] = await Promise.all(
        value.map(async (item) => {
          if (isImageMetadata(item)) {
            return convertImageMetadataToUrl(item);
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

function convertImageMetadataToUrl(imageMetadata: Record<string, unknown>): string {
  const src = imageMetadata.src;
  const fsPath = imageMetadata.fsPath;

  if (typeof src === 'string') {
    return src;
  }

  if (typeof fsPath === 'string') {
    return fsPath;
  }

  return String(imageMetadata);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
