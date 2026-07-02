import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './SlotBox.stories.jsx';

const { ConfiguredChild, MixedContent } = composeStories(stories);

test('renders a configured child component with its own props and slot content', async () => {
  await renderStory(ConfiguredChild);

  // The child must render as a real Astro component (not be flattened to its
  // inner HTML), so its own wrapper, label prop, and slot content all appear.
  const child = await screen.findByTestId('box-child');

  expect(child).toBeInTheDocument();
  expect(screen.getByText('Child label')).toBeInTheDocument();
  expect(screen.getByText('Lorem ipsum dolor sit amet')).toBeInTheDocument();
});

test('renders plain HTML and a configured child mixed in one slot', async () => {
  await renderStory(MixedContent);

  expect(screen.getByText('Before the child')).toBeInTheDocument();
  expect(screen.getByTestId('box-child')).toBeInTheDocument();
  expect(screen.getByText('Inside the child')).toBeInTheDocument();
  expect(screen.getByText('After the child')).toBeInTheDocument();
});
