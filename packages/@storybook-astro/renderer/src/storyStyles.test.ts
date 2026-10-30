// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest';
import { moveStoryStylesToHead, removeHiddenStoryStyles, removeStoryStyles } from './storyStyles.ts';

const styleFor = (css: string) => `<style data-storybook-astro-styles>${css}</style>`;

/** Renders one story's HTML into a canvas the way render.tsx does. */
function renderInto(canvas: HTMLElement, html: string) {
  const template = document.createElement('template');

  template.innerHTML = html;
  moveStoryStylesToHead(template.content, canvas);
  canvas.innerHTML = template.innerHTML;
}

const headStyles = () => Array.from(document.head.querySelectorAll('style[data-storybook-astro-styles]'));
const headCss = () => headStyles().map((style) => style.textContent);

function createCanvas(parent: HTMLElement = document.body) {
  const canvas = document.createElement('div');

  parent.appendChild(canvas);

  return canvas;
}

beforeEach(() => {
  // Drops the last test's canvases, and with them the module's record of them.
  document.body.innerHTML = '';
  removeHiddenStoryStyles('story');
  document.head.innerHTML = '<style id="global">body { margin: 0; }</style>';
});

describe('moveStoryStylesToHead', () => {
  test('leaves the story markup first and puts its CSS at the end of the head, in order', () => {
    const canvas = createCanvas();

    renderInto(canvas, `${styleFor('.page {}')}${styleFor('.card {}')}<div class="page"></div>`);

    expect(canvas.innerHTML).toBe('<div class="page"></div>');
    expect(headCss()).toEqual(['.page {}', '.card {}']);
    expect(document.head.firstElementChild?.id).toBe('global');
  });

  test('drops CSS deleted in an edit when the story rerenders', () => {
    const canvas = createCanvas();

    renderInto(canvas, `${styleFor('.card { color: red; }')}<div></div>`);
    renderInto(canvas, `${styleFor('.card {}')}<div></div>`);

    expect(headCss()).toEqual(['.card {}']);
  });

  test('gives each story on a Docs page its own CSS', () => {
    const cardCanvas = createCanvas();
    const badgeCanvas = createCanvas();

    renderInto(cardCanvas, `${styleFor('.card {}')}<div></div>`);
    renderInto(badgeCanvas, `${styleFor('.badge {}')}<span></span>`);
    renderInto(cardCanvas, `${styleFor('.card { color: blue; }')}<div></div>`);

    expect(headCss()).toEqual(['.badge {}', '.card { color: blue; }']);
  });
});

describe('removeStoryStyles', () => {
  test('removes only the torn-down canvas\'s CSS', () => {
    const cardCanvas = createCanvas();
    const badgeCanvas = createCanvas();

    renderInto(cardCanvas, `${styleFor('.card {}')}<div></div>`);
    renderInto(badgeCanvas, `${styleFor('.badge {}')}<span></span>`);
    removeStoryStyles(cardCanvas);

    expect(headCss()).toEqual(['.badge {}']);
    expect(document.getElementById('global')).not.toBeNull();
  });

  test('lets the next story in the same canvas start clean', () => {
    const canvas = createCanvas();

    renderInto(canvas, `${styleFor('.card {}')}<div></div>`);
    removeStoryStyles(canvas);
    renderInto(canvas, `${styleFor('.card {}')}<div></div>`);

    expect(headCss()).toEqual(['.card {}']);
  });
});

describe('removeHiddenStoryStyles', () => {
  test('keeps the CSS of a story still on screen until the next story replaces it', () => {
    const canvas = createCanvas();

    renderInto(canvas, `${styleFor('.card {}')}<div>card</div>`);
    removeHiddenStoryStyles('story');

    expect(canvas.innerHTML).toBe('<div>card</div>');
    expect(headCss()).toEqual(['.card {}']);
  });

  test('removes the CSS of a closed Docs page\'s stories', () => {
    const docsCanvas = createCanvas();

    renderInto(docsCanvas, `${styleFor('.card {}')}<div>card</div>`);
    docsCanvas.remove();
    removeHiddenStoryStyles('story');

    expect(headCss()).toEqual([]);
  });

  test('removes the story canvas\'s CSS when a Docs page renders, and keeps the Docs stories\'', () => {
    const storyCanvas = createCanvas();
    const docsRoot = document.createElement('div');

    docsRoot.id = 'storybook-docs';
    document.body.appendChild(docsRoot);

    const docsCanvas = createCanvas(docsRoot);

    renderInto(storyCanvas, `${styleFor('.card {}')}<div>card</div>`);
    renderInto(docsCanvas, `${styleFor('.badge {}')}<span>badge</span>`);
    removeHiddenStoryStyles('docs');

    expect(headCss()).toEqual(['.badge {}']);
    expect(storyCanvas.innerHTML).toBe('');
    expect(docsCanvas.innerHTML).toBe('<span>badge</span>');
  });
});

describe('a canvas no longer in the page', () => {
  test('gets no CSS in the head', () => {
    const canvas = createCanvas();

    canvas.remove();
    renderInto(canvas, `${styleFor(':global(body) {}')}<div>card</div>`);

    expect(headCss()).toEqual([]);
    expect(canvas.innerHTML).toBe('<div>card</div>');
  });
});
