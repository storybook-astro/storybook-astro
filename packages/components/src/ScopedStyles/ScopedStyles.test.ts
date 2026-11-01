import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as slotListStories from './SlotList.stories.jsx';
import * as titlePairStories from './TitlePair.stories.jsx';
import * as sassCardStories from './SassCard.stories.jsx';
import * as importedStylesStories from './ImportedStylesCard.stories.jsx';

const { ListInSlot } = composeStories(slotListStories);
const { SameClassName } = composeStories(titlePairStories);
const { ScssStyleBlock } = composeStories(sassCardStories);
const { FrontmatterImports } = composeStories(importedStylesStories);

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

// Issue #224: the CSS goes in the head, so the story's markup is the body's
// first child and neither it nor the returned HTML holds any CSS.
test('the story CSS is in the head, not ahead of the story markup', async () => {
  const html = await renderStory(SameClassName);

  expect(document.head.querySelector('style[data-storybook-astro-styles]')).not.toBeNull();
  expect(document.body.querySelector('style')).toBeNull();
  expect(document.body.textContent).not.toContain('color');
  expect(html).not.toContain('<style');
});

test('the next story replaces the last one\'s CSS', async () => {
  await renderStory(SameClassName);
  await renderStory(ListInSlot);

  expect(storyCss()).toContain('.list[');
  expect(storyCss()).not.toContain('.title[');
});

// Issue #223: stylesheets a component imports in its frontmatter ship with the
// story, and a CSS module's class names match the rendered markup.
test('stylesheets imported in the frontmatter ship with the story', async () => {
  await renderStory(FrontmatterImports);

  const labelClass = screen.getByTestId('imported-styles-label').className;

  expect(storyCss()).toContain('.imported-card');
  expect(labelClass).not.toBe('');
  expect(storyCss()).toContain(`.${labelClass}`);
});

