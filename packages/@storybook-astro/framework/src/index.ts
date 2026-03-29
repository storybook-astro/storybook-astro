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

/** Preview configuration type for `.storybook/preview.ts` in Astro projects. */
export type Preview = ProjectAnnotations<AstroRenderer>;

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
export type {
  StoryRuleCleanup,
  StoryRule,
  StoryRulesConfig,
  StoryRuleSelection,
  StoryRuleSelectionInput,
  StoryRuleStory,
  StoryRuleUse,
  StoryRuleUseContext
} from './rules.ts';
export { defineStoryRules } from './rules.ts';

// Re-export preset functionality for framework usage
export { core, viteFinal } from './preset.ts';

// Preview configuration helper
export function definePreview<Addons extends PreviewAddon<never>[] = []>(
  input: ProjectAnnotations<AstroRenderer> & { addons?: Addons }
): CsfPreview<AstroRenderer & InferTypes<Addons>> {
  return definePreviewBase<AstroRenderer, Addons>(input);
}
