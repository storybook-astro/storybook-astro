import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './Button.stories.js';

const { Primary, Secondary, Disabled } = composeStories(stories);

test('Primary renders label', async () => {
  await renderStory(Primary);
  expect(screen.getByText('Primary button')).toBeInTheDocument();
});

test('Secondary renders label', async () => {
  await renderStory(Secondary);
  expect(screen.getByText('Secondary button')).toBeInTheDocument();
});

test('Disabled button has disabled attribute', async () => {
  await renderStory(Disabled);
  expect(screen.getByRole('button')).toBeDisabled();
});
