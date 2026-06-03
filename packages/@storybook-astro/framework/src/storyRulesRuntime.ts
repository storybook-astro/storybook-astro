import { withStoryModuleMocks } from './module-mocks.ts';
import { selectStoryRules, withStoryRuleCleanups, type StoryRuleSelection } from './rules.ts';
import type { RenderStoryInput } from './types.ts';

export type ResolveRulesConfigModule = () => unknown | Promise<unknown>;

type RunWithStoryRulesOptions = {
  story?: RenderStoryInput;
  rulesConfigFilePath?: string;
  resolveRulesConfigModule?: ResolveRulesConfigModule;
  invalidateModuleGraph?: () => void;
};

export async function runWithStoryRules<T>(
  options: RunWithStoryRulesOptions,
  callback: (selection: StoryRuleSelection) => Promise<T>
): Promise<T> {
  const rulesConfigModule = options.resolveRulesConfigModule
    ? await options.resolveRulesConfigModule()
    : undefined;
  const selectedRules = await selectStoryRules({
    configModule: rulesConfigModule,
    configFilePath: options.rulesConfigFilePath,
    story: options.story
  });

  if (selectedRules.moduleMocks.size > 0) {
    options.invalidateModuleGraph?.();
  }

  return withStoryRuleCleanups(selectedRules.cleanups, async () => {
    return withStoryModuleMocks(selectedRules.moduleMocks, async () => callback(selectedRules));
  });
}
