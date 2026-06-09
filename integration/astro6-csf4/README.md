# Integration Example — Astro 6 (CSF4)

Variant of `integration/astro6` that exercises the **CSF4** preview pattern: `.storybook/preview.ts` calls `definePreview()` from `@storybook-astro/framework` instead of the older `const preview = {...}; export default preview;` shape.

CSF4 takes a different path through Storybook's builder-vite: only the final preview file's `default.composed` reaches the preview runtime, so the framework's `definePreview` must compose the renderer's `renderToCanvas`/`render`/`parameters` itself. This workspace guards that wiring — and the framework-fallback story flow it touches — against regression.

## Pinned Versions

- **Astro**: 6.0.3
- **Storybook**: 10.2.7
- **Vite**: 7.x

## Scripts

```bash
yarn workspace @storybook-astro/integration-astro6-csf4 dev          # Dev server on port 6008
yarn workspace @storybook-astro/integration-astro6-csf4 build
yarn workspace @storybook-astro/integration-astro6-csf4 serve
yarn workspace @storybook-astro/integration-astro6-csf4 test         # Vitest (portable stories)
yarn workspace @storybook-astro/integration-astro6-csf4 test:browser # Playwright against the built static site, port 6009
```
