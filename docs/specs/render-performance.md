# Dev-Mode Render Performance

## Problem Statement

Every Astro story render in dev mode is a round trip: the preview iframe serializes the story's args and decorator tree, sends them over Vite's HMR WebSocket, the framework's internal Vite server loads and SSR-renders the component through the Astro Container, and the HTML travels back to be injected into the canvas. Users report a few seconds per render on fast machines, worse on slow ones — most painfully on the first render of a story, on docs pages with many stories, and while scrubbing controls.

**Reference**: [Issue #164 — Enhance Render Performance](https://github.com/storybook-astro/storybook-astro/issues/164)

### Correcting the issue's premises

The issue suggests "cache the Astro Container instance across renders rather than recreating it per request." **The container is already cached**: `handlerFactory` (`framework/src/middleware.ts`) creates one `AstroContainer` per handler, the handler lives across renders, and `createAstroRenderHandler` additionally caches loaded component factories in `componentCache`. The internal Vite server's module graph caches transforms on top of that. Per-request container recreation is not where the time goes. This spec replaces that direction with fixes aimed at the costs that actually exist (below), keeps the issue's idle-preloading direction in adapted form, and rejects its streaming direction (Decision 7).

## Current State

The dev render path (`viteStorybookAstroMiddlewarePlugin.ts` → `middleware.ts` → `astroRenderHandler.ts`, client side `renderer/src/render.tsx` + `framework/src/renderer/renderer-dev.ts`) has five measurable cost centers:

1. **Cold module load.** The first render of each story pays `ssrLoadModule` for the `.astro` component and its full dependency graph on the internal Vite server — Astro compilation included. This is the "few seconds" case. Warm rerenders skip it via `componentCache` and Vite's module graph.
2. **Blanket cache invalidation.** `configureServer` wires `resetHandler` to `add`/`change`/`unlink` on **two** watchers (Storybook's server and the internal server, whose watched trees overlap, so most edits fire it twice). Each firing **eagerly** runs `createHandler()`: a new container, `addRenderers`, and an empty `componentCache` — even when the changed file is unrelated to any story, and even when no render ever follows. The next render then re-resolves everything the old handler had cached.
3. **Global render serialization.** `createAstroRenderHandler` funnels every render through a single `renderQueue`. The queue is a correctness fence introduced with story-level mocking (`runWithStoryRules` installs **process-global** module mocks and may invalidate the whole module graph; two concurrent renders with different rule sets would cross-contaminate). But it serializes _all_ renders, including the vast majority that use no rules — so a docs page with ten stories renders them strictly one after another, and a slow story blocks every story behind it (head-of-line blocking).
4. **No request coalescing.** Scrubbing a control fires a render request per change event. The client (`renderer-dev.ts`) tracks each by UUID and applies every response in arrival order; the server renders every one. Nothing supersedes a stale in-flight request when a newer one for the same canvas exists.
5. **Fixed 5s response timeout.** `render(data, timeoutMs = 5000)` rejects with `AstroRenderServerUnavailableError` if no response arrives in 5s. A cold first render that legitimately takes longer (cost 1 + a queue behind it, cost 3) is misreported as "Unable to reach Astro rendering server" — a false failure caused by slowness, which makes the performance problem look like an outage.

Minor: `server.ws.send` broadcasts every render response to all connected clients (each filters by pending id); `applyStyles` rescans every `<style data-vite-dev-id>` per render. Real but small.

What is _not_ on this path: static builds and server mode pre-render at build time, and framework-delegated stories (`parameters.renderer`) never make the round trip. Both are unaffected by this spec.

## Design Decisions

**Decision 1 — Measure first; every change ships with before/after numbers.** The costs above are read from the code; their relative weights are not yet measured. Step 1 adds phase timings (queue wait, module load, container render, round-trip total) gated behind a debug flag, and records baselines for four scenarios in the `astro7` integration app: cold first render, warm rerender, post-edit rerender, and a docs page with many stories. Later steps land only with measured improvement against those baselines — this is the guard against optimizing the wrong cost.

**Decision 2 — Keep the container across file changes; invalidate precisely and lazily.** `resetHandler` becomes: drop `componentCache` entries (Vite's module graph already handles transform invalidation for the changed modules; the component cache is the only staleness the handler adds), keep the container and renderers, and defer any rebuild until the next render actually needs it. The two watchers are deduplicated into one subscription. A full handler rebuild remains for the cases that genuinely need it (story-rules config file changes — the existing `resolveRulesConfigModule` path). HMR correctness is the constraint: the exit criteria for this step is a manual edit matrix (component, story file, imported child, unrelated file), not just speed.

**Decision 3 — Scope the render queue to renders that need the mock fence.** The queue's real invariant is: renders with story rules must not overlap anything (their module mocks and graph invalidation are process-global). Reader–writer semantics express that exactly: rule-free renders run concurrently (readers); a ruled render waits for in-flight renders to drain, runs alone, then releases (writer). Whether a story has rules is known before queueing (`runWithStoryRules` resolves the rule set from the story id + config). This unblocks docs pages — the common case — while story-level mocking keeps its isolation guarantee, verified by a new concurrency test alongside the existing story-rules suite.

**Decision 4 — Latest-wins per canvas on the client.** `renderAstroToCanvas` tracks the newest request id per canvas element; a response for a superseded request is discarded instead of applied (the server may still render it — dropping server-side work is not worth the protocol complexity until Step 1's numbers say otherwise). This turns control-scrubbing from N sequential paints into "last one wins."

**Decision 5 — Replace the fixed timeout with ack-based liveness.** The server immediately acks each request (`astro:render:ack`) before rendering. The client's 5s timer only guards the ack (is the server there at all?); after the ack, a much longer render deadline applies (60s, matching "something is genuinely wrong" rather than "cold compile"). Slow renders stop masquerading as outages, and the error messages can finally distinguish the two. The ack also carries the queue position when the render is fenced behind a writer (Decision 3), which the client can surface in the loading state later if wanted — not in scope here.

**Decision 6 — Idle prewarm of story components, opt-out via `framework.options.prewarm`.** Adapted from the issue's third direction. After the internal server starts (and after each invalidation settles), a background task warms the module graph for `.astro` components referenced by story files: story file paths come from Storybook's own config (`options.presets.apply('stories')` globs, resolved in `preset.ts` and passed into the plugin), and each story file is scanned for `.astro` import specifiers **textually** — the same trick `extractAstroImportSpecifiers` in `vitePluginAstroComponentMarker.ts` already uses — rather than executing story modules server-side, which could run framework-specific client code. Warming = `ssrLoadModule` with bounded concurrency, yielding immediately when a real render request arrives. Default on (it only fills caches that renders would fill anyway); `prewarm: false` for machines where background CPU matters.

**Decision 7 — Streaming rejected.** Story fragments are small; Step 0 code-reading already shows the cost is compile + render, not transfer. The client must have complete HTML before `innerHTML` injection, stylesheet hoisting, and script re-execution can run, and Vite's HMR WebSocket has no streaming semantics — building chunked delivery over it buys nothing measurable. Recorded here so the direction isn't re-litigated; revisit only if Step 1 baselines show response-size time mattering.

**Decision 8 — Reply to the requesting client only.** `server.ws.on('astro:render:request', (data, client) => …)` already receives the requester; responses (and acks) go to `client.send` instead of the broadcast `server.ws.send`. Removes cross-tab noise for free while touching the same code as Decision 5.

## Implementation Plan

### Step 1 — Instrumentation and baselines

- Server: wrap the handler's phases (queue wait, `loadPatchedComponent`, args pipeline, `renderToString`) with timings, logged when `DEBUG` includes `storybook-astro:perf` and attached to the response payload as an optional `timings` field (dev only).
- Client: log request→response wall time under the same flag.
- Record baselines for the four Decision 1 scenarios in the `astro7` integration app; keep the numbers in the PR description (not in this spec — they date).

**Exit criteria**: flag-gated timings visible in dev; baselines recorded; zero overhead when the flag is off; `yarn test` green.

### Step 2 — Precise, lazy invalidation (Decision 2) + targeted replies (Decision 8)

- Rework `resetHandler`: lazy rebuild, container/renderer reuse, `componentCache` clearing as the only per-edit action, single deduplicated watcher subscription. Full rebuild path retained for story-rules config changes.
- Switch responses/acks to `client.send`.

**Exit criteria**: manual HMR matrix passes (edit `.astro` component → rerender shows change; edit story file; edit imported child component → parent story updates, styles included; edit unrelated file → next render is warm, measured); post-edit rerender and unrelated-edit rerender measurably improved over Step 1 baselines; `yarn test` and story-rules tests green.

### Step 3 — Reader–writer render queue (Decision 3)

- Replace `renderQueue` with the rw-lock in `createAstroRenderHandler`; rule-free renders concurrent, ruled renders exclusive.
- New test: a ruled render and several rule-free renders dispatched concurrently — mocks never leak into the rule-free outputs, and rule-free renders don't serialize behind each other.

**Exit criteria**: docs-page scenario measurably faster (stories render concurrently); new concurrency test plus existing story-rules suite green.

### Step 4 — Client latest-wins and ack liveness (Decisions 4, 5)

- `renderer-dev.ts`: emit ack handling, two-stage timeout, distinct error copy for "no ack" vs "render deadline exceeded".
- `render.tsx`: per-canvas newest-request tracking; stale responses discarded.

**Exit criteria**: unit tests in the renderer package for supersede and both timeout stages (mock `import.meta.hot`); manually, scrubbing a control paints only final states, and an artificially delayed render (>5s) no longer reports the server unavailable.

### Step 5 — Idle prewarm (Decision 6)

- `preset.ts` passes resolved story globs into the middleware plugin; the plugin schedules the textual-scan + bounded `ssrLoadModule` warm after server start and after invalidation settles (debounced), aborting on incoming render requests. `prewarm` option added to `FrameworkOptions`, documented in the configuration reference.

**Exit criteria**: cold first render of a not-yet-viewed story measurably faster with prewarm on (compare against Step 1 baseline); `prewarm: false` restores prior behavior; no watcher/HMR regressions from the background loads.

### Step 6 — Documentation

- Website: note the perf characteristics honestly (first render compiles, subsequent renders are cached; `prewarm` option; the `DEBUG` flag for diagnosing slow renders) — likely a short section in the troubleshooting or how-it-works pages.
- `AGENTS.md`: update the "Performance" future-consideration bullet and the middleware/renderer file notes to describe the new queue and invalidation behavior.
- Roadmap entry for #164 updated when shipped.

**Exit criteria**: `yarn lint:links` green; docs describe shipped behavior only.

## Known Limitations

- **The round trip itself stays.** Dev-mode Astro rendering is inherently server-side (the Container API cannot run in the browser); this spec cuts redundant work around the round trip, it does not remove it.
- **Full-HTML replacement per render remains.** Each render replaces the canvas `innerHTML` and re-runs scripts, so client-side state (e.g. Alpine component state) resets on every controls tweak — pre-existing behavior, unchanged here. DOM diffing would be its own spec.
- **Superseded requests still render server-side** (Decision 4); only their application is skipped. Cheap to revisit if measurements disagree.
- **Prewarm trusts a textual import scan** — dynamically computed story components (rare) aren't prewarmed and simply stay cold until first view.
- **Streaming is rejected, not deferred** (Decision 7), absent new evidence from Step 1's instrumentation.
