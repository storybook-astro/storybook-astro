import { composeStories } from '@storybook-astro/framework';
import { testStoryRenders, testStoryComposition } from '@storybook-astro/framework/testing';
import * as stories from './Card.stories.jsx';

const { Default, Highlight } = composeStories(stories);

// Test basic composition
testStoryComposition('Default', Default);

testStoryComposition('Highlight', Highlight, {
  title: 'Highlighted Card',
  content: 'This card has the highlight state enabled.',
  highlight: true,
});

// Test actual rendering capability
testStoryRenders('Card Default', Default);
testStoryRenders('Card Highlight', Highlight);
