// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest';
import { moveStoryStylesToHead, removeStoryStyles, startCanvasRender } from './storyStyles.ts';

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

function createCanvas() {
  const canvas = document.createElement('div');

  document.body.appendChild(canvas);

  return canvas;
}

beforeEach(() => {
  document.head.innerHTML = '<style id="global">body { margin: 0; }</style>';
  document.body.innerHTML = '';
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

describe('startCanvasRender', () => {
  test('keeps the old story, styled, until the next story in the canvas replaces it', () => {
    const canvas = createCanvas();
    const teardownCard = startCanvasRender(canvas);

    renderInto(canvas, `${styleFor('.card {}')}<div>card</div>`);
    teardownCard();
    startCanvasRender(canvas);

    expect(canvas.innerHTML).toBe('<div>card</div>');
    expect(headCss()).toEqual(['.card {}']);

    renderInto(canvas, `${styleFor('.badge {}')}<span>badge</span>`);

    expect(headCss()).toEqual(['.badge {}']);
  });

  test('clears a removed story when the next render goes to another canvas', () => {
    const storyCanvas = createCanvas();
    const docsCanvas = createCanvas();
    const teardownCard = startCanvasRender(storyCanvas);

    renderInto(storyCanvas, `${styleFor('.card {}')}<div>card</div>`);
    teardownCard();
    startCanvasRender(docsCanvas);

    expect(storyCanvas.innerHTML).toBe('');
    expect(headCss()).toEqual([]);
  });

  test('a late teardown leaves the newer story alone', () => {
    const canvas = createCanvas();
    const teardownCard = startCanvasRender(canvas);

    renderInto(canvas, `${styleFor('.card {}')}<div>card</div>`);
    startCanvasRender(canvas);
    renderInto(canvas, `${styleFor('.badge {}')}<span>badge</span>`);
    teardownCard();
    startCanvasRender(createCanvas());

    expect(canvas.innerHTML).toBe('<span>badge</span>');
    expect(headCss()).toEqual(['.badge {}']);
  });
});
