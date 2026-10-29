import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as slotListStories from './SlotList.stories.jsx';
import * as titlePairStories from './TitlePair.stories.jsx';
import * as sassCardStories from './SassCard.stories.jsx';

const { ListInSlot } = composeStories(slotListStories);
const { SameClassName } = composeStories(titlePairStories);
const { ScssStyleBlock } = composeStories(sassCardStories);

function scopeAttributeOf(element: Element) {
  return element.getAttributeNames().find((name) => name.startsWith('data-astro-cid-'));
}

function storyCss() {
  return Array.from(document.querySelectorAll('style[data-storybook-astro-styles]'))
    .map((style) => style.textContent)
    .join('\n');
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

test('an SCSS style block ships compiled and scoped', async () => {
  await renderStory(ScssStyleBlock);

  const scope = scopeAttributeOf(screen.getByTestId('sass-card'));

  expect(scope).toBeDefined();
  expect(storyCss()).toContain(`.card[${scope}] span[${scope}]`);
  // No SCSS syntax reaches the browser: the variable is resolved.
  expect(storyCss()).not.toContain('$accent');
});
