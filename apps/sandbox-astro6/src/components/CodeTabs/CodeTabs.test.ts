import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './CodeTabs.stories.jsx';

const { AlpineRuntime } = composeStories(stories);

test('Astro CodeTabs AlpineRuntime renders via SSR', async () => {
  await renderStory(AlpineRuntime);

  expect(screen.getByTestId('astro-code-tabs')).toBeInTheDocument();
  expect(screen.getByTestId('astro-code-tabs')).toHaveAttribute('data-framework', 'alpine');
});
