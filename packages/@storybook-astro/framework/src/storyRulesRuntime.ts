import { withStoryModuleMocks, type StoryModuleMocks } from './module-mocks.ts';
import { selectStoryRules, withStoryRuleCleanups, type StoryRuleSelection } from './rules.ts';
import type { RenderStoryInput } from './types.ts';

export type ResolveRulesConfigModule = () => unknown | Promise<unknown>;

/** Activates a story's module mocks for one render and returns how to undo it. */
export type ApplyModuleMocks = (moduleMocks: StoryModuleMocks) => () => void;

type RunWithStoryRulesOptions = {
  story?: RenderStoryInput;
  rulesConfigFilePath?: string;
  resolveRulesConfigModule?: ResolveRulesConfigModule;
  invalidateModuleGraph?: () => void;
  applyModuleMocks?: ApplyModuleMocks;
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

  const render = () =>
    withStoryRuleCleanups(selectedRules.cleanups, async () => {
      return withStoryModuleMocks(selectedRules.moduleMocks, async () => {
        const restoreModuleMocks = options.applyModuleMocks?.(selectedRules.moduleMocks);

        try {
          return await callback(selectedRules);
        } finally {
          restoreModuleMocks?.();
        }
      });
    });

  if (selectedRules.moduleMocks.size === 0) {
    return render();
  }

  // Modules load once per module graph, so they have to reload for the mocks
  // to take effect, and again afterwards: the ones this render loaded import
  // the mocks, and the next render, under this handler or a new one, would
  // get them.
  options.invalidateModuleGraph?.();

  try {
    return await render();
  } finally {
    options.invalidateModuleGraph?.();
  }
}
