import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { renderAstroStory } from '../../test-utils/renderAstroStory.ts';
import * as stories from './Footer.stories.jsx';

test('Footer Default renders via SSR', async () => {
  await renderAstroStory(stories, 'Default');

  expect(screen.getByText('Licensed under MIT')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'GitHub Project' })).toBeInTheDocument();
});
