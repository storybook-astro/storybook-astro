import type { CompatibleString, Options, StorybookConfig as StorybookConfigBase } from 'storybook/internal/types';
import type { InlineConfig } from 'vite';
import type { Integration } from './integrations/index.ts';
import type { SanitizationOptions } from './lib/sanitization.ts';
import type { StoryRulesOptions } from './rules-options.ts';

type FrameworkName = CompatibleString<'@storybook-astro/framework'>;

export type { Integration, SanitizationOptions, StoryRulesOptions };
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
  /**
   * Additional source directories (relative to `resolveFrom`) to scan for
   * hydratable client components (JSX/TSX/Vue/Svelte). Use this when stories
   * reference components that live outside the default `src/components` scan
   * root — for example, workspace packages included in the `stories` globs.
   *
   * @example ['../../packages/components/src']
   */
  componentRoots?: string[];
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
