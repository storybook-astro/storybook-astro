import { screen, within } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import Wrapper from './Wrapper.astro';
import * as metaLevelStories from './Decorator.stories.jsx';
import * as storyLevelStories from './StoryLevelDecorator.stories.jsx';

const { Decorated } = composeStories(metaLevelStories);
const { StoryLevelWrapped } = composeStories(storyLevelStories);
const { Undecorated: GloballyWrapped } = composeStories(storyLevelStories, {
  decorators: [(_Story) => ({ component: Wrapper, props: { label: 'Global' } })],
});

// Meta-level decorator (docs/DECORATOR_SUPPORT.md): a `decorators` array on
// Decorator.stories.jsx's default export wraps every story in that file.
test('a meta-level decorator wraps the story in Wrapper.astro', async () => {
  await renderStory(Decorated);

  const wrapper = screen.getByTestId('decorator-wrapper');

  expect(within(wrapper).getByText('Wrapped in preview')).toBeInTheDocument();
  expect(within(wrapper).getByText('Decorated card')).toBeInTheDocument();
});

// Story-level decorator: a `decorators` array on the story export itself,
// independent of any meta- or project-level decorators.
test('a story-level decorator wraps just that story', async () => {
  await renderStory(StoryLevelWrapped);

  const wrapper = screen.getByTestId('decorator-wrapper');

  expect(within(wrapper).getByText('Story-level')).toBeInTheDocument();
  expect(within(wrapper).getByText('Story-level wrapped')).toBeInTheDocument();
});

// Global (project-level) decorator: supplied here via composeStories'
// projectAnnotations parameter — the same mechanism setProjectAnnotations()
// and a real .storybook/preview.js `decorators` export use.
test('a global decorator wraps an otherwise undecorated story', async () => {
  await renderStory(GloballyWrapped);

  const wrapper = screen.getByTestId('decorator-wrapper');

  expect(within(wrapper).getByText('Global')).toBeInTheDocument();
  expect(within(wrapper).getByText('Undecorated')).toBeInTheDocument();
});
