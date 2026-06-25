import { screen, within } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as slotStories from './SlotNesting.stories.jsx';
import * as propStories from './PropNesting.stories.jsx';

const { ComponentInSlot, StringInSlot } = composeStories(slotStories);
const { ComponentAsProp } = composeStories(propStories);

// Issue #128: an Astro component passed as slot content used to render empty.
test('an Astro component passed as slot content renders inside the slot', async () => {
  await renderStory(ComponentInSlot);

  const panel = screen.getByTestId('panel');
  const badge = within(panel).getByTestId('badge');

  expect(badge).toBeInTheDocument();
  expect(badge).toHaveTextContent('badge');
});

// String slot content is sanitized (it's raw user HTML), so assert on text
// rather than a data-* attribute the allowlist strips.
test('a string slot still renders (regression guard)', async () => {
  await renderStory(StringInSlot);

  const panel = screen.getByTestId('panel');

  expect(panel).toHaveTextContent('plain string slot');
});

test('an Astro component passed as a prop renders via the parent template', async () => {
  await renderStory(ComponentAsProp);

  const button = screen.getByTestId('icon-button');

  expect(within(button).getByTestId('badge')).toBeInTheDocument();
  expect(button).toHaveTextContent('Save');
});
