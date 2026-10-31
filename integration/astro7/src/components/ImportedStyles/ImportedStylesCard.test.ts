import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from '@storybook-astro/components/ScopedStyles/ImportedStylesCard.stories.jsx';

const { FrontmatterImports } = composeStories(stories);

function storyCss() {
  return Array.from(document.querySelectorAll('style[data-storybook-astro-styles]'))
    .map((style) => style.textContent)
    .join('\n');
}

// Issue #223: Astro 7.4+ hashes a CSS module's file path into its class names
// in dev, so the shipped stylesheet must be named the way the markup is.
test('a CSS module imported in the frontmatter styles the class the markup uses', async () => {
  await renderStory(FrontmatterImports);

  const labelClass = screen.getByTestId('imported-styles-label').className;

  expect(labelClass).not.toBe('');
  expect(storyCss()).toContain(`.${labelClass}`);
  expect(storyCss()).toContain('.imported-card');
});
