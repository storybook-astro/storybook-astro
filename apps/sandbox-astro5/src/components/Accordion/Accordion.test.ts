import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { renderAstroStory } from '../../test-utils/renderAstroStory.ts';
import * as stories from './Accordion.stories.jsx';

test('Accordion Default renders via SSR', async () => {
  await renderAstroStory(stories, 'Default');

  expect(screen.getByTestId('vanilla-accordion')).toBeInTheDocument();
  expect(screen.getByText('Section 1')).toBeInTheDocument();
});
