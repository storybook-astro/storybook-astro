import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './ImageText.stories.jsx';

const { Default, ImageRight } = composeStories(stories);

test('ImageText Default renders with ImageMetadata as imageSrc', async () => {
  await renderStory(Default);

  expect(screen.getByAltText('Astro Storybook Earth')).toBeInTheDocument();
});

test('ImageText ImageRight renders reversed layout', async () => {
  await renderStory(ImageRight);

  expect(screen.getByAltText('Astro Storybook Earth')).toBeInTheDocument();
  // Verify the reversed prop applies the layout class
  expect(document.querySelector('.image-text')).toHaveClass('reversed');
});
