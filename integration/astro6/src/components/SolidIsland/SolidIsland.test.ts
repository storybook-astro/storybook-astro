import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import SolidIsland from './SolidIsland.astro';

const { Default } = composeStories({ default: { component: SolidIsland }, Default: {} });

test('an Astro component server-renders its Solid child', async () => {
  await renderStory(Default);

  expect(screen.getByTestId('solid-counter')).toHaveTextContent('Solid counter: 1');
});
