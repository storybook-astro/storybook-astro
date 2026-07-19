import { describe, expect, test } from 'vitest';
import { isDecoratedTree } from './decoratedTree.ts';
import type { AstroComponentFactory } from './types.ts';

function fakeAstroComponent(moduleId: string): AstroComponentFactory {
  const factory = (() => undefined) as unknown as AstroComponentFactory;

  factory.isAstroComponentFactory = true;
  factory.moduleId = moduleId;

  return factory;
}

describe('isDecoratedTree', () => {
  test('an undecorated story (a bare Astro factory) is not a decorated tree', () => {
    expect(isDecoratedTree(fakeAstroComponent('/src/Base.astro'))).toBe(false);
  });

  test('a configured component descriptor (a decorator wrapper) is a decorated tree', () => {
    expect(isDecoratedTree({ component: fakeAstroComponent('/src/Wrapper.astro') })).toBe(true);
  });

  test('an array — the split form of a string decorator — is a decorated tree', () => {
    expect(isDecoratedTree(['<div>', fakeAstroComponent('/src/Base.astro'), '</div>'])).toBe(true);
  });

  test('a plain string is not a decorated tree on its own', () => {
    expect(isDecoratedTree('<p>hi</p>')).toBe(false);
  });

  test('a plain object without a recognized component reference is not a decorated tree', () => {
    expect(isDecoratedTree({ label: 'not a descriptor' })).toBe(false);
  });
});
