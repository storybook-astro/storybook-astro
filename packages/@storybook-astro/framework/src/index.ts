// Re-export types from storybook internal
export type {
  Args,
  ArgTypes,
  Parameters,
  ProjectAnnotations,
  StrictArgs
} from 'storybook/internal/types';

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
  SanitizationOptions,
  StoryRulesOptions,
  StorybookConfig
} from './types.ts';
export type { StoryRule, StoryRulesConfig, StoryRuleUse, StoryRuleUseContext } from './rules.ts';
export { defineStoryRules } from './rules.ts';

// Re-export preset functionality for framework usage
export { core, viteFinal } from './preset.ts';
