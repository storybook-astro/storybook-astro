# Support Astro Components Referencing Other Astro Components

## Problem Statement

Two distinct nesting patterns need to be supported:

### Pattern A: Template nesting (e.g. `BlogSummaryCard.astro`)
A component's own template uses other Astro components. These are rendered transitively by the Container API — no explicit story-level composition is required. The user writes a story that passes props to `BlogSummaryCard`, and the framework must correctly SSR the entire component tree:

```
BlogSummaryCard → SummaryCard (local .astro)
                → Button, Pill (@eliancodes/brutal-ui)
SummaryCard     → Card (@eliancodes/brutal-ui)
                → Image (astro:assets)
```

This is the most common real-world case and should "just work" — the Container API handles transitive SSR. The actual pain points are specific failure modes in the Storybook environment (see below).

### Pattern B: Props-based nesting
A story or render function explicitly passes an Astro component as a prop or slot:

```javascript
render: (args) => {
  const icon = args.Icon ? <Icon icon={args.Icon} size={args.size} /> : null;
  return <Link Icon={icon} {...args}>{args.default}</Link>;
}
```

This is the harder case: components passed as args cross the client→server boundary as function references, not rendered HTML. The server has no way to reconstruct or render them.

---

## Pattern A: Failure Points and Fixes

The Container API handles transitive `.astro` rendering automatically. These are the specific places it breaks down:

### 1. `astro:assets` Image in SSR context

`SummaryCard.astro` passes its `imgSrc: ImageMetadata` prop to Astro's `<Image>` component. However, by the time `SummaryCard` receives `imgSrc`, `middleware.ts`'s `processImageMetadata` has already converted the `ImageMetadata` object to a plain URL string. Astro's `Image` component expects a full `ImageMetadata` object (with `width`, `height`, `format`, etc.) and may throw or produce broken output when given a string.

**Fix**: Pass a partial `ImageMetadata`-shaped object rather than a bare string, so `Image` can render a valid `<img>` tag without crashing. Specifically, `convertImageMetadataToUrl` should return an object like `{ src: url, width: undefined, height: undefined }` that satisfies the minimum shape the `Image` component needs, or we configure Astro to use a passthrough image service in the Storybook context so `Image` renders as a plain `<img>`.

The cleanest solution is to add a passthrough image service to the Astro config used in the middleware and build SSR server — Astro already ships `astro/assets/services/sharp` and `astro/assets/services/noop`. Using `passthroughImageService()` from `astro/config` prevents image processing errors when stories supply URL strings or incomplete metadata.

### 2. Third-party `.astro` components from node_modules

`vitePluginAstroComponentMarker` detects the Astro 6 client-side stub pattern in `.astro` files and patches them to set `isAstroComponentFactory = true`. By default Vite excludes `node_modules` from plugin transforms.

**Check required**: Verify whether `@eliancodes/brutal-ui` ships pre-compiled `.astro` components or already-processed JS. If it ships raw `.astro` files, the component marker plugin may need to include node_modules (via `enforce: 'pre'` and relaxing the file filter). If it ships compiled JS that sets `isAstroComponentFactory` already, no change is needed.

For the server side (SSR), third-party Astro components are loaded via `import()` and go through Vite SSR processing — this should work without changes as long as the Astro Vite plugin is active.

### 3. Content collection prop shape

`BlogSummaryCard` types its prop as `CollectionEntry<'blog'>`. At runtime, this is just a plain object — the Container API has no awareness of the content collections schema. Stories must supply a correctly-shaped mock object:

```javascript
// BlogSummaryCard.stories.jsx
export default {
  component: BlogSummaryCard,
  args: {
    post: {
      id: 'my-post',
      data: {
        title: 'My Post',
        description: '...',
        imgUrl: myImage, // ImageMetadata import
        tags: ['astro', 'storybook'],
        draft: false,
      }
    }
  }
};
```

No framework changes are needed here — this is a documentation and pattern concern. Content collection *API calls* (e.g. `getEntry()`, `getCollection()`) inside a component template will fail; those components are not compatible with the Container API without mocking.

### 4. Static build coverage

The SSR Vite server in `prerenderStories` (`vitePluginAstroBuildPrerender.ts`) already includes fallback plugins for fonts, routes, Vue, and integration options. It needs parity with dev mode for any virtual module that nested components depend on (e.g. `astro:assets`, `astro:content`).

**Check required**: Confirm the SSR server correctly resolves `astro:assets` virtual imports for deeply nested components. The `vitePluginAstroFontsFallback` pattern could be extended with a `vitePluginAstroAssetsFallback` that stubs the image service for the build SSR context.

---

## Pattern B: Props-based nesting

This is the harder problem. Astro components passed as story args cross the network boundary as `moduleId` strings. On the server side, they must be loaded and rendered.

### Current Limitation

When a story passes an Astro component as a prop (e.g. `<Link Icon={icon}>`), the middleware receives the parent component's `moduleId` but has no knowledge of the nested `icon` — it arrives as a JSX element object, not an Astro component reference. The serialized JSON payload from the client to the server cannot carry live component factories.

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

**Limitation**: This requires the parent component to handle an HTML string prop intentionally. A parent that expects a component factory (e.g. renders it itself with `<Component />`) will not work directly. This pattern works best when the component is treated as slot-like content.

An alternative that avoids this limitation: render the child component to HTML on the client side (via another render request), then pass the HTML as a slot or prop. This adds a round trip but is more compatible.

---

## Implementation Plan

### Phase 1: Pattern A — Image service and virtual module parity (Simple, High Impact)

1. Configure `passthroughImageService()` in the Astro config used by the middleware Vite server and the build SSR server. This eliminates image processing errors for deeply nested components that use `astro:assets`.
2. Verify third-party `.astro` component handling — check if `vitePluginAstroComponentMarker` needs to cover node_modules.
3. Ensure the static build's SSR Vite server (`createStorySsrServer`) has the same virtual module fallbacks as dev mode.
4. Document the content collection mock pattern for stories.

**Files to modify**:
- `src/vitePluginAstroBuildPrerender.ts` — add image service fallback plugin to `createStorySsrServer`
- `src/middleware.ts` — ensure the AstroContainer is configured with a passthrough image service (or via Astro config)
- `src/vitePluginAstroComponentMarker.ts` — verify/extend node_modules coverage if needed
- `docs/` — add story patterns for complex nested components

### Phase 2: Pattern B — Props-based nesting (Complex, Lower urgency)

1. Add `serializeAstroComponentArgs` helper to `render.tsx` — walks args and replaces Astro component factories with `{ __astroComponent, moduleId, props, slots }` markers
2. Add `reconstructAstroComponentArgs` to `middleware.ts` — walks args, detects markers, renders each to HTML string
3. Update the render request handler to call `reconstructAstroComponentArgs` before passing props to `container.renderToString`
4. Document limitations (parent must accept HTML string, not component factory)

**Files to modify**:
- `packages/@storybook-astro/renderer/src/render.tsx`
- `packages/@storybook-astro/framework/src/middleware.ts`
- `packages/@storybook-astro/framework/src/vitePluginAstroBuildPrerender.ts` (build path)

---

## Risk Areas

- **Image service config scope**: Setting a passthrough service globally may affect non-story Astro processing; scope it to the Storybook Vite config only.
- **Circular component references (Pattern B)**: Detect and break cycles — a component passed as its own prop would cause infinite recursion. Cap recursion depth.
- **Performance (Pattern B)**: Each nested component render is an extra SSR round-trip. For deeply nested patterns this compounds quickly — consider parallel resolution.
- **Slot vs prop distinction**: HTML strings passed as props require the parent template to use `set:html`. If the parent uses a named slot, the HTML needs to be passed as a slot instead.

---

## Success Criteria

- `BlogSummaryCard.astro` (and similar deeply nested real-world components) render correctly in both dev mode and `storybook build`
- Stories can pass plain mock objects matching the expected prop shapes (e.g. `CollectionEntry`-shaped data)
- `astro:assets` Image components within nested `.astro` templates do not throw errors
- Third-party `.astro` components (e.g. from `@eliancodes/brutal-ui`) render correctly
- Pattern B (props-based nesting) works for the common case of passing pre-rendered Astro output as an HTML string prop
- No regression in existing functionality (props, slots, images, framework components)
