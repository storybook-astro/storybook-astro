// @vitest-environment happy-dom
import { beforeEach, describe, expect, test } from 'vitest';
import { addStylesheetBeforeStoryStyles, moveStoryStylesToHead, removeStoryStyles } from './storyStyles.ts';

const styleFor = (css: string) => `<style data-storybook-astro-styles>${css}</style>`;

/** Renders one story's HTML into a canvas the way render.tsx does. */
function renderInto(canvas: HTMLElement, html: string) {
  canvas.innerHTML = moveStoryStylesToHead(html, canvas).innerHTML;
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

  test('puts changed CSS after stylesheets added since the last render', () => {
    const canvas = createCanvas();

    renderInto(canvas, `${styleFor('.card {}')}<div></div>`);
    document.head.insertAdjacentHTML('beforeend', '<style id="imported">.card { color: red; }</style>');
    renderInto(canvas, `${styleFor('.card { color: blue; }')}<div></div>`);

    expect(document.head.lastElementChild?.textContent).toBe('.card { color: blue; }');
  });

  test('puts edited CSS and the CSS it still ships after stylesheets added since the last render', () => {
    const canvas = createCanvas();

    renderInto(canvas, `${styleFor('.card {}')}${styleFor('.global {}')}<div></div>`);
    document.head.insertAdjacentHTML('beforeend', '<style id="island">.card { color: red; }</style>');
    renderInto(canvas, `${styleFor('.card { color: blue; }')}${styleFor('.global {}')}<div></div>`);

    expect(Array.from(document.head.children).map((element) => element.id || element.textContent)).toEqual([
      'global',
      'island',
      '.card { color: blue; }',
      '.global {}',
    ]);
  });

  test('follows a rerender that ships the same stylesheets in a new order', () => {
    const canvas = createCanvas();

    renderInto(canvas, `${styleFor('.a {}')}${styleFor('.b {}')}<div></div>`);
    renderInto(canvas, `${styleFor('.b {}')}${styleFor('.a {}')}<div></div>`);

    expect(headCss()).toEqual(['.b {}', '.a {}']);
  });

  test('keeps the last copy of a stylesheet a render ships twice, so it still wins ties', () => {
    const canvas = createCanvas();

    renderInto(canvas, `${styleFor('.a {}')}${styleFor('.b {}')}${styleFor('.a {}')}<div></div>`);

    expect(headCss()).toEqual(['.b {}', '.a {}']);
  });

  test('puts CSS in the head again when something moved its element out of the head', () => {
    const canvas = createCanvas();

    renderInto(canvas, `${styleFor('.card {}')}<div></div>`);
    document.body.appendChild(headStyles()[0]);
    renderInto(canvas, `${styleFor('.card {}')}${styleFor('.badge {}')}<div></div>`);

    expect(headCss()).toEqual(['.card {}', '.badge {}']);
  });

  test('keeps the server\'s attributes on the style elements it adds', () => {
    renderInto(createCanvas(), `<style data-storybook-astro-styles media="print">.card {}</style><div></div>`);

    expect(headStyles()[0].getAttribute('media')).toBe('print');
  });

  test('keeps the same elements when a Controls change rerenders with the same CSS', () => {
    const cardCanvas = createCanvas();
    const badgeCanvas = createCanvas();

    renderInto(cardCanvas, `${styleFor('.card {}')}<div>first</div>`);
    renderInto(badgeCanvas, `${styleFor('.badge {}')}<span></span>`);
    renderInto(cardCanvas, `${styleFor('.card {}')}<div>second</div>`);

    expect(headCss()).toEqual(['.card {}', '.badge {}']);
    expect(cardCanvas.innerHTML).toBe('<div>second</div>');
  });

  test('gives each story on a Docs page its own CSS', () => {
    const cardCanvas = createCanvas();
    const badgeCanvas = createCanvas();

    renderInto(cardCanvas, `${styleFor('.card {}')}<div></div>`);
    renderInto(badgeCanvas, `${styleFor('.badge {}')}<span></span>`);
    renderInto(cardCanvas, `${styleFor('.card { color: blue; }')}<div></div>`);

    expect(headCss()).toEqual(['.badge {}', '.card { color: blue; }']);
  });

  test('puts CSS that several stories on a Docs page ship in the head once (issue #234)', () => {
    const firstCard = createCanvas();
    const secondCard = createCanvas();

    renderInto(firstCard, `${styleFor('.card {}')}<div>first</div>`);
    renderInto(secondCard, `${styleFor('.card {}')}<div>second</div>`);

    expect(headCss()).toEqual(['.card {}']);
  });

  test('keeps a shared global stylesheet ahead of the component CSS that overrides it', () => {
    // Button ships global.css then button.css, which sets `a`'s color. Link
    // ships global.css too. A second copy of global.css after button.css would
    // override Button's links.
    const buttonCanvas = createCanvas();
    const linkCanvas = createCanvas();

    renderInto(buttonCanvas, `${styleFor('a { color: inherit; }')}${styleFor('a { color: red; }')}<a></a>`);
    renderInto(linkCanvas, `${styleFor('a { color: inherit; }')}<a></a>`);

    expect(headCss()).toEqual(['a { color: inherit; }', 'a { color: red; }']);
  });

  test('keeps CSS another story still uses when one story changes', () => {
    const firstCard = createCanvas();
    const secondCard = createCanvas();

    renderInto(firstCard, `${styleFor('.card {}')}<div></div>`);
    renderInto(secondCard, `${styleFor('.card {}')}<div></div>`);
    renderInto(firstCard, `${styleFor('.card { color: blue; }')}<div></div>`);

    expect(headCss()).toEqual(['.card {}', '.card { color: blue; }']);
  });

  test('keeps CSS the canvas still ships in place when other CSS changes', () => {
    const canvas = createCanvas();

    renderInto(canvas, `${styleFor('.global {}')}${styleFor('.card {}')}<div></div>`);
    const globalStyle = headStyles()[0];

    renderInto(canvas, `${styleFor('.global {}')}${styleFor('.card { color: blue; }')}<div></div>`);

    expect(headStyles()[0]).toBe(globalStyle);
    expect(headCss()).toEqual(['.global {}', '.card { color: blue; }']);
  });

  test('puts a global stylesheet ahead of component CSS another story already shared', () => {
    const buttonCanvas = createCanvas();
    const pageCanvas = createCanvas();

    renderInto(buttonCanvas, `${styleFor('.button {}')}<button></button>`);
    renderInto(pageCanvas, `${styleFor('.global {}')}${styleFor('.button {}')}<div></div>`);

    expect(headCss()).toEqual(['.global {}', '.button {}']);
  });

  test('keeps an edited global stylesheet ahead of the component CSS that overrides it', () => {
    const canvas = createCanvas();

    renderInto(canvas, `${styleFor('a { color: inherit; }')}${styleFor('a { color: red; }')}<a></a>`);
    renderInto(canvas, `${styleFor('a { color: inherit; x: 1; }')}${styleFor('a { color: red; }')}<a></a>`);

    expect(headCss()).toEqual(['a { color: inherit; x: 1; }', 'a { color: red; }']);
  });

  test('keeps an edited global stylesheet ahead of component CSS another story shares', () => {
    const buttonCanvas = createCanvas();
    const otherButtonCanvas = createCanvas();

    renderInto(buttonCanvas, `${styleFor('.global {}')}${styleFor('.button {}')}<button></button>`);
    renderInto(otherButtonCanvas, `${styleFor('.button {}')}<button></button>`);
    renderInto(buttonCanvas, `${styleFor('.global { color: red; }')}${styleFor('.button {}')}<button></button>`);

    expect(headCss()).toEqual(['.global { color: red; }', '.button {}']);
  });

  test('puts a new story\'s reset ahead of a global stylesheet another story already shared', () => {
    const buttonCanvas = createCanvas();
    const linkCanvas = createCanvas();

    renderInto(buttonCanvas, `${styleFor('.global {}')}${styleFor('.button {}')}<button></button>`);
    renderInto(linkCanvas, `${styleFor('.reset {}')}${styleFor('.global {}')}${styleFor('.link {}')}<a></a>`);

    expect(headCss()).toEqual(['.reset {}', '.global {}', '.button {}', '.link {}']);
  });

  test('keeps a story\'s own CSS in its order when another story put the shared stylesheets in the opposite order', () => {
    const otherCanvas = createCanvas();
    const canvas = createCanvas();

    renderInto(otherCanvas, `${styleFor('.theme {}')}${styleFor('.reset {}')}<div></div>`);
    renderInto(
      canvas,
      `${styleFor('.card {}')}${styleFor('.reset {}')}${styleFor('.badge {}')}${styleFor('.theme {}')}<div></div>`
    );

    const css = headCss();

    expect(css.indexOf('.card {}')).toBeLessThan(css.indexOf('.badge {}'));
    expect(css.indexOf('.card {}')).toBeLessThan(css.indexOf('.reset {}'));
    expect(css.indexOf('.reset {}')).toBeLessThan(css.indexOf('.badge {}'));
  });

  test('keeps a story\'s own CSS after the shared stylesheets it ships ahead of it, when another story put them in another order', () => {
    const otherCanvas = createCanvas();
    const canvas = createCanvas();

    renderInto(otherCanvas, `${styleFor('.reset {}')}${styleFor('.theme {}')}${styleFor('.global {}')}<div></div>`);
    renderInto(
      canvas,
      `${styleFor('.global {}')}${styleFor('.reset {}')}${styleFor('.card {}')}${styleFor('.theme {}')}<div></div>`
    );

    const css = headCss();

    expect(css.indexOf('.global {}')).toBeLessThan(css.indexOf('.card {}'));
    expect(css.indexOf('.reset {}')).toBeLessThan(css.indexOf('.card {}'));
  });

  test('keeps a story\'s own CSS ahead of every shared stylesheet it ships after it, when another story put them in another order', () => {
    const linkCanvas = createCanvas();
    const cardCanvas = createCanvas();

    renderInto(linkCanvas, `${styleFor('.reset {}')}${styleFor('.link {}')}<a></a>`);
    renderInto(cardCanvas, `${styleFor('.card {}')}${styleFor('.link {}')}${styleFor('.reset {}')}<div></div>`);

    const css = headCss();

    expect(css.indexOf('.card {}')).toBeLessThan(css.indexOf('.link {}'));
    expect(css.indexOf('.card {}')).toBeLessThan(css.indexOf('.reset {}'));
  });
});

describe('removeStoryStyles', () => {
  test('keeps CSS another canvas still uses', () => {
    const firstCard = createCanvas();
    const secondCard = createCanvas();

    renderInto(firstCard, `${styleFor('.card {}')}<div></div>`);
    renderInto(secondCard, `${styleFor('.card {}')}<div></div>`);
    removeStoryStyles(firstCard);

    expect(headCss()).toEqual(['.card {}']);

    removeStoryStyles(secondCard);

    expect(headCss()).toEqual([]);
  });

  test('removes only that canvas\'s CSS', () => {
    const cardCanvas = createCanvas();
    const badgeCanvas = createCanvas();

    renderInto(cardCanvas, `${styleFor('.card {}')}<div></div>`);
    renderInto(badgeCanvas, `${styleFor('.badge {}')}<span></span>`);
    removeStoryStyles(cardCanvas);

    expect(headCss()).toEqual(['.badge {}']);
    expect(document.getElementById('global')).not.toBeNull();
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
