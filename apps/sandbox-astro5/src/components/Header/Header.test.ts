import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { renderAstroStory } from '../../test-utils/renderAstroStory.ts';
import * as stories from './Header.stories.jsx';

test('Header Default renders via SSR', async () => {
  await renderAstroStory(stories, 'Default');

  expect(screen.getByText('Storybook Astro')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Docs' })).toBeInTheDocument();
});
