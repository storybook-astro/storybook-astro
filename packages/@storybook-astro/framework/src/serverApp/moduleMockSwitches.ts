import { getStoryModuleMockExports, type StoryModuleMocks } from '../module-mocks.ts';

/** A factory mock's exports, or the replacement module a path mock points at. */
type ActiveMock = { exports?: Record<string, unknown>; replacement: string };
type ApplyMock = (mock: ActiveMock | undefined) => void;

const switchesBySpecifier = new Map<string, ApplyMock[]>();
const activeMocks = new Map<string, ActiveMock>();

/** Called by each generated switch module (vite/moduleMockSwitchesPlugin.ts) when it loads. */
export function registerModuleMockSwitch(specifier: string, applyMock: ApplyMock) {
  switchesBySpecifier.set(specifier, [...(switchesBySpecifier.get(specifier) ?? []), applyMock]);

  // Astro loads a render page on its first request, so a module can load in
  // the middle of a mocked render; it starts out mocked like the rest.
  const activeMock = activeMocks.get(specifier);

  if (activeMock) {
    applyMock(activeMock);
  }
}

/** Points every switch for a mocked specifier at the story's mock; returns how to undo it. */
export function applyModuleMockSwitches(moduleMocks: StoryModuleMocks): () => void {
  for (const [specifier, mockEntry] of moduleMocks) {
    const mock = { exports: getStoryModuleMockExports(mockEntry), replacement: mockEntry.replacement };

    activeMocks.set(specifier, mock);

    for (const applyMock of switchesBySpecifier.get(specifier) ?? []) {
      applyMock(mock);
    }
  }

  return () => {
    for (const specifier of moduleMocks.keys()) {
      activeMocks.delete(specifier);

      for (const applyMock of switchesBySpecifier.get(specifier) ?? []) {
        applyMock(undefined);
      }
    }
  };
}
