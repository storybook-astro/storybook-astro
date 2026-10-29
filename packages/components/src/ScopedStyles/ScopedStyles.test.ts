import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as slotListStories from './SlotList.stories.jsx';
import * as titlePairStories from './TitlePair.stories.jsx';

const { ListInSlot } = composeStories(slotListStories);
const { SameClassName } = composeStories(titlePairStories);

function scopeAttributeOf(element: Element) {
  return element.getAttributeNames().find((name) => name.startsWith('data-astro-cid-'));
}

function storyCss() {
  return document.querySelector('style[data-storybook-astro-styles]')?.textContent ?? '';
}

// Issue #189: Storybook used to inject the raw <style> source globally, so the
// list's rules reached slotted markup through unscoped selectors.
test('slotted content is not scoped to the component that styles it', async () => {
  await renderStory(ListInSlot);

  const list = screen.getByTestId('slot-list');
  const scope = scopeAttributeOf(list);

  expect(scope).toBeDefined();
  expect(scopeAttributeOf(list.querySelector('ul')!)).toBeUndefined();
  expect(storyCss()).toContain(`.list[${scope}]`);
  expect(storyCss()).not.toMatch(/\.list\s*\{/);
});

test('components that share a class name only style their own markup', async () => {
  await renderStory(SameClassName);

  const redScope = scopeAttributeOf(screen.getByTestId('red-title'));
  const blueScope = scopeAttributeOf(screen.getByTestId('blue-title'));

  expect(redScope).toBeDefined();
  expect(blueScope).toBeDefined();
  expect(redScope).not.toBe(blueScope);
  expect(storyCss()).toContain(`.title[${redScope}]`);
  expect(storyCss()).toContain(`.title[${blueScope}]`);
  expect(storyCss()).not.toMatch(/\.title\s*\{/);
});
