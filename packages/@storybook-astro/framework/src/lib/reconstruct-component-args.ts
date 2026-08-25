import {
  isAstroComponentFactory,
  isAstroComponentMarker,
  isAstroComponentSlot
} from '@storybook-astro/renderer/types';

/**
 * Resolves Astro component references that a story passed as props or slot
 * content back into something the Astro Container can render.
 *
 * A component reference arrives either as a serialized marker (the browser /
 * dev / server path, where it crossed a JSON boundary) or as a real component
 * factory (the Vitest / portable-stories path, which imports `.astro` files
 * directly). Both are handled.
 *
 * - **Props**: resolved to the real component factory and passed through, so the
 *   parent template renders them with `<Comp />` (the Container supports this).
 * - **Slots**: rendered to an HTML string, because the Container only accepts
 *   string slot content — a factory passed as a slot is stringified verbatim.
 *
 * Both callbacks are injected so this is reusable across the dev/server handler
 * (which loads by moduleId and renders via its container) and the testing path
 * (where factories are already in hand).
 */
type LoadComponent = (moduleId: string) => Promise<unknown>;
type RenderToHtml = (
  component: unknown,
  props?: Record<string, unknown>,
  slots?: Record<string, unknown>
) => Promise<string>;

/**
 * Runs a configured child's `props` through whatever processing the caller
 * needs before the child renders. Optional so the default (bare component
 * reference resolution only, via {@link resolvePropValue}) is unchanged for
 * existing slot callers; the decorator root resolution (`astroRenderHandler.ts`)
 * passes the full top-level args pipeline instead, uniformly for every
 * descriptor in the tree — see the props-pipeline note in
 * docs/specs/decorators.md#the-renderable-tree.
 */
type ProcessProps = (props: Record<string, unknown>) => Promise<Record<string, unknown>>;

type SlotCallbacks = {
  loadComponent: LoadComponent;
  renderToHtml: RenderToHtml;
  processProps?: ProcessProps;
};

// Guards against pathological/cyclic arg objects, and — since a decorator chain
// composes component-in-slot nesting the same way stories always could — against
// a runaway decorator/slot tree too. Component references are leaf replacements,
// so real nesting is shallow; this is just insurance.
export const MAX_DEPTH = 10;

/**
 * Resolves component references in **props** back to real component factories,
 * so the parent template renders them with `<Comp />`. Run this before the
 * normal arg processing (image/date/sanitize) — factories pass through those
 * untouched, and a resolved prop must exist before the parent renders.
 */
export async function reconstructProps(
  args: Record<string, unknown>,
  callbacks: { loadComponent: LoadComponent }
): Promise<Record<string, unknown>> {
  return (await resolvePropValue(args, callbacks, 0)) as Record<string, unknown>;
}

/**
 * Resolves component references in **slots** to HTML strings (the Container only
 * accepts string slots). Run this *after* sanitization so a component's rendered
 * markup — trusted, like a prop-rendered component — isn't stripped by the slot
 * HTML allowlist, while plain-string slots still are.
 *
 * Also resolves a decorator's root node (Decorator Support, Step 3): the caller
 * wraps the root in a one-entry record (e.g. `{ root: node }`) and reads back
 * `.root` — a root node is a {@link SlotValue}, the same shape as any other slot
 * entry (a bare component, a configured descriptor, or an array of those), so no
 * separate resolution path is needed.
 */
export async function reconstructSlots(
  slots: Record<string, unknown>,
  callbacks: SlotCallbacks
): Promise<Record<string, unknown>> {
  return resolveSlotRecord(slots, callbacks, 0);
}

/** Resolves every entry in a slots record to its rendered HTML (or pass-through string). */
async function resolveSlotRecord(
  slots: Record<string, unknown>,
  callbacks: SlotCallbacks,
  depth: number
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(slots)) {
    out[name] = await resolveSlotValue(name, value, callbacks, depth);
  }

  return out;
}

/**
 * Walks a prop value, replacing component references with real factories.
 * Returns the original reference untouched when nothing changed, so unrelated
 * args keep their identity (e.g. `ImageMetadata` objects the image pipeline
 * later inspects).
 */
async function resolvePropValue(
  value: unknown,
  callbacks: { loadComponent: LoadComponent },
  depth: number
): Promise<unknown> {
  if (isAstroComponentMarker(value)) {
    return callbacks.loadComponent(value.moduleId);
  }

  // Already a real factory (testing path) — pass it straight through as a prop.
  if (isAstroComponentFactory(value)) {
    return value;
  }

  if (depth >= MAX_DEPTH) {
    return value;
  }

  if (Array.isArray(value)) {
    const resolved = await Promise.all(
      value.map((item) => resolvePropValue(item, callbacks, depth + 1))
    );

    return resolved.some((item, index) => item !== value[index]) ? resolved : value;
  }

  if (isPlainObject(value)) {
    let changed = false;
    const out: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(value)) {
      const resolved = await resolvePropValue(nested, callbacks, depth + 1);

      if (resolved !== nested) {
        changed = true;
      }

      out[key] = resolved;
    }

    return changed ? out : value;
  }

  return value;
}

async function resolveSlotValue(
  name: string,
  value: unknown,
  callbacks: SlotCallbacks,
  depth: number
): Promise<unknown> {
  if (depth > MAX_DEPTH) {
    throw new Error(
      `Component nesting in slot "${name}" exceeds the maximum depth of ${MAX_DEPTH}. ` +
        'Check for a decorator or slot descriptor that wraps itself.'
    );
  }

  // An array slot (list of components and/or strings) is concatenated into one
  // HTML string, which is what the Container expects for a single slot.
  if (Array.isArray(value)) {
    const parts = await Promise.all(value.map((item) => resolveSlotValue(name, item, callbacks, depth + 1)));

    return parts.join('');
  }

  if (isAstroComponentMarker(value)) {
    const component = await callbacks.loadComponent(value.moduleId);

    return renderSlotComponent(name, component, callbacks);
  }

  if (isAstroComponentFactory(value)) {
    return renderSlotComponent(name, value, callbacks);
  }

  // A configured child: the component plus its own props and slot content.
  if (isAstroComponentSlot(value)) {
    return renderConfiguredSlotComponent(name, value, callbacks, depth + 1);
  }

  // Plain HTML string (or anything else) passes through unchanged.
  return value;
}

async function renderSlotComponent(
  name: string,
  component: unknown,
  callbacks: Pick<SlotCallbacks, 'renderToHtml'>
): Promise<string> {
  try {
    return await callbacks.renderToHtml(component);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`Failed to render Astro component passed to slot "${name}": ${message}`);
  }
}

/**
 * Renders a configured child component — the component together with its own
 * props and slots — to an HTML string. Its slots are reconstructed recursively,
 * so a configured child can itself contain components, strings, and further
 * configured children.
 *
 * Its props get the same component-reference resolution as top-level props by
 * default (`resolvePropValue`) — unless the caller supplies `processProps`
 * (the decorator root resolution does), in which case props run through that
 * instead, uniformly for every descriptor in the tree.
 */
async function renderConfiguredSlotComponent(
  name: string,
  descriptor: { component: unknown; props?: Record<string, unknown>; slots?: Record<string, unknown> },
  callbacks: SlotCallbacks,
  depth: number
): Promise<string> {
  const component = isAstroComponentMarker(descriptor.component)
    ? await callbacks.loadComponent(descriptor.component.moduleId)
    : descriptor.component;

  const props = descriptor.props
    ? callbacks.processProps
      ? await callbacks.processProps(descriptor.props)
      : ((await resolvePropValue(descriptor.props, callbacks, 0)) as Record<string, unknown>)
    : {};
  const slots = descriptor.slots ? await resolveSlotRecord(descriptor.slots, callbacks, depth) : {};

  try {
    return await callbacks.renderToHtml(component, props, slots);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`Failed to render Astro component passed to slot "${name}": ${message}`);
  }
}

/**
 * Rejects a malformed decorator root node before any rendering starts (Decorator
 * Support, Step 3 — the render pipeline must fail loudly on a bad payload rather
 * than silently truncate or render something unintended). A valid node is a
 * {@link SlotValue}: a string, a component reference, a configured descriptor
 * (`{ component, props?, slots? }`), or an array of those, nested no deeper than
 * {@link MAX_DEPTH}.
 */
export function assertValidSlotValue(value: unknown, path: string, depth = 0): void {
  if (depth > MAX_DEPTH) {
    throw new Error(`${path} exceeds the maximum node depth of ${MAX_DEPTH}.`);
  }

  if (typeof value === 'string' || isAstroComponentMarker(value) || isAstroComponentFactory(value)) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertValidSlotValue(item, `${path}[${index}]`, depth + 1));

    return;
  }

  if (isAstroComponentSlot(value)) {
    if (value.props !== undefined && !isPlainObject(value.props)) {
      throw new Error(`${path}.props must be a plain object.`);
    }

    if (value.slots !== undefined) {
      if (!isPlainObject(value.slots)) {
        throw new Error(`${path}.slots must be a plain object of slot values.`);
      }

      for (const [key, slotValue] of Object.entries(value.slots)) {
        assertValidSlotValue(slotValue, `${path}.slots.${key}`, depth + 1);
      }
    }

    return;
  }

  throw new Error(
    `${path} is not a valid decorator node. Expected a string, an Astro component reference, ` +
      'a configured component descriptor ({ component, props?, slots? }), or an array of those.'
  );
}

// Only plain objects are walked for component references. Other object types
// (Date, RegExp, ImageMetadata, class instances, …) are returned untouched so
// their prototype/identity is preserved for the later arg processing.
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return prototype === Object.prototype || prototype === null;
}
