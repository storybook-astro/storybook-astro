# JSDoc and Props Extraction for Astro Components

## Problem Statement

Storybook autodocs renders an empty description and an empty props table for every `.astro` story. Authors have to restate the entire component API in the story file — every prop's description, type summary and default — and repeat the component description in `parameters.docs.description.component`. React, Vue, Preact, Svelte and Angular all derive this from source; Astro is the only framework in our matrix that does not.

The goal is that this component:

```astro
---
/**
 * A simple content card with optional highlight styling.
 */
interface Props {
  /** Card heading text. */
  title?: string;
  /** Applies a highlighted visual style. */
  highlight?: boolean;
}

const { title = 'Default title', highlight = false } = Astro.props;
---
```

produces a populated description and props table — with defaults, types and per-prop descriptions — from a story file that declares nothing but `component`.

**Reference**: [Issue #163 — Automatic Documentation Extraction from JSDoc](https://github.com/storybook-astro/storybook-astro/issues/163), reported downstream as [#110](https://github.com/storybook-astro/storybook-astro/issues/110).

## Current State

### How docgen reaches Storybook's UI

Storybook 10 has two mechanisms, and they are not alternatives so much as successive generations.

The **legacy path** is stable since Storybook 6 and works on every 10.x release. A build-time tool attaches `__docgenInfo` to the component object; the renderer registers `parameters.docs.extractArgTypes` and `parameters.docs.extractComponentDescription`, plus `enhanceArgTypes` in `argTypesEnhancers`. `enhanceArgTypes` calls `extractArgTypes(component)` during story preparation and merges the result under the author's own `argTypes`.

The **Docgen Server** ([RFC](https://github.com/storybookjs/storybook/discussions/35333)) arrived in 10.5 behind `features.experimentalDocgenServer`. Extraction moves into a long-lived Node worker thread owned by core. A framework contributes a serializable `DocgenProviderDescriptor` — a module specifier, not a closure, since it has to cross a worker boundary — through the `experimental_docgenProvider` preset. The worker imports that module, calls its `createDocgenProvider()`, and folds the returned middleware into a provider chain. Results reach the manager and preview over the Open Service channel, and static builds get per-component JSON snapshots under `services/core/docgen/<id>.json`.

| | Legacy | Docgen Server |
|---|---|---|
| Storybook floor | all of `^10.0.0` | 10.5+, and opt-in per project |
| Runs on | dev-server main thread, in a Vite `transform` | Node worker thread, off the critical path |
| Static builds | inlined in the bundle | JSON snapshots written by core |
| Stability | stable since SB 6 | experimental; payload may change before SB 11 |

Only React ships a provider in 10.5; Vue 3 and Angular added theirs during 10.6-alpha.

### What we have

- `vitePluginAstroComponentMarker.ts` already owns the client-side `.astro` stub. It detects Astro's browser stub, replaces it with a factory carrying `isAstroComponentFactory` and `moduleId`, and reads the `.astro` source to inline styles and re-emit child imports. It is `enforce: 'post'`.
- `packages/@storybook-astro/renderer/src/preview-defaults.ts` is the single place default `docs.*` parameters live. It is deliberately free of virtual-module imports so the framework's CSF4 `definePreview` can merge it synchronously — CSF-factory stories never see the renderer's `entry-preview` annotation, so anything that must reach both authoring styles goes here.
- `renderer/src/entry-preview.ts` already registers an `argTypesEnhancer` that disables every control in static mode.
- `get-tsconfig` is a dependency, used in `src/lib/resolve-aliased-island.ts`.
- `typescript` is **not** a dependency of the framework package.
- `docs/specs/code-panel-source.md` already anticipates this work: its component-name resolution order starts with `component.__docgenInfo.displayName`.

### Prior art

[`astro-docgen-typescript`](https://github.com/SalahAdDin/astro-docgen-typescript) by @SalahAdDin — MIT, roughly 660 lines, unpublished — established the core technique and the output shape this spec adopts: lift the `.astro` frontmatter into a virtual TypeScript source file, serve it from a compiler host that delegates every other file to disk, and read the `Props` declaration off the type checker. Its `Astro.props` destructuring walker is the part worth porting closely.

We reimplement rather than depend on it. An unpublished single-maintainer package is not something to put on the critical path of the docs pipeline, and four of its behaviors need to change — each documented as a decision below.

## Design Decisions

**Decision 1 — Both delivery paths, sharing one extractor.** The legacy path is the default because it covers the whole `storybook: ^10.0.0` peer range; the Docgen Server is contributed only when `features.experimentalDocgenServer` is set. Shipping the server path alone would leave most users with no change at all. This mirrors `@storybook/vue3-vite`, which selects between `vue-docgen-api` and `vue-component-meta` on the same flag. Extraction logic lives in one place and neither path duplicates it.

The two are **mutually exclusive**. A worker thread has its own module registry, so enabling both would pay the full TypeScript warm-up cost twice for identical output. When the server path is active, the Vite plugin does not inject `__docgenInfo`.

**Decision 2 — Emit the `react-docgen-typescript` shape.** The extractor produces `{ displayName, description, props: { <name>: { name, required, type, description, defaultValue } } }` rather than Storybook's `StrictArgTypes`. `extractComponentProps` in `storybook/internal/docs-tools` consumes that shape directly, routing it through `javaScriptFactory` → `convert()` → `sbType`. That gives JSDoc tag parsing, `@ignore` handling, enum and union control inference, default-value formatting, and the existing string-quoting workaround for free. Converting to `StrictArgTypes` afterwards is a small mapping over `PropDef[]`, matching `@storybook/react`'s own `extractArgTypes`.

**Decision 3 — One long-lived `LanguageService`, never a program per file.** Measured against `astro/types` in this repo, where a single `createProgram` pulls in 243 source files:

| Strategy | first component | each subsequent |
|---|---|---|
| Fresh `ts.createProgram` per file | 358 ms | 190–711 ms |
| Shared `LanguageService` + `DocumentRegistry` | ~0.9 s once | 0–1.4 ms |

The legacy path runs inside a Vite `transform` on the dev server's critical path, so per-file program creation would cost roughly ten seconds of blocked transform time on a fifty-component Storybook. Steady-state heap for the shared service measured ~170 MB and stayed flat across edit cycles.

Beyond the obvious host members, three are load-bearing. `getProjectVersion()` lets TypeScript skip `synchronizeHostData` when nothing changed — without it every `getProgram()` walks all roots. `resolveModuleNameLiterals()` over a shared module-resolution cache is also where `./Child.astro` maps to that component's own virtual file; `astro/client.d.ts` declares no `*.astro` module, so without this every `.astro` import in frontmatter silently degrades to `any`. And ambient roots must be listed explicitly in `getScriptFileNames()` because nothing imports them: the project's `.astro/types.d.ts` and `src/env.d.ts`, plus a shim of our own declaring `*.astro` and `const Astro: any` — `Astro.props as Props` is otherwise a "cannot use namespace as a value" error.

Invalidation is driven by Vite's watcher into an explicit version map, not by `stat()` polling. Changes under `node_modules` need a dev-server restart, since Vite's watcher ignores it. The service must be `dispose()`d before it is ever replaced or the `DocumentRegistry` retains every acquired source file.

### The virtual TypeScript file

**Decision 4 — The virtual file is `<component dir>/<Name>.astro.ts`, and preserves byte offsets.** The prior art names it `virtual-frontmatter.ts` with no directory, so `./types` resolves against the process working directory instead of the component folder. The failure is invisible: TypeScript's error type still stringifies to the written type name, so the table looks plausible while `getApparentProperties()` returns nothing. This is very likely a contributing cause of #110.

Placing the file beside the component makes relative imports, tsconfig `paths`, package `exports` conditions and nearest-`package.json` resolution all behave exactly as they do for a real file in that folder. The `.astro.ts` suffix matches `@astrojs/language-server`, `svelte2tsx` and `vue-tsc`.

The virtual text is the **whole `.astro` file with everything outside the frontmatter blanked** — the opening `---` becomes `// `, and the template is replaced by spaces with every newline preserved. Every TypeScript position is then the exact offset in the real file, so diagnostics and declaration positions need no translation, and no prelude shifts line numbers. Compiler options come from the project `tsconfig.json` via `get-tsconfig`; `rootDir` is left alone, and virtual files enter through `getScriptFileNames()` because a user's `include` never covers `.astro`.

### Heritage rewrite

**Decision 5 — Rewrite `interface Props extends …` to a type alias when TypeScript rejects the heritage clause.** The component in #110 is written as:

```ts
interface Props<Tag extends HTMLTag = "button" | "a"> extends Polymorphic<{ as: Tag } & ButtonVariants> { … }
```

That is not valid TypeScript. `Polymorphic<…>` bottoms out in a deferred indexed access on a type parameter, and an interface may only extend types with statically known members (TS2312). TypeScript drops the entire base type: **three props are extracted instead of roughly two hundred**, with `as`, `variant`, `size`, `color` and `href` all missing. Astro's documented polymorphic idiom is the type alias, which has no such restriction.

Rewriting the declaration in the virtual file to `type Props<T…> = A & B & { members }` yields zero diagnostics and 199 apparent properties. The rewrite is conditional — applied only when the declaration is an interface, has heritage clauses, and `getSemanticDiagnostics` (measured at 4 ms) reports TS2312 within its range — because rewriting unconditionally would change declaration-merging semantics for the common case. It is applied as a TypeScript text edit rather than a regex; real `extends` clauses span lines and nest angle brackets.

**Decision 6 — Instantiate generics with their defaults, and merge across union constituents.** `getDeclaredTypeOfSymbol` on a generic `Props` returns `Props<Tag>` with the parameter unapplied. Appending `declare const __SB_PROPS__: Props;` to the virtual file and reading `getTypeAtLocation` on it applies the defaults; a parameter with no default falls back to its constraint, then `unknown`.

One subtlety justifies extra work. `keyof (A | B)` is the *intersection* of keys, so a union-defaulted tag collapses the surface:

| Instantiation | props | notable |
|---|---|---|
| `Props<"a" \| "button">` | 198 | `href` **absent** |
| `Props<"a">` | 206 | `href` present |
| `Props<"button">` | 210 | `type` present |
| merged | 218 | both |

When the resolved default is a union of eight or fewer string literals, instantiate once per constituent and union the property sets — sub-millisecond on a warm checker. The cap keeps `Tag extends HTMLTag = HTMLTag` from expanding to every HTML element.

### Prop filtering

**Decision 7 — Drop props declared *exclusively* under `node_modules`, and always keep destructured names.** A `Props` extending `HTMLAttributes` or `Polymorphic` measured at 199 properties, of which 191 come from `astro/astro-jsx.d.ts`. Unfiltered, every Astro props table is unusable. Three corrections to the conventional `react-docgen-typescript` recipe:

- **Filter on declaration source files, not `prop.parent`.** Props derived from `VariantProps<typeof x>` are `PropertyAssignment` nodes inside an object literal, so the prior art's parent lookup returns `undefined` for exactly the variant props authors care most about.
- **Keep a prop when *any* declaration sits outside `node_modules`.** A locally redeclared `disabled` also has a declaration in `astro/types`; an any-declaration-matches filter silently deletes it. Verified: the loose form keeps only `variant`, the correct form keeps `disabled` and `variant`.
- **Always keep names bound in the `Astro.props` destructuring pattern**, whatever their declaring file. We already walk that pattern for defaults, and it is the author's own statement of the public surface. On the #110 button this recovers `as`, `href` and `class` with no hardcoded allowlist.

Net effect on that component: roughly nine meaningful rows instead of three or two hundred. `docgen.propFilter` overrides the default using the `react-docgen-typescript` signature.

### Description precedence

**Decision 8 — Resolve descriptions through the AST, and strip non-standard tags.** A "floating" JSDoc block is not floating — TypeScript attaches it to the following statement, so `ts.getJSDocCommentsAndTags` finds it reliably. Precedence, first non-empty winning:

1. The first frontmatter statement whose JSDoc carries `@component` or `@description` — using the tag's text if present, otherwise the block's free text.
2. JSDoc on the `Props` declaration.
3. The frontmatter's leading `/** */` block, whatever statement it attaches to.
4. Empty.

Rule 3 deliberately does not exclude blocks attached to an import. Astro frontmatter puts imports first, so a description written at the top of a file usually lands on one — `PageCard.astro` in this repo is shaped exactly that way, and excluding imports silently dropped its description. What keeps the rule honest is that the block must be the *first* thing in the frontmatter; a JSDoc on the third import or on some mid-file constant is not a component description.

The prior art takes the first `/** */` in the file by regex, which happily picks up a license header or a JSDoc on an import.

Separately, `description` carries only the free text before the first tag; everything else goes to `__docgenInfo.tags` / `DocgenPayload.jsDocTags`. Storybook's `parseJsDoc` understands `@param`, `@returns`, `@deprecated` and `@ignore` only, and the #110 component's `@preview`, `@usage` and `@examples` blocks contain markdown and JSX that would otherwise render as noise. `@ignore` is preserved so docs-tools' existing prop-dropping still fires.

### Failure modes

**Decision 9 — Docgen is a side channel and never breaks rendering.** `transform` returns `null` on any failure and never throws. A wrong props table is cosmetic; a thrown error in a Vite `transform` is a blank preview iframe.

- **No TypeScript.** `typescript` is an optional peer dependency, loaded through a guarded dynamic import, with a version floor of 5.0 (`resolveModuleNameLiterals` and `getJSDocCommentsAndTags` behavior varies below it). One deduplicated warning, then docgen is skipped.
- **Type errors.** Diagnostics are *signal, not gate*. A file with an unresolved import, a missing default export and an `Astro`-as-value error still yielded correct types for every resolvable prop; refusing to extract unless diagnostics are empty would disable docgen for most real projects. TS2312 triggers the heritage rewrite; an unresolved-module diagnostic triggers a one-time warning naming the specifier, because that is the failure users cannot otherwise see.
- **No `Props` declaration.** Common for slot-only components. Return `{ displayName, description, props: {} }` rather than nothing, so the description still reaches autodocs. Bail before touching TypeScript when there is no frontmatter at all.

Failures are cached by content hash so a component that legitimately yields nothing does not re-run a type check on every HMR tick. In the worker path, failures are reported on `DocgenPayload.error`. Default values are narrowed to `string | number | boolean | null` before code generation so nothing can throw at serialization time.

**Decision 10 — Scan frontmatter with the existing house pattern.** `vitePluginAstroComponentMarker.ts` already extracts frontmatter with a line-anchored regex in `extractAstroImportSpecifiers` and `extractStyleBlocksWithLang`. Do the same rather than adopting `@astrojs/compiler`'s asynchronous WASM `parse()` — it keeps extraction synchronous, avoids a WASM load inside a worker thread, and matches the file it sits beside.

## Extraction Spec

Given a `.astro` file, the extractor produces:

| Field | Source |
|---|---|
| `displayName` | file basename without `.astro` |
| `description` | per [Description precedence](#description-precedence), free text only |
| `tags` | JSDoc block tags other than the description |
| `props[name].type.name` | `checker.typeToString`, with `\| undefined` stripped for optional props |
| `props[name].type.value` | literal union constituents, when the type is a union of literals |
| `props[name].required` | not optional **and** no destructuring default |
| `props[name].description` | `symbol.getDocumentationComment(checker)` |
| `props[name].defaultValue` | destructuring default, else the `@default` tag, else absent |
| `props[name].parent` | declaring interface or type alias; falls back to the declaring source file and nearest named ancestor |

Default values are read from the top-level `Astro.props` destructuring, including the `as Props` and `satisfies Props` forms:

| Frontmatter | `defaultValue.value` |
|---|---|
| `const { a = 'x' } = Astro.props` | `"x"` |
| `const { a = 42 } = Astro.props` | `42` |
| `const { a = true } = Astro.props` | `true` |
| `const { a = defaultLinks } = Astro.props` | `"defaultLinks"` (source text) |
| `const { a } = Astro.props` + `/** @default 'x' */` | `"x"` |
| `const { a } = Astro.props` | absent → prop is required |

## Implementation Plan

### Step 1 — The extractor

`packages/@storybook-astro/framework/src/docgen/`, with no Storybook or Vite imports so it unit-tests in isolation:

- `types.ts` — the output shape from Decision 2, and `AstroDocgenOptions`.
- `tsProject.ts` — the shared `LanguageService`, `DocumentRegistry` and host from Decision 3.
- `virtualFile.ts` — offset-preserving blanking, the conditional heritage rewrite, the `__SB_PROPS__` probe.
- `extract.ts` — pure `(checker, sourceFile, astroFilePath)`: instantiation, union merge, description precedence, filtering.
- `defaultValues.ts` — the `Astro.props` destructuring walker, ported closely from the prior art.
- `propFilter.ts` — the Decision 7 default plus overrides.
- `cache.ts` — content-hash memory cache plus `createFileSystemCache` from `storybook/internal/common`.

Add `typescript` as an optional peer dependency and to `tsup.config.ts` `external`.

**Exit criteria**: `src/docgen/*.test.ts` green, covering every measured failure above — the TS2312 heritage case (3 props before the rewrite, 199 after), a relative frontmatter import and a `Props` imported from a sibling module (both silently empty if the virtual path is wrong), `VariantProps` props with no `prop.parent`, a locally redeclared `disabled`, `href` reachable only through the union merge, literal unions, `Astro.props as Props`, a component with no `Props`, and one with no frontmatter.

### Step 2 — Legacy path

- Extend `vitePluginAstroComponentMarker.ts` to attach `__docgenInfo` to the stub it already generates. Its `transform` becomes async. Warm the service in `buildStart` without awaiting, so the one-time cost overlaps Storybook's boot.
- Add `docgen?: false | AstroDocgenOptions` to `BaseFrameworkOptions` in `src/types.ts`, threaded through the existing `options` object in `viteFinal`. Skip when the docs addon is absent, when `build.test.disableDocgen` is set, and for `.astro` files reached only as children.
- New `renderer/src/entry-preview-argtypes.ts` exporting `parameters.docs.{extractArgTypes, extractComponentDescription}` and `argTypesEnhancers: [enhanceArgTypes]`.
- Register the `docs.*` extractors in `preview-defaults.ts` so both the CSF3 annotation and the framework's CSF4 `definePreview` pick them up.

`enhanceArgTypes` must run **before** the static-mode enhancer in `entry-preview.ts`. Reversed, newly extracted props appear with live controls in a static build, where they do nothing.

**Exit criteria**: an autodocs page in `integration/astro6` shows a populated description and props table with no `argTypes` in the story file.

### Step 3 — Docgen Server provider

- `src/docgen/docgen-worker.ts` exporting `createDocgenProvider()`, satisfying `DocgenWorkerModule`. Resolve `meta.component` from the index entry's story file back to a `.astro` path, run the extractor, return a `DocgenPayload`. Merge with downstream by spread and `??`, per the contract in Storybook's own `docgen/types.ts`.
- Component resolution uses `storybook/internal/csf-tools`. `createMetaComponentResolver` is a 10.6 addition and absent in 10.5.2, so feature-detect it.
- `src/preset.ts` exports `experimental_docgenProvider`, returning a descriptor only when the feature flag is set.
- Add `./docgen-worker` to the package exports and `tsup.config.ts` — core imports the descriptor's module specifier by absolute path, so it must be separately emitted.

**Exit criteria**: with `features.experimentalDocgenServer` enabled in one integration app, the props table matches the legacy path's output, and the Vite plugin no longer injects.

### Step 4 — Integration components and stories

The integration environments would currently hide the feature rather than demonstrate it. Around twenty Astro story files hand-write `argTypes` — though only nine distinct blocks, since the astro5/6/7 copies are byte-identical — and `enhanceArgTypes` merges extracted types *under* the author's, so those pages would render unchanged. Two of those blocks have already drifted from their components: `Footer`'s documented `links` default and `Header`'s documented `navItems` default both describe values the components no longer have.

Meanwhile no first-party component exercises the hard paths. There are no uses of `Polymorphic`, `HTMLAttributes`, `VariantProps`, `cva()`, generic `Props<T>` or intersection `Props` anywhere, every `Props` is declared inline in its own file, and while one component carries a real JSDoc block, **no `Props` member in the repository has one at all**.

Order matters: **author JSDoc before removing any `argTypes`**, or the pages go blank in between.

1. Add component and per-prop JSDoc to the nine components carrying workarounds, fixing the two stale defaults in passing.
2. Convert the eleven `//` header comments that already hold real prose into `/** */` blocks — the cheapest description coverage available.
3. Remove the duplicated `argTypes` and `docs.description.component`. Keep `docs.description.story`, which documents story intent rather than component API. Anything surviving should be a deliberate override.
4. Tighten loose prop types encountered along the way — `ImageText` declares `imageSrc: any` while its story's table claims `ImageMetadata | string`.
5. Add the missing fixtures: a polymorphic `Button` modeled on the #110 component, and one component importing its `Props` from a sibling module.
6. Collapse `Astro.mdx`, a byte-identical third copy of the prop catalogue that is already incomplete.

Two components make good first tests. `PageCard.astro` is the only one with both an existing JSDoc block and an overlapping story description, so it proves end to end that a real block reaches the page and displaces the story's copy. `ProjectStats.astro` has the widest surface — eight props, seven defaulted — and no stories at all, so nothing conflicts.

**Exit criteria**: every page whose `argTypes` block was deleted renders equivalent content. One should gain a row: `GithubStars.fallbackStars` is declared in `Props` but missing from its story's `argTypes`.

### Step 5 — Documentation and release

- Rewrite `apps/website/src/content/docs/writing-stories/controls.md`. It currently teaches the workaround as the primary pattern, hand-writing every description and type summary for `ImageText`. Reframe it: JSDoc on the component is the source of truth, `argTypes` overrides it. The static-build section stays.
- Add a page covering the `docgen` framework option, the prop-filter default, and the JSDoc conventions honored.
- Flip the roadmap entry and the feature-table row to ✅ and drop the workaround note.
- Remove the "no docgen info yet" note in `code-panel-source.md` and land the `__docgenInfo.displayName` branch its name resolution already anticipates.
- Note the new files in `AGENTS.md`.

## Known Limitations

- **Slots are not documented.** Named `<slot name="…">` elements are part of an Astro component's API but have no TypeScript representation, so they do not appear in the props table. Authors continue to describe them in prose.
- **Static builds keep controls disabled.** Extracted props render in the table with their types and defaults, but the existing static-mode enhancer still disables every control, because pre-rendered components cannot re-render with new args.
- **`node_modules` changes need a restart.** Vite's watcher ignores `node_modules`, so installing or upgrading a package that contributes types will not invalidate the language service.
- **Untyped components get no props.** A component that destructures `Astro.props` without declaring `Props` yields a description and an empty table; inferring props from the destructuring pattern alone would type every one of them `any`.
- **One extraction engine at a time.** Enabling `experimentalDocgenServer` disables the Vite-plugin path rather than merging the two.
- **Framework component stories** (`parameters.renderer`) are untouched — their docgen belongs to the delegated renderer, which our framework does not load.
