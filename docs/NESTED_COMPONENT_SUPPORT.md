# Support Astro Components Referencing Other Astro Components

## Background

Two distinct nesting patterns were identified:

**Pattern A: Template nesting** — A component's own template uses other Astro components. The Container API handles transitive SSR automatically. Phase 1 work (image service + virtual module parity) resolved the specific failure points in the Storybook environment. **This is complete.**

**Pattern B: Props-based nesting** — A story or render function explicitly passes an Astro component as a prop or slot. This is the remaining work.

---

## Pattern B: Props-based nesting

> **Status: Implemented.** A story can pass an Astro component as a prop (`args: { Icon }`) or as slot content (`args.slots.default`). The client serializes each component to a `{ __astroComponent: true, moduleId }` marker; the server reconstructs it. **Props** resolve back to the real component factory and pass through, so the parent template renders them with `<Comp />` (the Astro Container renders factory-valued props natively — the `<Fragment set:html>` workaround described below is **not** needed and was incorrect). **Slots** render the child to an HTML string, since the Container only accepts string slots; this happens *after* sanitization so a component's own markup isn't stripped, while plain-string slots still are. Implemented across `astroComponentMarker.ts` (renderer), `lib/reconstruct-component-args.ts`, `render.tsx`, `astroRenderHandler.ts`, and `testing/astro-runtime.ts`. Closes #128. The original analysis is kept below for context.

When a story passes an Astro component as a prop (e.g. `<Link Icon={icon}>`), the middleware receives the parent component's `moduleId` but has no knowledge of the nested component — it arrives as a JSX element object, not an Astro component reference. The serialized JSON payload from the client to the server cannot carry live component factories.

### Proposed Solution

The key insight is that **only `moduleId` values** need to cross the boundary — not the component itself. The client detects Astro components in args, replaces them with a serialized reference `{ __astroComponent: true, moduleId: "...", props: {}, slots: {} }`, and the server reconstructs and renders them before passing to the parent.

**Client side** (`render.tsx`):
- Before sending the render request, walk `args` recursively
- Replace any value where `value.isAstroComponentFactory === true` with `{ __astroComponent: true, moduleId: value.moduleId, props: {}, slots: {} }`

**Server side** (`middleware.ts`):
- After loading the parent component, walk `args` recursively for `__astroComponent` markers
- For each found: load the child component via `loadPatchedComponent(ref.moduleId)`, render it to an HTML string via `container.renderToString(child, { props: ref.props, slots: ref.slots })`
- Replace the marker with the rendered HTML string
- Pass the HTML string as the prop to the parent — the parent `.astro` template renders it via `<Fragment set:html={prop} />`

**Limitation**: This requires the parent component to handle an HTML string prop intentionally. A parent that expects a component factory (e.g. renders it itself with `<Component />`) will not work directly.

An alternative that avoids this limitation: render the child component to HTML on the client side (via another render request), then pass the HTML as a slot or prop. This adds a round trip but is more compatible.

### Implementation Plan

1. Add `serializeAstroComponentArgs` helper to `render.tsx` — walks args and replaces Astro component factories with `{ __astroComponent, moduleId, props, slots }` markers
2. Add `reconstructAstroComponentArgs` to `middleware.ts` — walks args, detects markers, renders each to HTML string
3. Update the render request handler to call `reconstructAstroComponentArgs` before passing props to `container.renderToString`
4. Document limitations (parent must accept HTML string, not component factory)

**Files to modify**:
- `packages/@storybook-astro/renderer/src/render.tsx`
- `packages/@storybook-astro/framework/src/middleware.ts`
- `packages/@storybook-astro/framework/src/vitePluginAstroBuildPrerender.ts` (build path)

### Risk Areas

- **Circular component references**: Detect and break cycles — a component passed as its own prop would cause infinite recursion. Cap recursion depth.
- **Performance**: Each nested component render is an extra SSR round-trip. For deeply nested patterns this compounds quickly — consider parallel resolution.
- **Slot vs prop distinction**: HTML strings passed as props require the parent template to use `set:html`. If the parent uses a named slot, the HTML needs to be passed as a slot instead.
