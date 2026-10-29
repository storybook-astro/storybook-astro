// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest';
import { moveStoryStylesToHead, removeStoryStyles } from './storyStyles.ts';

const styleFor = (css: string) => `<style data-storybook-astro-styles>${css}</style>`;

/** Renders one story's HTML the way render.tsx does, and returns the canvas markup. */
function renderStory(html: string, viewMode?: string) {
  const template = document.createElement('template');

  template.innerHTML = html;
  moveStoryStylesToHead(template.content, document, viewMode);

  return template.innerHTML;
}

const headCss = () =>
  Array.from(document.head.querySelectorAll('style[data-storybook-astro-styles]')).map(
    (style) => style.textContent
  );

beforeEach(() => {
  document.head.innerHTML = '<style id="global">body { margin: 0; }</style>';
});

describe('moveStoryStylesToHead', () => {
  test('leaves the story markup first and puts its CSS at the end of the head, in order', () => {
    const markup = renderStory(`${styleFor('.page {}')}${styleFor('.card {}')}<div class="page"></div>`);

    expect(markup).toBe('<div class="page"></div>');
    expect(headCss()).toEqual(['.page {}', '.card {}']);
    expect(document.head.firstElementChild?.id).toBe('global');
  });

  test('keeps one copy of a block when the story rerenders with new args', () => {
    renderStory(`${styleFor('.card {}')}<div>first</div>`);
    renderStory(`${styleFor('.card {}')}<div>second</div>`);

    expect(headCss()).toEqual(['.card {}']);
  });

  test('drops the previous story\'s CSS in the Canvas', () => {
    renderStory(`${styleFor('.card {}')}<div></div>`);
    renderStory(`${styleFor('.badge {}')}<span></span>`);

    expect(headCss()).toEqual(['.badge {}']);
  });

  test('keeps every story\'s CSS on a Docs page, where the stories share the head', () => {
    renderStory(`${styleFor('.card {}')}<div></div>`, 'docs');
    renderStory(`${styleFor('.badge {}')}${styleFor('.card {}')}<span></span>`, 'docs');

    expect(headCss()).toEqual(['.badge {}', '.card {}']);
  });

  test('moves a block it already has into the latest render\'s cascade order', () => {
    // The second story ships the shared block after one of its own.
    renderStory(`${styleFor('.base {}')}<div></div>`, 'docs');
    renderStory(`${styleFor('.override {}')}${styleFor('.base {}')}<div></div>`, 'docs');

    expect(headCss().indexOf('.base {}')).toBeGreaterThan(headCss().indexOf('.override {}'));
  });
});

describe('removeStoryStyles', () => {
  test('clears the last Astro story\'s CSS and nothing else', () => {
    renderStory(`${styleFor('.card {}')}<div></div>`);
    removeStoryStyles(document);

    expect(headCss()).toEqual([]);
    expect(document.getElementById('global')).not.toBeNull();
  });
});
