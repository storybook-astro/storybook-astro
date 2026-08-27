import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './PageCard.stories.jsx';

// PageCard nests Card.astro (template nesting) and uses astro:assets <Image>
// directly with the imageSrc prop. The SSR server is configured with
// passthroughImageService so <Image> renders as a plain <img> tag regardless
// of whether imageSrc is an ImageMetadata object or a URL string.
//
// Importing this story used to throw `Unknown file extension ".astro"` (#117):
// `astro:assets` re-exports `astro/components/Image.astro`, and Vitest
// externalized `astro` in its SSR environment, so the `.astro` file reached
// Node's ESM loader untransformed. Vitest fixed that between 4.0.18 and 4.1.9
// — pinning vitest back to 4.0.18 still reproduces it. This test guards the
// version floor, since nothing in this repo pins it.
const { Default } = composeStories(stories);

test('PageCard renders nested Astro component and image via SSR', async () => {
  await renderStory(Default);

  expect(screen.getByText('Storybook Astro')).toBeInTheDocument();
  expect(screen.getByText('Build and test Astro components in Storybook.')).toBeInTheDocument();
  expect(screen.getByAltText('Storybook Astro logo')).toBeInTheDocument();
});
