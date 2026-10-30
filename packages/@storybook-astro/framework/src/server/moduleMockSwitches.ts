import { getStoryModuleMockExports, type StoryModuleMocks } from '../module-mocks.ts';

type ApplyExports = (mockedExports: Record<string, unknown> | undefined) => void;

const switchesBySpecifier = new Map<string, ApplyExports[]>();

/** Called by each generated switch module (vite/moduleMockSwitchesPlugin.ts) when it loads. */
export function registerModuleMockSwitch(specifier: string, applyExports: ApplyExports) {
  switchesBySpecifier.set(specifier, [...(switchesBySpecifier.get(specifier) ?? []), applyExports]);
}

/** Points every switch for a mocked specifier at the story's mock; returns how to undo it. */
export function applyModuleMockSwitches(moduleMocks: StoryModuleMocks): () => void {
  const applied: ApplyExports[] = [];

  for (const [specifier, mockEntry] of moduleMocks) {
    const mockedExports = getStoryModuleMockExports(mockEntry);

    if (!mockedExports) {
      throw new Error(
        `Compiled server builds support mock(specifier, factory) only, not a replacement path: ${specifier}`
      );
    }

    for (const applyExports of switchesBySpecifier.get(specifier) ?? []) {
      applyExports(mockedExports);
      applied.push(applyExports);
    }
  }

  return () => {
    for (const applyExports of applied) {
      applyExports(undefined);
    }
  };
}
