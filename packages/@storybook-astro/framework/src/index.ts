// Re-export types from storybook internal
export type {
  Args,
  ArgTypes,
  Parameters,
  ProjectAnnotations,
  StrictArgs
} from 'storybook/internal/types';

import { definePreview as definePreviewBase, type PreviewAddon, type InferTypes, type Preview as CsfPreview } from 'storybook/internal/csf';
import type { ProjectAnnotations } from 'storybook/internal/types';
import type { AstroRenderer } from './portable-stories.ts';

/**
 * Preview configuration type for `.storybook/preview.ts` in Astro projects.
 * Reflects the full type returned by `definePreview`, including addon type extensions.
 * Use this to annotate your preview module when needed:
 *
 * ```ts
 * import type { Preview } from '@storybook-astro/framework';
 * const preview: Preview = { ... };
 * export default preview;
 * ```
 */
export type Preview<Addons extends PreviewAddon<never>[] = []> = CsfPreview<AstroRenderer & InferTypes<Addons>>;

// Export portable stories functionality
export {
  composeStories,
  composeStory,
  setProjectAnnotations,
  type AstroRenderer
} from './portable-stories.ts';

// Export framework types
export type {
  FrameworkOptions,
  RenderMode,
  RenderStoryInput,
  ServerBuildOptions,
  SanitizationOptions,
  StoryRulesOptions,
  StorybookConfig
} from './types.ts';

// Preview configuration helper
export function definePreview<Addons extends PreviewAddon<never>[] = []>(
  input: ProjectAnnotations<AstroRenderer> & { addons?: Addons }
): CsfPreview<AstroRenderer & InferTypes<Addons>> {
  return definePreviewBase<AstroRenderer, Addons>(input);
}
