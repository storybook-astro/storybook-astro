import { AsyncLocalStorage } from 'node:async_hooks';

export type StoryModuleMocks = Map<string, string>;

const moduleMockStorage = new AsyncLocalStorage<StoryModuleMocks>();

export async function withStoryModuleMocks<T>(
  moduleMocks: StoryModuleMocks,
  callback: () => Promise<T>
): Promise<T> {
  return moduleMockStorage.run(moduleMocks, callback);
}

export function resolveStoryModuleMock(specifier: string): string | undefined {
  return moduleMockStorage.getStore()?.get(specifier);
}
