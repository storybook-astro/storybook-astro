import { screen } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './SvgIconProp.stories.jsx';

const { Default } = composeStories(stories);

// Regression test for issue #154: an imported `.svg` file passed as an arg
// must arrive server-side as a renderable SvgComponent, not image metadata.
//
// Reconstructing the SvgComponent factory pulls in astro/assets/runtime's SVG
// parsing on top of the usual cold-start SSR daemon cost, which pushed past
// the shared 15s default in CI — give this one more headroom.
test('SvgIconProp Default renders the imported SVG as an inline component', async () => {
  await renderStory(Default);

  const wrapper = screen.getByTestId('svg-icon-prop');

  expect(wrapper.querySelector('svg')).toBeInTheDocument();
  expect(wrapper.querySelector('path')).toBeInTheDocument();
  expect(screen.getByText('Starred')).toBeInTheDocument();
}, 30000);
