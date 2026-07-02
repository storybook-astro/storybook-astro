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

// Guards against pathological/cyclic arg objects. Component references are leaf
// replacements, so real nesting is shallow; this is just insurance.
const MAX_DEPTH = 10;

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
 */
export async function reconstructSlots(
  slots: Record<string, unknown>,
  callbacks: { loadComponent: LoadComponent; renderToHtml: RenderToHtml }
): Promise<Record<string, unknown>> {
  return resolveSlotRecord(slots, callbacks);
}

/** Resolves every entry in a slots record to its rendered HTML (or pass-through string). */
async function resolveSlotRecord(
  slots: Record<string, unknown>,
  callbacks: { loadComponent: LoadComponent; renderToHtml: RenderToHtml }
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(slots)) {
    out[name] = await resolveSlotValue(name, value, callbacks);
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
  callbacks: { loadComponent: LoadComponent; renderToHtml: RenderToHtml }
): Promise<unknown> {
  // An array slot (list of components and/or strings) is concatenated into one
  // HTML string, which is what the Container expects for a single slot.
  if (Array.isArray(value)) {
    const parts = await Promise.all(value.map((item) => resolveSlotValue(name, item, callbacks)));

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
    return renderConfiguredSlotComponent(name, value, callbacks);
  }

  // Plain HTML string (or anything else) passes through unchanged.
  return value;
}

async function renderSlotComponent(
  name: string,
  component: unknown,
  callbacks: { renderToHtml: RenderToHtml }
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
 * props and slots — to an HTML string. The child's props get the same
 * component-reference resolution as top-level props, and its slots are
 * reconstructed recursively, so a configured child can itself contain
 * components, strings, and further configured children.
 */
async function renderConfiguredSlotComponent(
  name: string,
  descriptor: { component: unknown; props?: Record<string, unknown>; slots?: Record<string, unknown> },
  callbacks: { loadComponent: LoadComponent; renderToHtml: RenderToHtml }
): Promise<string> {
  const component = isAstroComponentMarker(descriptor.component)
    ? await callbacks.loadComponent(descriptor.component.moduleId)
    : descriptor.component;

  const props = descriptor.props
    ? ((await resolvePropValue(descriptor.props, callbacks, 0)) as Record<string, unknown>)
    : {};
  const slots = descriptor.slots ? await resolveSlotRecord(descriptor.slots, callbacks) : {};

  try {
    return await callbacks.renderToHtml(component, props, slots);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    throw new Error(`Failed to render Astro component passed to slot "${name}": ${message}`);
  }
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
