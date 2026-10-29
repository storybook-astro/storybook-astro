import type { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { markHTMLString } from 'astro/runtime/server/index.js';
import { isAstroComponentFactory, type SlotValue } from '@storybook-astro/renderer/types';
import type { ResolvedSanitizationOptions, SanitizationOptions } from './lib/sanitization.ts';
import { resolveSanitizationOptions, sanitizeArgs, sanitizeRenderPayload } from './lib/sanitization.ts';
import { reviveDateStrings } from './lib/revive-dates.ts';
import {
  assertValidSlotValue,
  reconstructProps,
  reconstructSlots
} from './lib/reconstruct-component-args.ts';
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
  /** A decorator tree to resolve around the story (Decorator Support, Step 3). */
  node?: SlotValue;
  story?: RenderStoryInput;
};

type CreateAstroRenderHandlerOptions = {
  container: Awaited<ReturnType<typeof AstroContainer.create>>;
  sanitization?: SanitizationOptions;
  rulesConfigFilePath?: string;
  resolveRulesConfigModule?: ResolveRulesConfigModule;
  loadModule: (id: string) => Promise<{ default: unknown }>;
  invalidateModuleGraph?: () => void;
  /**
   * Returns the compiled CSS for the components a render loaded, plus their
   * imports. Prepended to the HTML as a `<style>` tag, so the story ships with
   * Astro's scoped styles in dev, static builds and server mode alike
   * (issue #189).
   */
  loadComponentStyles?: (componentIds: string[]) => Promise<string>;
  /** Fail the render when styles fail to load, instead of warning. Set for static builds. */
  failOnStyleError?: boolean;
};

export function createAstroRenderHandler(options: CreateAstroRenderHandlerOptions) {
  const sanitizationOptions = resolveSanitizationOptions(options.sanitization);
  const componentCache = new Map<string, Promise<AstroComponentFactory>>();
  let renderQueue = Promise.resolve<void>(undefined);

  // The HTML is already rendered when styles load, so a style failure (a
  // broken stylesheet, a stale module) shows the story unstyled instead of
  // replacing it with an error. A static build fails instead: nobody is
  // watching its console, and it would publish the story unstyled.
  async function loadStylesOrWarn(componentIds: string[]) {
    try {
      return await options.loadComponentStyles?.(componentIds);
    } catch (error) {
      if (options.failOnStyleError) {
        throw error;
      }

      console.warn('[storybook-astro] Could not load component styles:', error);

      return undefined;
    }
  }

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
    // Validate before the render queue so a malformed decorator tree rejects
    // immediately with a clear error instead of consuming a queue slot.
    if (data.node !== undefined) {
      assertValidSlotValue(data.node, 'node');
    }

    const executeRender = async () => {
      return runWithStoryRules(
        {
          story: data.story,
          rulesConfigFilePath: options.rulesConfigFilePath,
          resolveRulesConfigModule: options.resolveRulesConfigModule,
          invalidateModuleGraph: options.invalidateModuleGraph
        },
        async (selectedRules) => {
          // Every component this render uses (the story, slot and prop
          // components, decorators) contributes its styles to the response.
          // Components sent as markers are recorded when they load; real
          // factories, which the static build passes straight from the story
          // module, are already in the request.
          const renderedComponentIds = new Set<string>([data.component]);

          addComponentModuleIds([data.args, data.slots, data.node], renderedComponentIds);
          const loadComponent = (moduleId: string) => {
            renderedComponentIds.add(moduleId);

            return loadPatchedComponent(moduleId);
          };

          const patchedComponent = await loadPatchedComponent(
            data.component,
            selectedRules.moduleMocks.size === 0
          );
          // Resolve Astro components passed as props back to real factories
          // before the other arg processing (factories pass through those
          // untouched), so the parent template can render them with `<Comp />`.
          const reconstructedArgs = await reconstructProps(data.args ?? {}, {
            loadComponent
          });
          const processedArgs = await processImageMetadata(reconstructedArgs);
          const revivedArgs = reviveDateStrings(processedArgs);
          const sanitizedPayload = sanitizeRenderPayload(
            {
              args: revivedArgs,
              slots: data.slots ?? {}
            },
            sanitizationOptions
          );

          // Render component slots to HTML *after* sanitization so a component's
          // own markup isn't stripped by the slot allowlist (string slots above
          // still are). Markers pass through sanitization untouched.
          const renderedSlots = await reconstructSlots(sanitizedPayload.slots, {
            loadComponent,
            renderToHtml: (component, props, slots) =>
              options.container.renderToString(
                component as Parameters<typeof options.container.renderToString>[0],
                {
                  props: props ?? {},
                  slots: markRawSlots(slots ?? {})
                }
              )
          });

          const html = data.node !== undefined
            ? await renderDecoratedRoot(data.node, {
              storyComponentId: data.component,
              storyProps: sanitizedPayload.args,
              storySlots: renderedSlots,
              sanitizationOptions,
              loadComponent,
              renderToString: options.container.renderToString.bind(options.container)
            })
            : await options.container.renderToString(
              patchedComponent as Parameters<typeof options.container.renderToString>[0],
              {
                props: sanitizedPayload.args,
                slots: markRawSlots(renderedSlots)
              }
            );
          const css = await loadStylesOrWarn([...renderedComponentIds]);

          // `</style` inside the CSS (in a string or comment) would end the
          // tag early. `<\/style` reads the same to the CSS parser.
          return css
            ? `<style data-storybook-astro-styles>${css.replace(/<\/(style)/gi, '<\\/$1')}</style>${html}`
            : html;
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

/**
 * Records the `moduleId` of every Astro component factory found in a render
 * request's args, slots or decorator tree. Astro's compiler sets `moduleId` on
 * each component it compiles.
 *
 * It walks every level, guarding only against cycles: the walk is cheap, and a
 * depth cap counted differently from the slot and prop resolvers' would drop the
 * styles of a component they still render.
 */
function addComponentModuleIds(value: unknown, moduleIds: Set<string>, seen = new Set<object>()) {
  if (isAstroComponentFactory(value)) {
    const { moduleId } = value as AstroComponentFactory;

    if (moduleId) {
      moduleIds.add(moduleId);
    }

    return;
  }

  if (!Array.isArray(value) && !isRecord(value)) {
    return;
  }

  if (seen.has(value)) {
    return;
  }
  seen.add(value);

  Object.values(value).forEach((item) => addComponentModuleIds(item, moduleIds, seen));
}

type ContainerRenderToString = Awaited<ReturnType<typeof AstroContainer.create>>['renderToString'];

/**
 * Resolves a decorator root node (Decorator Support, Step 3) to the final HTML
 * string. A root node is a {@link SlotValue} — a string, a component reference,
 * a configured descriptor, or an array of those — so it's resolved through the
 * same `reconstructSlots` machinery that already resolves any other slot's
 * component tree, by wrapping it in a one-entry `{ root: node }` record and
 * reading `.root` back.
 *
 * Two things only the root needs, supplied via the callbacks below:
 *
 * 1. **The story's own args/slots.** The story itself appears in the tree as a
 *    bare leaf (wherever a decorator placed `Story()`), not a configured
 *    descriptor, so it carries no props of its own — its args arrived on the
 *    request's separate top-level `args`/`slots` fields and were already fully
 *    processed above. `renderToHtml` needs to recognize that leaf and feed it
 *    those already-processed values instead of rendering it with nothing.
 *
 *    It can't do that by comparing the *loaded* component's own `.moduleId` to
 *    `ctx.storyComponentId`: in server mode, `loadComponent` loads from a
 *    deployed snapshot at a different path than the original project
 *    (`resolveSnapshotComponentPath` in `server/index.ts`), and Astro's compiler
 *    embeds `.moduleId` from wherever the file was actually compiled — the
 *    snapshot path, not the original id the client sent as `storyComponentId`.
 *    Comparing loaded-component identity instead (`storyComponentInstances`,
 *    populated by the `moduleId` the marker itself carried *before* loading)
 *    survives that remapping.
 * 2. **The full args pipeline for every descriptor's props.** A decorator's own
 *    `props` (e.g. `{ theme: ctx.globals.theme }`) are user-authored, args-like
 *    values, so `processProps` runs them through the same
 *    reconstructProps → processImageMetadata → reviveDateStrings → sanitizeArgs
 *    pipeline top-level story args get — uniformly for every descriptor in the
 *    tree, the story's wrapper or not.
 */
async function renderDecoratedRoot(
  node: SlotValue,
  ctx: {
    storyComponentId: string;
    storyProps: Record<string, unknown>;
    storySlots: Record<string, unknown>;
    sanitizationOptions: ResolvedSanitizationOptions;
    loadComponent: (moduleId: string) => Promise<AstroComponentFactory>;
    renderToString: ContainerRenderToString;
  }
): Promise<string> {
  // Sanitize the tree's user-authored string/array content first, exactly like
  // any other slot value (array wrapper strings sanitize as one document, #149).
  // Descriptor `component`/`props` pass through this pass untouched — `props`
  // gets the args pipeline afterwards, once component references have loaded.
  const { root: sanitizedNode } = sanitizeRenderPayload(
    { args: {}, slots: { root: node } },
    ctx.sanitizationOptions
  ).slots;

  // Tracks which *loaded* component instances came from `ctx.storyComponentId`,
  // keyed by object identity rather than `.moduleId` (see the function doc above).
  const storyComponentInstances = new WeakSet<AstroComponentFactory>();
  const loadComponent = async (moduleId: string) => {
    const component = await ctx.loadComponent(moduleId);

    if (moduleId === ctx.storyComponentId) {
      storyComponentInstances.add(component);
    }

    return component;
  };

  const resolved = await reconstructSlots(
    { root: sanitizedNode },
    {
      loadComponent,
      renderToHtml: (component, props, slots) => {
        if (props === undefined && storyComponentInstances.has(component as AstroComponentFactory)) {
          return ctx.renderToString(component as Parameters<ContainerRenderToString>[0], {
            props: ctx.storyProps,
            slots: markRawSlots(ctx.storySlots)
          });
        }

        return ctx.renderToString(component as Parameters<ContainerRenderToString>[0], {
          props: props ?? {},
          slots: markRawSlots(slots ?? {})
        });
      },
      processProps: async (props) => {
        const reconstructed = await reconstructProps(props, { loadComponent });
        const imaged = await processImageMetadata(reconstructed);
        const revived = reviveDateStrings(imaged);

        return sanitizeArgs(revived, ctx.sanitizationOptions);
      }
    }
  );

  return resolved.root as string;
}

/**
 * Marks each slot's HTML string as already-rendered so the Astro Container emits
 * it raw instead of escaping it. Astro 5 and 7 render string slots raw anyway,
 * but Astro 6 escapes an unmarked string slot — this normalizes all versions.
 * `markHTMLString` tags the string via a global symbol, so it's recognized even
 * across Astro module instances.
 */
export function markRawSlots(slots: Record<string, unknown>): Record<string, unknown> {
  const marked: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(slots)) {
    marked[name] = typeof value === 'string' ? markHTMLString(value) : value;
  }

  return marked;
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

export async function processImageMetadata(
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

// Only plain objects are walked/rebuilt. Other object types (Date, RegExp,
// class instances, …) are left intact — recursing into a Date with
// Object.entries would flatten it to {}, which is how a story's Date arg ended
// up as an invalid date during static prerendering.
function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}
