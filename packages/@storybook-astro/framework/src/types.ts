import type { CompatibleString, Options, StorybookConfig as StorybookConfigBase } from 'storybook/internal/types';
import type { InlineConfig } from 'vite';
import type { Integration } from './integrations/index.ts';
import type { SanitizationOptions } from './lib/sanitization.ts';
import type { StoryRulesOptions } from './rules-options.ts';
import type { StorybookFontFamily } from './vitePluginAstroFonts.ts';

type FrameworkName = CompatibleString<'@storybook-astro/framework'>;

export type { Integration, SanitizationOptions, StoryRulesOptions, StorybookFontFamily };
export type RenderMode = 'server' | 'static';

export type ServerBuildOptions = {
  serverUrl?: string;
  authToken?: string;
  authHeader?: string;
};

export type RenderStoryInput = {
  id: string;
  title?: string;
  name?: string;
};

type BaseFrameworkOptions = {
  integrations?: Integration[];
  sanitization?: SanitizationOptions;
  resolveFrom?: string;
  /**
   * Astro font families to resolve and inject as @font-face CSS during story
   * rendering. Pass the same array you have in your `astro.config.ts` under
   * `fonts:`. Currently honored in development; static/server builds fall
   * back to no-op stubs.
   */
  fonts?: StorybookFontFamily[];
};

type ServerFrameworkOptions = BaseFrameworkOptions & {
  renderMode?: 'server';
  storyRules?: StoryRulesOptions;
  server?: ServerBuildOptions;
};

type StaticFrameworkOptions = BaseFrameworkOptions & {
  renderMode: 'static';
  storyRules?: StoryRulesOptions;
  server?: never;
};

export type FrameworkOptions = ServerFrameworkOptions | StaticFrameworkOptions;

type StorybookConfigFramework = {
  framework: {
    name: FrameworkName;
    options?: FrameworkOptions;
  };
};

type ViteFinal = (config: InlineConfig, options: Options) => InlineConfig | Promise<InlineConfig>;

export type StorybookConfigVite = {
  viteFinal?: ViteFinal;
};

export type StorybookConfig = Omit<StorybookConfigBase, 'framework'> & StorybookConfigFramework & StorybookConfigVite;
