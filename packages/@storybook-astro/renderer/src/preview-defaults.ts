// Default preview parameters applied to every Astro story.
//
// Kept free of virtual-module imports (unlike entry-preview.ts) so the
// framework's `definePreview` can merge these synchronously without pulling in
// the render chain — which breaks Node test setups. The renderer's
// entry-preview re-exports these for the legacy (CSF3) annotation path, while
// `definePreview` merges them for CSF-factory consumers, who otherwise bypass
// the entry-preview annotation entirely (see framework/src/index.ts).
export const defaultPreviewParameters = {
  docs: {
    story: {
      // Storybook's iframe default (150px) is too small for most components.
      height: '400px',
    },
  },
};
