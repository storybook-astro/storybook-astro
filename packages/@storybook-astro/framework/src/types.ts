import type { CompatibleString, Options } from 'storybook/internal/types';
import type { InlineConfig } from 'vite';
import type { Integration } from './integrations/index.ts';
import type { SanitizationOptions } from './sanitization.ts';

type FrameworkName = CompatibleString<'@storybook-astro/framework'>;

export type { Integration, SanitizationOptions };
export type FrameworkOptions = {
  integrations: Integration[];
  sanitization?: SanitizationOptions;
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
