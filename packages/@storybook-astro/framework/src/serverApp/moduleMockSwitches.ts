import { getStoryModuleMockExports, type StoryModuleMocks } from '../module-mocks.ts';

type ApplyExports = (mockedExports: Record<string, unknown> | undefined) => void;

const switchesBySpecifier = new Map<string, ApplyExports[]>();
const activeMocks = new Map<string, Record<string, unknown>>();

/** Called by each generated switch module (vite/moduleMockSwitchesPlugin.ts) when it loads. */
export function registerModuleMockSwitch(specifier: string, applyExports: ApplyExports) {
  switchesBySpecifier.set(specifier, [...(switchesBySpecifier.get(specifier) ?? []), applyExports]);

  // Astro loads a render page on its first request, so a module can load in
  // the middle of a mocked render; it starts out mocked like the rest.
  const activeMock = activeMocks.get(specifier);

  if (activeMock) {
    applyExports(activeMock);
  }
}

/** Points every switch for a mocked specifier at the story's mock; returns how to undo it. */
export function applyModuleMockSwitches(moduleMocks: StoryModuleMocks): () => void {
  for (const [specifier, mockEntry] of moduleMocks) {
    const mockedExports = getStoryModuleMockExports(mockEntry);

    if (!mockedExports) {
      throw new Error(
        `Server mode supports mock(specifier, factory) only, not a replacement path: ${specifier}`
      );
    }

    activeMocks.set(specifier, mockedExports);

    for (const applyExports of switchesBySpecifier.get(specifier) ?? []) {
      applyExports(mockedExports);
    }
  }

  return () => {
    for (const specifier of moduleMocks.keys()) {
      activeMocks.delete(specifier);

      for (const applyExports of switchesBySpecifier.get(specifier) ?? []) {
        applyExports(undefined);
      }
    }
  };
}
