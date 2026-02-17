import { composeStories } from '@storybook-astro/framework';
import { testStoryRenders, testStoryComposition } from '@storybook-astro/framework/testing';
import * as stories from './Header.stories.jsx';

const { Default } = composeStories(stories);

// Test basic composition
testStoryComposition('Default', Default);

// Test rendering capability
testStoryRenders('Header Default', Default);
