import { composeStories } from '@storybook-astro/framework';
import { testStoryRenders, testStoryComposition } from '@storybook-astro/framework/testing';
import * as stories from './Counter.stories.js';

const { Default } = composeStories(stories);

testStoryComposition('Default', Default);
testStoryRenders('Alpine Counter Default', Default);
