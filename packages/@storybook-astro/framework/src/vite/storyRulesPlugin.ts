import type { Plugin } from 'vite';
import type { StoryRulesOptions } from '../rules-options.ts';
import { resolveRulesConfigFilePath } from '../rules-options.ts';
import { createVirtualModule } from './virtualModulePlugin.ts';

export const STORY_RULES_MODULE_ID = 'virtual:storybook-astro/story-rules';

export function storyRulesPlugin(
  options?: StoryRulesOptions,
  resolveFrom = process.cwd()
): Plugin {
  return createVirtualModule({
    pluginName: 'storybook-astro:story-rules',
    virtualModuleId: STORY_RULES_MODULE_ID,
    load() {
      const configFilePath = resolveRulesConfigFilePath(options, resolveFrom);

      if (!configFilePath) {
        return [
          'const storybookAstroStoryRulesConfig = { rules: [] };',
          'export default storybookAstroStoryRulesConfig;',
          'export const storybookAstroStoryRulesConfigFilePath = undefined;'
        ].join('\n');
      }

      const importPath = JSON.stringify(configFilePath.replace(/\\/g, '/'));
      const configPath = JSON.stringify(configFilePath.replace(/\\/g, '/'));

      return [
        `import * as storybookAstroStoryRulesConfigModule from ${importPath};`,
        'export default storybookAstroStoryRulesConfigModule;',
        `export const storybookAstroStoryRulesConfigFilePath = ${configPath};`
      ].join('\n');
    }
  });
}
