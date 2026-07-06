import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './SlotBox.stories.jsx';

const { ConfiguredChild, MixedContent, WrappedChild } = composeStories(stories);

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

test('renders a configured child nested inside a wrapper tag split across array entries', async () => {
  await renderStory(WrappedChild);

  // The wrapper's opening and closing tags are separate array entries with the
  // child sandwiched between them — the child must end up nested inside the
  // wrapper, not rendered as its sibling after a self-closed wrapper div.
  const wrapper = document.querySelector('.Wrapper');
  const child = screen.getByTestId('box-child');

  expect(wrapper).toBeInTheDocument();
  expect(wrapper).toContainElement(child);
  expect(screen.getByText('Inside the wrapper')).toBeInTheDocument();
});
