import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './PageCard.stories.jsx';

// PageCard nests Card.astro (template nesting) and uses astro:assets <Image>
// directly with the imageSrc prop. The SSR server is configured with
// passthroughImageService so <Image> renders as a plain <img> tag regardless
// of whether imageSrc is an ImageMetadata object or a URL string.
const { Default } = composeStories(stories);

test('PageCard renders nested Astro component and image via SSR', async () => {
  await renderStory(Default);

  expect(screen.getByText('Storybook Astro')).toBeInTheDocument();
  expect(screen.getByText('Build and test Astro components in Storybook.')).toBeInTheDocument();
  expect(screen.getByAltText('Storybook Astro logo')).toBeInTheDocument();
});
