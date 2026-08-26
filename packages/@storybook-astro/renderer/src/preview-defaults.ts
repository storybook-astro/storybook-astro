// Default preview parameters applied to every Astro story.
//
// Kept free of virtual-module imports (unlike entry-preview.ts) so the
// framework's `definePreview` can merge these synchronously without pulling in
// the render chain — which breaks Node test setups. The renderer's
// entry-preview re-exports these for the legacy (CSF3) annotation path, while
// `definePreview` merges them for CSF-factory consumers, who otherwise bypass
// the entry-preview annotation entirely (see framework/src/index.ts).
import { extractComponentDescription } from 'storybook/internal/docs-tools';

import { extractArgTypes } from './extractArgTypes.ts';

export const defaultPreviewParameters = {
  docs: {
    // Autodocs reads the component's props table and description through these.
    // They live here rather than in entry-preview so CSF-factory stories, which
    // bypass that annotation, get them too (docs/specs/docgen.md#design-decisions).
    extractArgTypes,
    extractComponentDescription,
    story: {
      // Render Docs (autodocs) stories inline rather than in a nested iframe.
      // Storybook's default (inline: false) embeds each story in an iframe, and
      // the Docs Controls panel cannot live-update an iframe-embedded story — so
      // changing controls there does nothing. Inline rendering drives our
      // `renderToCanvas` directly on every args change, matching the Canvas tab.
      inline: true,
      // Storybook's iframe default (150px) is too small for most components.
      height: '400px',
    },
  },
};
