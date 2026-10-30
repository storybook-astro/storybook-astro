import { expect, test } from 'vitest';
import { createInlineStoryModuleMock, type StoryModuleMocks } from '../module-mocks.ts';
import { applyModuleMockSwitches, registerModuleMockSwitch } from './moduleMockSwitches.ts';

function storyMocks(specifier: string, exports: Record<string, unknown>): StoryModuleMocks {
  return new Map([[specifier, createInlineStoryModuleMock(exports)]]);
}

/** Stands in for a generated switch module: its live export, and how to flip it. */
function loadSwitchModule(specifier: string) {
  const module = { fetchStars: (): number => 66 };
  const realFetchStars = module.fetchStars;

  registerModuleMockSwitch(specifier, (mock) => {
    module.fetchStars = (mock?.exports?.fetchStars as typeof realFetchStars) ?? realFetchStars;
  });

  return module;
}

test('a story mock replaces the module for one render, then the real module is back', () => {
  const githubClient = loadSwitchModule('./githubClient.ts');
  const restore = applyModuleMockSwitches(storyMocks('./githubClient.ts', { fetchStars: () => 2413 }));

  expect(githubClient.fetchStars()).toBe(2413);

  restore();

  expect(githubClient.fetchStars()).toBe(66);
});

test('a module that first loads during a mocked render starts out mocked', () => {
  // A render page loads on its first request, after the story's mocks are applied.
  const restore = applyModuleMockSwitches(storyMocks('./npmClient.ts', { fetchStars: () => 2413 }));
  const npmClient = loadSwitchModule('./npmClient.ts');

  expect(npmClient.fetchStars()).toBe(2413);

  restore();

  expect(npmClient.fetchStars()).toBe(66);
});
