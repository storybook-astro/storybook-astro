import type { CompatibleString, Options } from 'storybook/internal/types';
import type { InlineConfig } from 'vite';
import type { Integration } from './integrations/index.ts';
import type { SanitizationOptions } from './lib/sanitization.ts';
import type { StoryRulesOptions } from './rules-options.ts';

type FrameworkName = CompatibleString<'@storybook-astro/framework'>;

export type { Integration, SanitizationOptions, StoryRulesOptions };

export type RenderStoryInput = {
  id: string;
  title?: string;
  name?: string;
};

export type FrameworkOptions = {
  integrations: Integration[];
  sanitization?: SanitizationOptions;
  storyRules?: StoryRulesOptions;
  resolveFrom?: string;
};

type StorybookConfigFramework = {
  framework: {
    name: FrameworkName;
    options: FrameworkOptions;
  };
};

export type StorybookConfig = StorybookConfigFramework;

type ViteFinal = (config: InlineConfig, options: Options) => InlineConfig | Promise<InlineConfig>;

export type StorybookConfigVite = {
  viteFinal?: ViteFinal;
};
