# AGENTS.md - AI Development Guide

This document provides guidance for AI assistants working on the `@storybook-astro/framework` project. It covers architecture, conventions, and common development tasks.

## Project Overview

**Goal**: Enable Astro components to work in Storybook by implementing a custom Storybook framework integration.

**Status**: Experimental - not production-ready

**Key Technologies**:
- Astro 5.5.3+, 6, and 7 (using Container API for SSR)
- Storybook 10+
- Vite 6+ (7.x and 8.x supported; Astro 7 uses Vite 8 / Rolldown)
- TypeScript/JavaScript (ES modules only)
- Multiple UI framework integrations (React, Vue, Svelte, Preact, Solid, Alpine.js)

## Architecture

### Two-Package System

#### 1. `packages/@storybook-astro/framework` (Server/Framework)
**Purpose**: Storybook framework definition and server-side rendering

**Key Responsibilities**:
- Configure Vite to handle Astro components
- Set up Astro Container for server-side rendering
- Manage framework integrations (React, Vue, etc.)
- Handle module resolution for Astro runtime

**Important Files**:
- `src/preset.ts` - Framework configuration, exports `viteFinal` and `core` config
- `src/middleware.ts` - Creates Astro Container, exports `handlerFactory`, includes `patchCreateAstroCompat` for Astro compiler v2/v3 bridging
- `src/astroRenderHandler.ts` - `createAstroRenderHandler`, the shared handler `handlerFactory` and the standalone server both call into. Resolves slot trees (`reconstructSlots`) and, when a render request carries a decorator tree (`node`), resolves it the same way via `renderDecoratedRoot`
- `src/viteStorybookAstroMiddlewarePlugin.ts` - Vite plugin that handles render requests via HMR
- `src/vitePluginAstroComponentMarker.ts` - Patches Astro's client-side `.astro` stubs (Astro 6+ and Astro 7's Rust compiler) to set `isAstroComponentFactory`. In dev it also re-imports child `.astro` files so editing a child reruns the story
- `src/lib/componentStyles.ts` - Collects the scoped CSS Astro compiled for every component a render loaded. The render handler prepends it to the HTML, one `<style>` element per block, and the renderer's `storyStyles.ts` moves those into the iframe head
- `src/vitePluginAstroFonts.ts` - Resolves Astro's Font Provider API in Storybook's SSR context and auto-loads fonts declared in `astro.config.*`
- `src/portable-stories.ts` - `composeStories`/`composeStory` for testing outside Storybook
- `src/docgen/` - Extracts component descriptions and prop tables from `.astro` frontmatter JSDoc. `index.ts` owns the runtime (guarded `typescript` import, tsconfig discovery, caching), `tsProject.ts` the one shared TypeScript language service, `extract.ts` the extraction itself. `docgen-worker.ts` and `docgen-payload.ts` are the Storybook 10.6 Docgen Server path: the worker-target module core's docgen worker imports, and the index-entry-to-`DocgenPayload` step behind it. Design record: `docs/specs/docgen.md`
- `src/integrations/` - Integration adapters for each supported framework

#### 2. `packages/@storybook-astro/renderer` (Client)
**Purpose**: Client-side rendering logic in Storybook's preview iframe

**Key Responsibilities**:
- Render components in Storybook canvas
- Send render requests to server middleware
- Handle framework fallback rendering
- Manage styles and script hydration

**Important Files**:
- `src/render.tsx` - Exports `render()` and `renderToCanvas()` functions
- `src/storyStyles.ts` - Moves the scoped `<style>` elements a render response carries into the iframe head. Each canvas owns its copies until the next render into it replaces them or the teardown `renderToCanvas` returns removes them
- `src/preset.ts` - Defines preview annotations
- `src/extractArgTypes.ts` - Maps the `__docgenInfo` the framework attaches to a component stub into Storybook's props table. Registered through `preview-defaults.ts` so both CSF3 and CSF-factory stories pick it up, and exported as `./extractArgTypes` so the framework's docgen worker converts identically on the Docgen Server path
- `src/docs/` - Docs "Show code" / Code Panel source. `generateAstroSource.ts` turns a story's component and args into Astro template text (pure, no Storybook imports); `sourceDecorator.ts` emits it via `emitTransformCode`. Shipped as the `entry-preview-docs` annotation, which `preset.ts` loads only when addon-docs is enabled. Design record: `docs/specs/code-panel-source.md`
- `src/decorators.ts` - `applyDecorators`, the renderer's `applyDecorators` project annotation. Composes a story's `decorators` array into a `SlotValue` tree for Astro stories (Decision 2 in `docs/specs/decorators.md#design-decisions`), or defers to Storybook's `defaultDecorateStory` for framework-delegated stories (`parameters.renderer` set)

### Data Flow

**Astro components** (server-side rendered):
```
Story File (.stories.jsx)
    ↓
@storybook-astro/renderer (decorators.ts)
    ↓ [applyDecorators composes the story's decorators into a SlotValue tree]
@storybook-astro/renderer (render.tsx)
    ↓ [detects isAstroComponentFactory flag]
    ↓ [serializes the tree and sends ONE render request via Vite HMR, tree on the `node` field]
@storybook-astro/framework (middleware.ts → astroRenderHandler.ts)
    ↓ [patchCreateAstroCompat wraps component]
    ↓ [reconstructSlots/renderDecoratedRoot resolves the tree depth-first, story leaf gets the full args pipeline]
    ↓ [Astro Container API renders to HTML]
@storybook-astro/renderer (render.tsx)
    ↓ [injects HTML into canvas]
    ↓ [scoped <style> elements arrive with the HTML and move to the iframe head; executes client scripts]
Storybook Canvas (rendered component, decorators included)
```

**Framework components** (React, Solid, Vue, etc. — delegated):
```
Story File (.stories.jsx)
    ↓
@storybook-astro/renderer (render.tsx)
    ↓ [checks parameters.renderer]
    ↓ [delegates to framework renderToCanvas BEFORE calling storyFn()]
Framework Renderer (e.g. @storybook/react-vite)
    ↓ [manages its own reactive root]
Storybook Canvas (rendered component)
```

## Code Conventions

### General
- **Module System**: ES modules only (`"type": "module"` in package.json)
- **File Extensions**: Use `.ts`, `.tsx`, `.js` explicitly in imports
- **Package Manager**: Yarn 4+ (Berry) with workspaces
- **Workspace Protocol**: Use `workspace:*` for internal package dependencies

### TypeScript
- TypeScript is used with proper types where possible
- `AstroRenderer` (extending `WebRenderer`) is the canonical renderer type used for Storybook generics
- Type definitions are in `types.ts` files in each package

### Naming
- Framework integration files: `packages/@storybook-astro/framework/src/integrations/[framework].ts`
- Vite plugins: Prefixed with `vite` or `vitePlugin`
- Virtual modules: Named like `virtual:astro-container-renderers`

### Imports
```typescript
// Good - explicit extension
import { handlerFactory } from './middleware.ts';

// Bad - no extension
import { handlerFactory } from './middleware';
```

### Documentation

Never commit AI planning documents, speculative implementation plans, or proposal docs unless explicitly asked. `docs/specs/` is the exception and is not a planning area: it holds design records for features that have shipped — behavior contracts and the rationale behind them. Source comments cite those files by anchor (`docs/specs/decorators.md#server-snapshot`), so renaming a heading there breaks references; `yarn lint:links` checks them. Prefer implementing the feature, updating real user-facing docs, or leaving planning notes in the conversation instead of adding files to the repo.

### Readability

Write code that is nice to read. Optimize for first-read understanding by a tired engineer, not for cleverness, symmetry, or showing off patterns.

- Prefer boring, direct code over clever abstractions.
- Use names that describe the user or product workflow, not the implementation trick.
- Choose names that read like normal English.
- Keep ownership obvious: a file should make clear what state, side effects, and workflows it owns.
- Do not add helpers, wrappers, callbacks, types, or layers unless they clearly improve readability.
- Do not hide simple one-off conditions behind grand helper names.
- Comments should explain why code exists or what boundary it owns, not restate obvious syntax.
- `useEffect` blocks should usually have a short comment explaining the side effect's job.
- JSDoc is useful for non-trivial hooks, helpers, and components when it helps orientation; skip it for obvious names.
- Tests should read like behavior or business scenarios, not framework plumbing.
- Keep readability refactors minimal and focused; do not rewrite large files unless behavior or clarity genuinely requires it.

Before finishing a change, ask whether every abstraction pays rent. If removing a helper, wrapper, comment, or type would make the file easier to understand, remove it.

## Common Development Tasks

### Adding a New Framework Integration

1. Create integration file: `packages/@storybook-astro/framework/src/integrations/[framework].ts`
2. Extend `BaseIntegration` class from `base.ts`
3. Implement required methods:
   - `getAstroRenderer()` - Returns Astro integration
   - `getVitePlugins()` - Returns Vite plugins for the framework
   - `getStorybookRenderer()` - Returns Storybook renderer name
   - `resolveClient()` - Handles client-side module resolution
4. Export factory function in `integrations/index.ts`
5. Add to `.storybook/main.js` configuration example

**Template**:
```typescript
import { BaseIntegration, type BaseOptions } from './base.ts';

export type Options = BaseOptions & {
  // Framework-specific options
};

export class FrameworkIntegration extends BaseIntegration {
  constructor(options?: Options) {
    super(options);
  }

  override getAstroRenderer() {
    // Return Astro framework integration
    return frameworkIntegration(/* config */);
  }

  override getVitePlugins() {
    // Return Vite plugins needed for this framework
    return [frameworkVitePlugin(/* config */)];
  }

  override getStorybookRenderer() {
    return '@storybook/framework-name';
  }

  override resolveClient(specifier: string) {
    // Handle client-side module resolution if needed
    return null;
  }
}
```

### Modifying the Render Pipeline

**Server-side (middleware.ts)**:
- Modify `handlerFactory` to change how Astro Container is created
- Update `handler` function to change render logic
- `patchCreateAstroCompat` bridges the Astro compiler v2 (3-arg `createAstro`) and v3/v6 (2-arg) calling conventions — modify if the Astro compiler changes again
- Container configuration includes custom `resolve` function for module resolution

**Client-side (render.tsx)**:
- `renderToCanvas` delegates to framework renderers BEFORE calling `storyFn()` — this ordering is critical for frameworks like Solid that manage their own reactive roots
- Modify `renderAstroComponent` to change request/response handling
- `astroRenderer.applyStyles` re-runs Vite's injected style modules in dev. Astro component styles don't go through it: they arrive with the rendered HTML (see [Styles Not Applying](#styles-not-applying))
- `activateScriptTags` re-executes `<script>` tags after HTML injection for hydration

### Debugging

**Enable Verbose Logging**:
```javascript
// Add console.log statements in:
// - packages/@storybook-astro/framework/src/middleware.ts (server rendering)
// - packages/@storybook-astro/renderer/src/render.tsx (client rendering)
```

**Check Vite HMR Communication**:
```javascript
// In browser console:
import.meta.hot?.on('astro:render:response', (data) => {
  console.log('Render response:', data);
});
```

**Inspect Astro Container**:
```typescript
// In middleware.ts handlerFactory:
const container = await AstroContainer.create({ /* config */ });
console.log('Container created:', container);
```

### Testing

**Automated Testing**: Run with `yarn test`
- Uses Vitest with happy-dom environment
- Config: `vitest.config.ts`
- Test files use `.test.ts` extension
- All 17 test suites (36 tests) pass, covering Astro, React, Vue, Svelte, Preact, Solid, and Alpine.js

**Manual Testing**: Run with `yarn dev` or a workspace `dev` script such as `yarn workspace @storybook-astro/integration-astro6 dev`
- Example stories in `src/components/*/`
- Test different framework integrations
- Check browser console for errors

#### Testing Architecture

**Portable Stories (`composeStories`)**:
The project includes a complete `composeStories` implementation in `packages/@storybook-astro/framework/src/portable-stories.ts` that enables testing Storybook stories outside the Storybook environment.

```typescript
// Available functions
import { composeStories, composeStory, setProjectAnnotations } from '@storybook-astro/framework';

// Example usage
const { Default, Highlighted } = composeStories(stories);
```

**Test Utilities**:
Testing runtime APIs are available from `@storybook-astro/framework/testing` (`packages/@storybook-astro/framework/src/testing.ts`):

- `composeStories(storiesImport, projectAnnotations?)` - Compose all stories from import
- `composeStory(story, componentAnnotations, projectAnnotations?, exportsName?)` - Compose single story
- `setProjectAnnotations(annotations)` - Set global config for tests
- `renderStory(story)` - Render composed story via Astro SSR in tests

Vitest-specific config helpers are available from `@storybook-astro/framework/vitest` (`packages/@storybook-astro/framework/src/vitest/index.ts`):

- `defineConfig(options)` - Vitest config helper with Astro integration wiring

`defineConfig` wires required test internals automatically.

**Test Structure**:
All component tests follow a uniform pattern:
```typescript
import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './Component.stories.jsx';

const { Default } = composeStories(stories);

test('Component Default renders via SSR', async () => {
  await renderStory(Default);
  expect(screen.getByText('Expected text')).toBeInTheDocument();
});
```

### Developing Portable Stories

**Implementation Location**: `packages/@storybook-astro/framework/src/portable-stories.ts`

The portable stories implementation provides testing capabilities outside Storybook. Key components:

- **Render Function**: Mimics the main renderer's behavior for testing — detects Astro components via `isAstroComponentFactory`, delegates framework components by `parameters.renderer`
- **Storybook API Compatibility**: Matches the API of other framework portable stories implementations
- **brokenRenderers**: Currently an empty array `[]`. If a framework integration breaks, add its name here to produce clear test failures instead of cryptic errors

**Exports**:
- `composeStories(storiesImport, projectAnnotations?)` - Compose all stories from import
- `composeStory(story, componentAnnotations, projectAnnotations?, exportsName?)` - Compose single story
- `setProjectAnnotations(annotations)` - Set global config for tests

### Building

The framework and renderer are library packages consumed from `dist`:
- Run `yarn build:packages` before integration builds, Vitest runs that import package entrypoints, or manual Storybook checks.
- For local development, keep the package watcher running with `yarn dev:packages` while editing framework or renderer source.
- Integration apps import package entrypoints exactly like consumers do, so stale `dist` means stale integration behavior.

### Publishing to npm

**IMPORTANT: Always use `yarn npm publish`, never raw `npm publish`.**

The framework package depends on the renderer via `workspace:*`. Yarn Berry resolves this to the actual version at publish time. Raw `npm publish` does not understand `workspace:` and will publish it verbatim, breaking installs for consumers.

Publish order matters — renderer first, then framework. **Always clean and rebuild before publishing** to avoid stale tsup output:
```bash
cd packages/@storybook-astro/renderer
rm -rf dist && yarn build
yarn npm publish --tag beta --access public

cd ../framework
rm -rf dist && yarn build
yarn npm publish --tag beta --access public
```

> **Stale build warning**: The `prepublishOnly` hook runs `tsup`, but tsup may reuse cached output that omits recent source changes. Always `rm -rf dist` before building. After building, verify your changes are in the dist (e.g. `grep` for a known string in `dist/chunk-*.js`) before publishing.

After publishing, promote to `latest` dist-tag so `npm install @storybook-astro/framework` gets the new version:
```bash
npm dist-tag add @storybook-astro/renderer@<version> latest
npm dist-tag add @storybook-astro/framework@<version> latest
```

See [`docs/RELEASING.md`](./docs/RELEASING.md) for the full release process.

## Key Concepts

### Astro Container API
- Server-side rendering without a full Astro build
- Created in `middleware.ts` via `AstroContainer.create()`
- Renders components to HTML string: `container.renderToString(Component, { props, slots })`

### Virtual Modules
```typescript
// Defined in Vite plugins
'virtual:astro-container-renderers' // Provides addRenderers function
'virtual:storybook-renderer-fallback' // Provides framework renderers
```

### Component Detection
Astro components are identified by:
```typescript
if (Component.isAstroComponentFactory) {
  // This is an Astro component — route to server-side rendering
}
```

**Astro 6+ note**: Since Astro 6, the client-side Vite transform of `.astro` files no longer sets this flag, and Astro 7's Rust compiler (now the default) behaves the same way. The `vitePluginAstroComponentMarker` plugin detects the stub pattern (which throws "Astro components cannot be used in the browser") and replaces it with a stub that sets `isAstroComponentFactory = true`, and preserves `moduleId`. The stub carries no CSS: scoped styles ship with the server-rendered HTML (see Styles Not Applying below). The single detection string covers Astro 5–7.

### Framework Fallback
Stories can specify a renderer to bypass Astro rendering:
```javascript
export const MyStory = {
  parameters: {
    renderer: 'react', // Uses React renderer directly
  },
};
```

## Common Issues

### Module Resolution Errors
**Symptom**: `Cannot find module` or `Failed to resolve import`
**Fix**: Check that file extensions are included in imports and that virtual modules are properly configured in Vite plugins. For Astro font modules, check `vitePluginAstroFonts.ts`.

### Styles Not Applying
**Symptom**: Component renders but styles are missing
**Fix**: Scoped CSS ships with the render response: `createAstroRenderHandler` prepends one `<style data-storybook-astro-styles>` element per `<style>` block, from `loadComponentStyles` in `lib/componentStyles.ts`. That function walks the SSR server's module graph from every component the render loaded and loads each `?astro&type=style&index=N&lang.*` sub-module with `&inline`. The renderer then moves them into the iframe head (`moveStoryStylesToHead` in the renderer's `storyStyles.ts`). Each canvas owns its copies: a rerender replaces them at the end of the head, and the teardown `renderToCanvas` returns removes them with the story's markup whenever Storybook removes the story (navigation, remount, leaving a Docs page, the end of a portable story run). Server-mode stylesheet links go in ahead of all story CSS, so the story CSS wins ties against them however the page was reached. CSS added to the head later, such as a hydrated island's, still wins ties against it, as in 1.14. Check that the `<style>` elements are in the response, that they reach the head, and that their selectors use the same `data-astro-cid-*` as the markup.

If only one component's styles are missing, check that the render used it: the story's `component`, a component in its args, slots or decorator tree that the handler loaded, or a component reachable through their imports. The walk doesn't follow a stylesheet's imports, so a component that only a CSS file or a PostCSS plugin refers to isn't included.

### Props Not Passing Through
**Symptom**: Component renders but props are undefined or wrong
**Fix**: Check `patchCreateAstroCompat()` in `middleware.ts`. The Astro compiler v2 calls `createAstro($$Astro, $$props, $$slots)` (3 args) but the Astro 6 runtime expects `createAstro($$props, $$slots)` (2 args). The wrapper detects and bridges this.

### Framework Components Render Blank or Show React Elements
**Symptom**: A framework component (e.g. Solid) shows nothing or logs "Unrecognized value. Skipped inserting {$$typeof: Symbol(react.transitional.element)}"
**Fix**: Check that the framework's `include` glob in `.storybook/main.js` uses recursive `**` patterns (e.g. `**/solid/**` not `**/solid/*`). A non-recursive glob won't match files in subdirectories, causing them to be compiled by `@vitejs/plugin-react` instead of the correct framework plugin.

### HMR Not Working
**Symptom**: Changes don't reflect without full reload
**Fix**: Verify Vite HMR event listeners are registered in `render.tsx` init function

### Framework Integration Not Working
**Symptom**: Framework components don't render or throw errors
**Fix**: 
1. Check that integration is added to `.storybook/main.js` with recursive `include` globs
2. Verify Vite plugins are returned from `getVitePlugins()`
3. Ensure Astro renderer is configured correctly in `getAstroRenderer()`
4. In `render.tsx`, framework renderers are delegated to BEFORE `storyFn()` — if this order is wrong, reactive frameworks will have orphaned effects

### Alpine.js Not Starting
**Symptom**: Alpine.js components are not interactive
**Fix**: Check that Alpine is started in the init function of `render.tsx` and that entrypoint file exists

## Development Workflow

1. **Start Storybook**: `yarn dev` or `yarn workspace @storybook-astro/integration-astro6 dev`
2. **Make Changes**: Edit files in `packages/@storybook/*/src/`
3. **Test**: Changes hot-reload automatically (most of the time)
4. **Verify**: Check browser console and Storybook UI for errors
5. **Run Tests**: `yarn test` before committing

### Before Opening a PR

AI-generated changes get an independent review before the PR is opened. The requirement is that the reviewer starts from **fresh context**: a new agent session that sees only the committed changes, not the session that wrote them. A reviewer that shares the author's context tends to confirm the author's reasoning. Any AI tool can satisfy this; the commands below are for Claude Code.

- [ ] `nvm use`, then `yarn lint`, `yarn lint:links`, and `yarn test` pass
- [ ] All changes are committed and `git status` shows no modified files. The review can also pick up uncommitted changes, so a dirty working tree mixes work that isn't going into the PR into the review
- [ ] Your local `develop` is current: `git fetch origin develop:develop` (run it from your feature branch). The review compares against it, so a stale `develop` pulls unrelated commits into the review
- [ ] In a fresh session (new terminal, or `/clear`), run `/code-review high <your-branch>`. Use `xhigh` for changes to `render.tsx`, `middleware.ts`, or the [Astro version compatibility layers](#astro-version-compatibility-layers)
- [ ] Give the reviewer only the target, not an explanation of the change
- [ ] Each finding is fixed or deliberately dismissed with a reason
- [ ] If the fixes change behavior or touch code beyond the findings, re-run the review on the updated branch

After the PR is open, later rounds can target it by number (`/code-review high <pr-number>`). That doesn't replace the review above. Add `--comment` only if you want the findings posted on the PR; it posts them as-is, so triage first.

When you finish writing a change that's headed for a PR, tell the user to run this review in a fresh session instead of reviewing your own work.

## External Resources

- [Storybook Framework API](https://storybook.js.org/docs/configure/integration/frameworks)
- [Astro Container API Docs](https://docs.astro.build/en/reference/container-reference/)
- [Vite Plugin API](https://vitejs.dev/guide/api-plugin.html)
- [Original Feature Request](https://github.com/storybookjs/storybook/issues/18356)

## Versioning and Branching

See [`docs/RELEASING.md`](./docs/RELEASING.md) for the full release process, including:
- Semantic versioning conventions
- Gitflow branching model (`main`, `develop`, `feature/*`, `fix/*`, `release/*`)
- Distinction between **package releases** (go through `develop` → `main`) and **website-only changes** (merge directly to `main`)
- Hotfix and mixed-change workflows
- Pre-publish smoke test (`yarn smoke`)

## Getting Help

When asking for help from AI or humans:
1. Include the full error message and stack trace
2. Specify which package the issue is in (`@storybook-astro/framework` vs `@storybook-astro/renderer`)
3. Mention what you were trying to accomplish
4. Include relevant code snippets with file paths
5. Note whether the issue is server-side (Node/Vite) or client-side (browser)

## Astro Version Compatibility Layers

These are the key adaptations that keep Astro 5, 6, and 7 working. If Astro's APIs change in future releases, these are the places to update. (The user-facing version of this is `apps/website/src/content/docs/how-it-works/version-compatibility.md`.)

1. **`vitePluginAstroComponentMarker.ts`** — Detects the client-side stub pattern and replaces it. Astro 6's Go compiler and Astro 7's Rust compiler (now the default) both emit the same `"Astro components cannot be used in the browser"` string, so one detection check covers Astro 5–7. If a future compiler changes the stub text or reintroduces `isAstroComponentFactory`, update the string here (components will render blank if it stops matching).
2. **`patchCreateAstroCompat()` in `middleware.ts`** — Bridges the 3-arg and 2-arg `createAstro` calling conventions. It inspects the runtime argument count and adapts, so it handles whichever convention the compiler emits. Can be removed once every supported compiler matches the runtime.
3. **`vitePluginAstroFonts.ts`** — Resolves Astro's Font Provider API in Storybook's SSR context and auto-loads fonts declared in `astro.config.*`. Can be simplified if Astro's font plugin handles the Storybook SSR context directly.
4. **Framework delegation order in `render.tsx`** — `renderToCanvas()` delegates to framework renderers BEFORE calling `storyFn()`. Reordering this can break reactive framework rendering.
5. **Vite 8 optimizer options in `preset.ts`** — `optimizeDeps.esbuildOptions` is set only on Vite ≤7; Vite 8 (Rolldown) reads `rolldownOptions`. The version is detected via `import { version } from 'vite'`.
6. **`lib/componentStyles.ts`** — Finds a component's styles by Astro's internal style sub-module id (`Component.astro?astro&type=style&index=N&lang.css`) and loads them with Vite's `&inline` query. If Astro renames that id, stories render unstyled without an error.

## Future Considerations

- **Performance**: Current implementation makes network requests for each render
- **Type Safety**: Many areas use loose typing that could be improved
- **Testing**: Expand test coverage for edge cases and error scenarios
- **Error Handling**: Better error messages and recovery
- **Documentation**: API documentation and more usage examples
- **Production Build**: Static build support (currently dev-only)
- **Portable Stories**: Consider delegating to framework-specific composeStories when available
- **Astro 8+**: Astro 5, 6, and 7 are supported today. Monitor for breaking changes in future major releases and adjust the compatibility layers above accordingly.
