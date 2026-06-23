/**
 * Astro component references can't be JSON-serialized, so when a story passes an
 * Astro component as a prop or as slot content, the client replaces it with this
 * plain marker before sending the render request. The server reconstructs it: a
 * marker used as a prop is resolved back to the real component factory (the
 * parent template renders it via `<Comp />`); a marker used as slot content is
 * rendered to an HTML string (the Astro Container only accepts string slots).
 *
 * Only the `moduleId` needs to cross the boundary — the server loads the
 * component from it exactly like it loads the top-level story component.
 *
 * Scope: a marker carries a bare component reference, not per-instance props or
 * slots. Passing a "configured" child (with its own props/slots) or a non-Astro
 * framework component as a slot/prop is not supported yet.
 */
export const ASTRO_COMPONENT_MARKER = '__astroComponent';

export type AstroComponentMarker = {
  [ASTRO_COMPONENT_MARKER]: true;
  moduleId: string;
};

/**
 * A value is a marker only when both keys are present and well-typed, so a
 * legitimate plain-object arg can't be mistaken for one.
 */
export function isAstroComponentMarker(value: unknown): value is AstroComponentMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>)[ASTRO_COMPONENT_MARKER] === true &&
    typeof (value as Record<string, unknown>).moduleId === 'string'
  );
}

/**
 * Detects an Astro component factory — the callable produced by importing a
 * `.astro` file. On the client this is the stub from `vitePluginAstroComponentMarker`
 * (which sets `isAstroComponentFactory` and `moduleId`); on the server (and in the
 * Vitest/portable path) it's the real Astro factory, which also sets the flag.
 */
export function isAstroComponentFactory(value: unknown): boolean {
  return (
    typeof value === 'function' &&
    'isAstroComponentFactory' in value &&
    (value as { isAstroComponentFactory?: unknown }).isAstroComponentFactory === true
  );
}

/**
 * Recursively replaces Astro component factories in an args/slots value with
 * serializable {@link AstroComponentMarker}s so the value can cross the JSON
 * render boundary. Walks arrays and nested objects. A factory missing its
 * `moduleId` can't be rendered server-side, so it's dropped with an error.
 */
export function serializeAstroComponentMarkers(value: unknown, depth = 0): unknown {
  if (isAstroComponentFactory(value)) {
    const moduleId = (value as { moduleId?: unknown }).moduleId;

    if (typeof moduleId !== 'string') {
      console.error(
        '[storybook-astro] An Astro component passed in args has no moduleId and cannot be rendered.'
      );

      return undefined;
    }

    return { [ASTRO_COMPONENT_MARKER]: true, moduleId } satisfies AstroComponentMarker;
  }

  if (depth >= 10) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeAstroComponentMarkers(item, depth + 1));
  }

  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(value)) {
      out[key] = serializeAstroComponentMarkers(nested, depth + 1);
    }

    return out;
  }

  return value;
}
