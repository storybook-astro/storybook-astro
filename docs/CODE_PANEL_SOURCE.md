# Code Panel Source for Astro Components

## Problem Statement

Storybook Docs offers two surfaces for showing a story's source: the "Show code" toggle under each story in docs pages, and the Code Panel (`parameters.docs.codePanel = true`). For Astro component stories both currently fall back to displaying the raw story file source, because the framework never emits a dynamic snippet. The panel should show Astro template usage for the rendered component with the story's current args, e.g.:

```astro
---
import HeroHijri from './HeroHijri.astro';
---
<HeroHijri imageUrl="/images/hero.jpg" title="Eid Mubarak" />
```

**Reference**: [Issue #106 — Code Panel shows story source instead of component usage](https://github.com/storybook-astro/storybook-astro/issues/106)

## Current State

### How dynamic source works in Storybook 10

Renderers ship a **source decorator** — an ordinary global decorator that, on each render, generates a code string from the story context and emits it through `emitTransformCode(code, ctx)` (`storybook/internal/preview-api`). Addon-docs receives it via the `SNIPPET_RENDERED` channel event; both the "Show code" block and the Code Panel consume the same event. There is no separate Code Panel API.

The decorator is delivered as a **docs-only preview annotation**: `@storybook/vue3`'s preset appends `@storybook/vue3/entry-preview-docs` to `previewAnnotations` only when the docs preset is enabled, and that module exports `decorators: [sourceDecorator]`. The decorator itself:

- calls `storyFn()` first and returns it untouched — snippet generation is a side effect inside `useEffect`;
- generates code from `ctx.args` + `ctx.component` (never from the render result);
- skips emission when the story isn't an args story (`!ctx.parameters.__isArgsStory`), when `parameters.docs.source.code` is set, or when `parameters.docs.source.type === SourceType.CODE` — so user-supplied snippets always win, and `SourceType.DYNAMIC` can force emission.

> The roadmap entry says "registered via `entry-preview.ts`" — that's not quite the right wiring. It must be a separate `entry-preview-docs` annotation loaded conditionally, so projects without addon-docs don't pay for it. This plan corrects that.

### What we have

- `packages/@storybook-astro/renderer/src/preset.ts` appends only `entry-preview` to `previewAnnotations`. No docs annotation exists.
- For Astro stories, `ctx.component` is the client stub produced by `vitePluginAstroComponentMarker` — a function carrying `moduleId` (the absolute path of the `.astro` file). There is no docgen info yet (JSDoc extraction is tracked separately as issue #110).
- Story args follow one convention worth preserving in snippets: `args.slots` is a map of slot name → HTML string (`default` plus named slots), and everything else is a prop.
- Storybook sets `parameters.fileName` to the story file's path, which lets us compute a realistic relative import path for the frontmatter.
- CSF1–3 and CSF4 (`definePreview`) both load preview annotations the same way, so one annotation file covers both.
- The documented workaround (`parameters.docs.source.code`) must keep working — the skip logic above preserves it.

### Framework component stories (React, Vue, etc.)

Stories delegated via `parameters.renderer` render through the framework's `renderToCanvas`, but their renderer's docs annotations (`@storybook/react/entry-preview-docs` etc.) are not loaded by our framework, so they show the same raw-source fallback. Registering several frameworks' source decorators globally is not safe — each would emit for every story. **Out of scope** for this plan: our source decorator no-ops for `parameters.renderer` stories, preserving current behavior. A follow-up can dispatch to per-framework generators behind the same single decorator.

## Design Decisions

**Decision 1 — Parity wiring, Vue 3 as the model.** A new `entry-preview-docs` entry in the renderer package exporting `decorators: [sourceDecorator]`, appended by the renderer preset's `previewAnnotations` only when the docs preset is enabled (same check Vue uses: `await options.presets.apply('docs', {}, options)` has keys). The decorator uses `useEffect` + `emitTransformCode` and the standard skip logic, so `docs.source.code`, `docs.source.type`, and non-args stories behave exactly like every other renderer.

**Decision 2 — Pure, unit-testable serializer.** All template generation lives in `generateAstroSource(componentName, args, options)` — a pure module with no Storybook or virtual-module imports, exhaustively unit-tested in isolation. The decorator is a thin shell around it.

**Decision 3 — Idiomatic Astro output, frontmatter included.** The snippet shows what a user would actually paste into a `.astro` file: a frontmatter block with the component import (and `const` declarations for complex prop values, mirroring Vue's script-setup convention), then the component tag. Astro's expression syntax is JSX-like, so attribute serialization is straightforward (see spec below).

**Decision 4 — Generate from context, not from output.** Source comes from `ctx.component` + `ctx.args`. This makes the decorator order-independent and immune to the decorator-support feature (`docs/DECORATOR_SUPPORT.md`): when `storyFn()` starts returning renderable trees, the source decorator still passes the value through untouched and the snippet still shows the undecorated component usage — which is the desired behavior (parity with `excludeDecorators` defaults elsewhere).

**Decision 5 — Component name resolution order.** `component.__docgenInfo.displayName` (future-proofing for issue #110) → basename of `component.moduleId` without `.astro` → last segment of `ctx.title`. Import path: `moduleId` relative to `dirname(parameters.fileName)` when both are available, else `./<Name>.astro`.

## Source Generation Spec

Props (all args except `slots`), sorted alphabetically:

| Arg value | Emitted attribute |
|---|---|
| `"text"` | `name="text"` (single-quote if the value contains `"`, `{\`…\`}` if it contains both) |
| `""` / `undefined` / `null` | omitted |
| `true` | `name` (bare) |
| `false` | `name={false}` |
| number / bigint | `name={42}` |
| `Date` | `name={new Date("2026-06-11T…")}` |
| object / array | `name={items}` + frontmatter `const items = <pretty-printed literal>;` (collision-suffixed if needed) |
| function | omitted |

Slots (`args.slots`):

- `default` → children of the component tag, indented, raw HTML as-is.
- named → `<Fragment slot="name">…</Fragment>` children.
- any slots present → open/close tag form; none → self-closing `<Name … />`.

Formatting: single line while the tag fits in ~80 characters, otherwise one attribute per line. Frontmatter is emitted only when there is an import or at least one `const` (always at least the import, unless the component name couldn't be resolved to a module).

Example with the full surface:

```astro
---
import Card from './Card.astro';

const author = { name: "Ada", role: "Engineer" };
---
<Card title="Hello" featured author={author}>
  <p>Body content</p>
  <Fragment slot="footer"><a href="/more">Read more</a></Fragment>
</Card>
```

## Implementation Plan

### Step 1 — The serializer

`packages/@storybook-astro/renderer/src/docs/generateAstroSource.ts`, pure, per the spec above. Unit tests (`generateAstroSource.test.ts`) cover: each value type, quote escaping, empty-string omission, object hoisting + name collisions, default and named slots, self-closing vs. children form, line-length breaking, name fallback chain, relative import path derivation (including the `parameters.fileName` missing case).

**Exit criteria**: serializer tests green under `yarn test`; no imports beyond the standard library.

### Step 2 — Source decorator and wiring

- `packages/@storybook-astro/renderer/src/docs/sourceDecorator.ts`: calls `storyFn()` and returns it; inside `useEffect`, skips per the standard logic (`__isArgsStory`, `docs.source.code`, `SourceType.CODE` / forced `DYNAMIC` — import `SourceType` from `storybook/internal/docs-tools`), additionally skips stories with `parameters.renderer` set and components that aren't Astro stubs (no `moduleId` and no string/HTMLElement story); otherwise emits via `emitTransformCode`.
- `packages/@storybook-astro/renderer/src/entry-preview-docs.ts`: `export const decorators = [sourceDecorator];`
- `renderer/package.json`: add `./entry-preview-docs` export; `tsup.config.ts`: add the entry (runtime-only, no DTS — same treatment as `entry-preview`).
- `renderer/src/preset.ts`: append the docs entry to `previewAnnotations` when the docs preset is enabled.

**Exit criteria**: decorator unit test (mock `emitTransformCode`, fake context) asserting emission for an Astro args story and non-emission for: `docs.source.code` set, custom-render story, `parameters.renderer: 'react'` story.

### Step 3 — Integration verification

- In `integration/astro6` (has `@storybook/addon-docs`): verify "Show code" on an existing autodocs page shows the generated Astro snippet and live-updates when controls change args; add one story with `parameters.docs.codePanel = true` exercising the Code Panel; one story with `parameters.docs.source.code` proving the workaround still wins.
- Spot-check `integration/astro5` and `integration/astro6-csf4` (CSF4 annotation loading).
- Confirm a React story's docs page is unchanged (no Astro snippet leakage).
- Rebuild packages first (`yarn build:packages`) — integration apps consume `dist`.

**Exit criteria**: manual checks pass in dev mode; `yarn test` and `yarn smoke` green. (Static mode needs no special handling — the snippet machinery runs in the preview iframe from args, independent of how HTML is produced.)

### Step 4 — Documentation and release

- Website: update the Docs/autodocs guidance to describe dynamic source for Astro stories, the value-serialization rules, and the `docs.source.code` override; flip the roadmap item and the "Source Code Display" feature-table row from 🚧 to ✅, and correct the roadmap's "registered via `entry-preview.ts`" detail.
- `AGENTS.md`: note `entry-preview-docs` in the renderer's important files.
- Renderer-only change → still publish both packages per `docs/RELEASING.md` ordering if the framework preset changed (it did not — the preset change is in the **renderer** package; verify before deciding the release set).

## Known Limitations

- **Decorators are not reflected** in the snippet — it intentionally shows the undecorated component usage.
- **Framework component stories** (`parameters.renderer`) keep the raw-source fallback; per-framework dynamic source is a possible follow-up.
- **Complex objects** render as hoisted `const` literals; values that aren't plausibly literal (class instances, `ImageMetadata` from imported images) serialize as plain object literals rather than recovering the original `import img from '…'` form. Revisit alongside JSDoc/docgen work (issue #110).
- **Slot HTML is echoed verbatim** from `args.slots` — it is not reformatted or validated.
- Stories whose `render` returns template strings or DOM nodes are skipped (no component to attribute the source to), matching `__isArgsStory` semantics in other renderers.
