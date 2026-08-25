import { screen, within } from '@testing-library/dom';
import { test, expect } from 'vitest';
import { composeStories, renderStory } from '@storybook-astro/framework/testing';
import * as stories from './AdvancedDecorator.stories.jsx';

const { TwoDecoratorChain, HtmlStringWrapped, BareComponentWrapped, NamedSlotWrapped } = composeStories(stories);

// Two-decorator chain (docs/specs/decorators.md): the last array entry ends
// up outermost.
test('a two-decorator chain nests with the last array entry outermost', async () => {
  await renderStory(TwoDecoratorChain);

  const wrappers = screen.getAllByTestId('decorator-wrapper');

  expect(wrappers).toHaveLength(2);

  const [outer, inner] = wrappers;

  expect(within(outer).getByText('Outer')).toBeInTheDocument();
  expect(within(inner).getByText('Inner')).toBeInTheDocument();
  expect(outer).toContainElement(inner);
  expect(within(inner).getByText('Two-decorator chain')).toBeInTheDocument();
});

// HTML-string decorator: the wrapper div (and its `class`) must survive
// sanitization intact, with the story's own rendered HTML spliced in inside.
test('an HTML-string decorator wraps the story and survives sanitization', async () => {
  await renderStory(HtmlStringWrapped);

  const content = screen.getByText('HTML-string decorator');

  expect(content.closest('.dark-bg')).toBeInTheDocument();
});

// Bare-component sugar: `decorators: [Wrapper]` with no wrapping function.
test('a bare Astro component in the decorators array wraps the story', async () => {
  await renderStory(BareComponentWrapped);

  const wrapper = screen.getByTestId('decorator-wrapper');

  expect(within(wrapper).getByText('Decorated')).toBeInTheDocument();
  expect(within(wrapper).getByText('Bare-component sugar')).toBeInTheDocument();
});

// Named-slot decorator: the story lands in the layout's default slot, and a
// second, independently-supplied string lands in the named `sidebar` slot.
test('a named-slot decorator places the story and a second slot in one layout', async () => {
  await renderStory(NamedSlotWrapped);

  const layout = screen.getByTestId('layout-with-slots');
  const main = within(layout).getByTestId('layout-main');
  const sidebar = within(layout).getByTestId('layout-sidebar');

  expect(within(main).getByText('Named-slot decorator')).toBeInTheDocument();
  expect(within(sidebar).getByText('sidebar')).toBeInTheDocument();
});
