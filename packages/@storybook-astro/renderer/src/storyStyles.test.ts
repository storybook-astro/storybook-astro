// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest';
import {
  addStylesheetBeforeStoryStyles,
  clearHiddenCanvases,
  moveStoryStylesToHead,
  removeStoryStyles
} from './storyStyles.ts';

const styleFor = (css: string) => `<style data-storybook-astro-styles>${css}</style>`;

/** Renders one story's HTML into a canvas the way render.tsx does. */
function renderInto(canvas: HTMLElement, html: string) {
  canvas.innerHTML = moveStoryStylesToHead(html, canvas).innerHTML;
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
  clearHiddenCanvases();
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

    expect(headCss()).toEqual(['.card { color: blue; }', '.badge {}']);
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

describe('clearHiddenCanvases', () => {
  /** Storybook's two roots, with the one that isn't showing hidden. */
  function createStorybookRoots(showing: 'story' | 'docs') {
    const storyRoot = createCanvas();
    const docsRoot = document.createElement('div');

    storyRoot.id = 'storybook-root';
    docsRoot.id = 'storybook-docs';
    document.body.appendChild(docsRoot);
    (showing === 'docs' ? storyRoot : docsRoot).setAttribute('hidden', 'true');

    return { storyRoot, docsCanvas: createCanvas(docsRoot) };
  }

  test('keeps a story on screen, and its CSS, even when a slow Docs page finishes late', () => {
    const { storyRoot } = createStorybookRoots('story');

    renderInto(storyRoot, `${styleFor('.card {}')}<div>card</div>`);
    clearHiddenCanvases();

    expect(storyRoot.innerHTML).toBe('<div>card</div>');
    expect(headCss()).toEqual(['.card {}']);
  });

  test('removes the CSS of a closed Docs page\'s stories', () => {
    const docsCanvas = createCanvas();

    renderInto(docsCanvas, `${styleFor('.card {}')}<div>card</div>`);
    docsCanvas.remove();
    clearHiddenCanvases();

    expect(headCss()).toEqual([]);
  });

  test('clears the story canvas a Docs page hides, and keeps the Docs stories', () => {
    const { storyRoot, docsCanvas } = createStorybookRoots('docs');

    renderInto(storyRoot, `${styleFor('.card {}')}<div>card</div>`);
    renderInto(docsCanvas, `${styleFor('.badge {}')}<span>badge</span>`);
    clearHiddenCanvases();

    expect(headCss()).toEqual(['.badge {}']);
    expect(storyRoot.innerHTML).toBe('');
    expect(docsCanvas.innerHTML).toBe('<span>badge</span>');
  });
});

describe('a canvas not in the page yet', () => {
  test('keeps its markup and CSS while other stories render, so it is styled once attached', () => {
    const cardCanvas = document.createElement('div');
    const badgeCanvas = document.createElement('div');

    renderInto(cardCanvas, `${styleFor('.card {}')}<div>card</div>`);
    clearHiddenCanvases();
    renderInto(badgeCanvas, `${styleFor('.badge {}')}<span>badge</span>`);
    document.body.append(cardCanvas, badgeCanvas);

    expect(cardCanvas.innerHTML).toBe('<div>card</div>');
    expect(headCss()).toEqual(['.card {}', '.badge {}']);
  });
});

describe('addStylesheetBeforeStoryStyles', () => {
  test('puts a stylesheet ahead of the story CSS, so the story CSS wins ties', () => {
    renderInto(createCanvas(), `${styleFor('.card {}')}<div></div>`);

    const link = document.createElement('link');

    addStylesheetBeforeStoryStyles(link, document);

    expect(link.nextElementSibling?.textContent).toBe('.card {}');
  });
});
