# Project Scaffold CLI (`create-storybook-astro`)

## Problem Statement

Setting up Storybook Astro today is a multi-step manual process: check version requirements, install three packages, hand-create `.storybook/main.js` and `.storybook/preview.js`, add non-conflicting package scripts, and write a first component and story before anything renders. Storybook's own scaffolder is no help — `npm create storybook@latest` does not recognize Astro as a framework, which is why the docs open with a warning telling users to ignore it.

The goal is to reduce time-to-first-story to a single command:

```bash
npm create storybook-astro@latest
```

which generates a new Astro project with Storybook pre-configured, an example component with a story, and everything installed — so the first `npm run storybook` renders something real.

**Reference**: [Issue #157 — Project Scaffold CLI](https://github.com/storybook-astro/storybook-astro/issues/157)

## Current State

- The manual setup lives in `README.md` and the website's getting-started pages (`requirements.md`, `installation.md`, `configuration.md`). Those pages are the contract for what a correctly configured project looks like: core deps (`storybook`, `@storybook/builder-vite`, `@storybook-astro/framework`), the two `.storybook` config files, `storybook`/`build-storybook` script names (Astro already owns `dev` and `build`), and per-framework dep sets for optional integrations.
- `npm create storybook-astro` resolves to a package named **`create-storybook-astro`** (npm's `create X` → `create-X` mapping). That name is unclaimed on npm as of 2026-08-31; `npx create-storybook-astro` resolves to the same package for free.
- The repo already maintains minimal scaffold-shaped project templates: `smoke/templates/{common,astro5,astro6,astro7}` used by `scripts/smoke-test.sh`. They prove the minimal file set works against real npm installs, but they are test fixtures (tarball `file:` deps, Vitest wiring, no pages) — not directly shippable.
- The root `workspaces` globs are `packages/@storybook-astro/*`, `packages/components`, `apps/*`, `integration/*`. An unscoped package needs its own workspace entry.
- Existing packages are ESM-only, built with tsup, published with `yarn npm publish` in a specific order (`docs/RELEASING.md`), engines `>=20.16.0 || >=22.19.0 || >=24.0.0`.

## Design Decisions

**Decision 1 — Unscoped package `create-storybook-astro` at `packages/create-storybook-astro`.** The `npm create` mapping dictates the unscoped name, so the package lives outside the `@storybook-astro/` scope directory and gets an explicit entry in the root `workspaces` array. Reserve the name early: publish a `0.0.1` placeholder (bin that prints "coming soon" and the manual-setup URL) as soon as the skeleton exists, so the name is not squatted while the real CLI is built.

**Decision 2 — Self-contained embedded templates, not a `create-astro` wrapper.** The alternative was to shell out to `npm create astro -- --template minimal --no-install` and layer Storybook files on top. Rejected: it doubles the prompt UX (create-astro's prompts must be suppressed with flags that change across its majors), adds a network dependency to every scaffold, and makes output non-deterministic across create-astro releases. Embedding templates (the create-vite model) gives one code path, offline operation, and snapshot-testable output. The trade-off — our template can drift from current Astro conventions — is one this repo already carries and manages for `smoke/templates/`.

**Decision 3 — Latest supported Astro major only (currently 7).** The CLI creates *new* projects, and a new project should start on the current major. Users on Astro 5/6 have an *existing* project, which is the manual-setup path, not this CLI's job (see Known Limitations). This keeps the template matrix to one instead of three; an `--astro <major>` flag can be layered on later since the smoke templates already prove the per-major file sets.

**Decision 4 — Prompts via `@clack/prompts`, every prompt flag-addressable.** Four prompts: project directory, TypeScript (default yes — Astro is TypeScript-first), framework integrations (multiselect over react/vue/svelte/preact/solid/alpinejs, default none), install dependencies (default yes, package manager detected from `npm_config_user_agent`). Flags mirror them (`--typescript`/`--no-typescript`, `--integrations react,vue`, `--install`/`--no-install`, `--git`/`--no-git`, `--yes` for all-defaults) so CI and agents can run non-interactively; a non-TTY stdin behaves as `--yes` for any unanswered question. Git init happens by default but is skipped when the target is already inside a work tree.

**Decision 5 — The scaffold is a real Astro project, not just a Storybook host.** Output includes `astro.config.mjs`, `src/pages/index.astro`, and the standard `dev`/`build`/`preview` Astro scripts alongside `storybook`/`build-storybook` — so the project is immediately useful as an Astro site and the script-name-conflict guidance from `configuration.md` is baked in. Selected integrations are wired in **both** configs: `@astrojs/*` in `astro.config.mjs` and `@storybook-astro/framework/integrations` factories in `.storybook/main.js`, with the recursive `include` glob convention (`**/react/**`) written into the generated file since a wrong glob is the top framework-integration failure mode (see AGENTS.md).

**Decision 6 — Example content is the smoke-test Button, promoted.** `smoke/templates/common/src/Button.{astro,stories.js}` already demonstrates props, variants, scoped styles, argTypes, and three stories — exactly the "renders something real" bar. The CLI ships its own copy under `src/components/Button/` (the smoke fixture stays independent; a divergence is acceptable, a coupling is not). The story file extension follows the TypeScript choice (`.stories.js` / `.stories.ts`). No per-framework example components are generated for selected integrations — wiring only.

**Decision 7 — `@storybook/addon-docs` included by default.** Storybook's own scaffolder installs it, autodocs is the expected first-run experience, and the framework's docgen work (`docs/specs/docgen.md`) and Code Panel source (`docs/specs/code-panel-source.md`) exist to light up exactly this surface. The generated `main.js` lists it in `addons` and the Button story gets `tags: ['autodocs']`.

**Decision 8 — Dependency versions are baked caret ranges in one module.** All versions written into generated `package.json` files live in a single `src/versions.ts` constant map (framework, storybook, astro, vite, per-integration dep sets), bumped as part of the release process. No registry lookups at scaffold time (keeps offline determinism); users always get a current CLI because `npm create x@latest` fetches the latest CLI itself. The per-integration dep sets must match the table in `apps/website/src/content/docs/getting-started/installation.md` — cross-checking the two is an explicit release-step item.

## CLI Surface

```
npm create storybook-astro@latest [directory] [flags]

Flags:
  --yes               accept all defaults, no prompts
  --typescript / --no-typescript      (default: typescript)
  --integrations <list>               comma-separated: react,vue,svelte,preact,solid,alpinejs (default: none)
  --install / --no-install            (default: install)
  --git / --no-git                    (default: git, skipped inside an existing work tree)
  --package-manager <npm|yarn|pnpm>   (default: detected from the invoking client)
  --help, --version
```

Generated tree (defaults, no integrations):

```
my-project/
├── .gitignore
├── .storybook/
│   ├── main.js            # framework: @storybook-astro/framework, addons: [addon-docs]
│   └── preview.js         # controls matchers, JSDoc-typed
├── astro.config.mjs
├── package.json           # dev/build/preview + storybook/build-storybook
├── README.md              # next steps, links to storybook-astro.org
├── src/
│   ├── components/Button/
│   │   ├── Button.astro
│   │   └── Button.stories.js   # .stories.ts when TypeScript
│   └── pages/index.astro       # renders <Button />, links to the docs
└── tsconfig.json          # astro/tsconfigs/strict (base when --no-typescript)
```

On completion the CLI prints next steps: `cd`, install command if `--no-install`, `npm run storybook`, and the docs URL. Preconditions checked before writing anything: Node version satisfies the engines range (warn and continue on mismatch — nvm users often fix this after), and the target directory is empty or absent (hard error otherwise; no overwrite mode).

## Implementation Plan

### Step 1 — Package skeleton and name reservation

- `packages/create-storybook-astro/`: `package.json` (name `create-storybook-astro`, `type: module`, `bin`, `files: ["dist", "templates"]`, engines matching the monorepo), tsup config, `src/index.ts` parsing args and printing help/version. Add the workspace entry to the root `package.json`.
- Publish the `0.0.1` placeholder to claim the npm name (Decision 1).

**Exit criteria**: `yarn workspace create-storybook-astro build` produces a bin that runs via `node`; placeholder published; `yarn lint` and `yarn test` still green.

### Step 2 — Templates and generator

- `templates/` per the tree above, with per-choice variants kept as small overlays (TS vs JS story file, per-integration `main.js`/`astro.config.mjs` fragments) rather than whole parallel trees. Files npm would mangle at publish (`.gitignore`) ship renamed (`_gitignore`) and are restored on copy.
- `src/scaffold.ts`: pure function from a resolved options object (directory, typescript, integrations, packageManager) to a written file tree. Placeholder substitution is plain string replacement against `src/versions.ts` — no template engine.
- Unit tests scaffold every meaningful combination into a temp dir and snapshot the tree and file contents; a JSON-validity check on every generated `package.json`.

**Exit criteria**: scaffold tests green under `yarn test`; generated `main.js` for each integration matches the wiring documented in `configuration.md`.

### Step 3 — Prompts, install, git

- `src/prompts.ts` (clack) resolving the options object; flags and `--yes`/non-TTY short-circuit each prompt individually.
- Post-scaffold: `git init` + initial commit (unless skipped/nested), dependency install via the detected package manager with output streamed, next-steps summary. Install failure is non-fatal: report it, print the manual install command, exit 0 with the project intact.

**Exit criteria**: `node dist/index.js my-app --yes --no-install` produces a complete project non-interactively; interactive run exercised manually for each prompt.

### Step 4 — End-to-end verification

- Extend `scripts/smoke-test.sh` with a `scaffold` scenario: pack framework + renderer + CLI, run the CLI with `--yes --no-install`, rewrite the generated `package.json` to point `@storybook-astro/framework` at the local tarball (same `overrides` trick the existing scenarios use), install, and run `storybook build` asserting the Button story is in the output — mirroring the existing fresh/upgrade scenarios.
- Manual check: `npm run storybook` in a scaffolded project renders the Button with working controls and an autodocs page.

**Exit criteria**: `yarn smoke` (scaffold scenario) green on Astro 7; manual dev-mode check passes.

### Step 5 — Documentation and release

- Website: add a Quick Start (the `npm create` one-liner) at the top of `installation.md` and the getting-started index, repositioning the existing flow as "add to an existing project"; soften the `npm create storybook@latest` warning to point at this CLI.
- `README.md`: same Quick Start ahead of the manual steps. `AGENTS.md`: add the package to the architecture overview. Roadmap entry for #157 flipped when shipped.
- `docs/RELEASING.md`: add the CLI to the publish list (it has no `workspace:*` deps, so it publishes independently after framework/renderer) and add the versions-module bump + `installation.md` dep-set cross-check (Decision 8) to the release checklist.

**Exit criteria**: `yarn lint:links` green; first real publish installable via `npm create storybook-astro@latest` against a clean machine.

## Known Limitations

- **New projects only.** There is no "add Storybook to my existing Astro project" mode — that remains the manual guide. It's the natural follow-up (`create-storybook-astro --add` or upstream recognition in `create-storybook`), but detection/merging of existing configs is a different problem than scaffolding.
- **Latest Astro major only** (Decision 3). No `--astro 5|6` at launch.
- **No example components for selected framework integrations** — deps and config wiring only; the include-glob comment in `main.js` tells users where framework files must live.
- **Baked dependency ranges** can lag npm between releases; acceptable because the CLI itself is always fetched `@latest` and releases track the framework's cadence.
- **Templates can drift from `create-astro` conventions** (Decision 2 trade-off); the scaffold smoke scenario catches breakage against real installs, not stylistic drift.
