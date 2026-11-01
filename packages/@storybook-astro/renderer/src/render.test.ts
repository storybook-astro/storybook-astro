// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { RenderContext } from 'storybook/internal/types';
import type { AstroRenderer } from './types.ts';

const server = vi.hoisted(() => ({ render: vi.fn() }));

vi.mock('astro:scripts/page.js', () => ({}));
vi.mock('virtual:storybook-astro-renderer', () => ({ init: undefined, applyStyles: undefined, render: server.render }));
vi.mock('virtual:storybook-renderer-fallback', () => ({
  react: {
    renderToCanvas: (_ctx: unknown, canvas: HTMLElement) => {
      canvas.innerHTML = '<div>react</div>';

      return () => {
        canvas.innerHTML = '';
      };
    }
  }
}));

const { renderToCanvas } = await import('./render.tsx');

function astroComponent() {
  return Object.assign(() => {}, { isAstroComponentFactory: true, moduleId: '/src/Card.astro' });
}

function storyContext(storyFn: () => unknown, parameters: Record<string, unknown> = {}) {
  return {
    storyFn,
    kind: 'Card',
    name: 'Default',
    showMain: vi.fn(),
    showError: vi.fn(),
    forceRemount: false,
    storyContext: { id: 'card--default', title: 'Card', name: 'Default', args: {}, parameters }
  } as unknown as RenderContext<AstroRenderer>;
}

const renderAstro = (canvas: HTMLElement) => {
  const component = astroComponent();

  return renderToCanvas(storyContext(() => component), canvas);
};

/** A story's response: one CSS block per class name, then markup naming the last one. */
function storyHtml(classNames: string | string[]) {
  const names = typeof classNames === 'string' ? [classNames] : classNames;
  const styles = names.map((name) => `<style data-storybook-astro-styles>.${name} {}</style>`).join('');

  return `${styles}<div>${names[names.length - 1]}</div>`;
}

/** Has the next server render answer with this story's CSS and markup. */
function serverRespondsWith(classNames: string | string[]) {
  server.render.mockResolvedValueOnce({ html: storyHtml(classNames) });
}

/** Holds the next server render until the test answers or fails it. */
function serverWaits() {
  let respond!: (classNames: string | string[]) => void;
  let fail!: () => void;

  server.render.mockReturnValueOnce(
    new Promise((resolve, reject) => {
      respond = (classNames) => resolve({ html: storyHtml(classNames) });
      fail = () => reject(new Error('Render failed'));
    })
  );

  return { respond, fail };
}

const headCss = () =>
  Array.from(document.head.querySelectorAll('style[data-storybook-astro-styles]')).map(
    (style) => style.textContent
  );

let canvas: HTMLElement;

beforeEach(() => {
  server.render.mockReset();
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="storybook-root"></div>';
  canvas = document.getElementById('storybook-root')!;
});

describe('rendering an Astro story', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('sends a slot edited in Controls as slot content, not a prop (issue #203)', async () => {
    serverRespondsWith('first');
    const component = astroComponent();
    const context = storyContext(() => component);

    Object.assign(context.storyContext.args, {
      title: 'Hello',
      slots: { default: 'Old' },
      'slot:default': 'Edited'
    });

    await renderToCanvas(context, canvas);

    expect(server.render).toHaveBeenCalledWith(
      expect.objectContaining({ args: { title: 'Hello' }, slots: { default: 'Edited' } })
    );
  });

  test('drops a rerender whose canvas was removed while it waited, and the teardown still clears the story it shows (issue #288)', async () => {
    vi.useFakeTimers();
    serverRespondsWith('first');
    await renderAstro(canvas);

    const lateRender = serverWaits();
    const rendering = renderAstro(canvas);

    await vi.advanceTimersByTimeAsync(250);
    canvas.remove();
    lateRender.respond('second');
    const teardown = await rendering;

    expect(canvas.innerHTML).toBe('<div>first</div>');
    expect(headCss()).toEqual(['.first {}']);
    expect(canvas.querySelector('[data-storybook-astro-loading]')).toBeNull();
    expect(canvas.style.position).toBe('');

    await teardown?.();

    expect(canvas.innerHTML).toBe('');
    expect(headCss()).toEqual([]);
  });

  test('renders a story whose canvas was removed and put back while it waited', async () => {
    const lateRender = serverWaits();
    const rendering = renderAstro(canvas);

    canvas.remove();
    document.body.append(canvas);
    lateRender.respond('second');
    await rendering;

    expect(canvas.innerHTML).toBe('<div>second</div>');
    expect(headCss()).toEqual(['.second {}']);
  });

  test('lets a live story remove CSS it shares with a story whose canvas was removed while it waited (issue #288)', async () => {
    const removedCanvas = document.createElement('div');

    document.body.append(removedCanvas);
    const lateRender = serverWaits();
    const rendering = renderAstro(removedCanvas);

    removedCanvas.remove();
    lateRender.respond(['shared', 'removed']);
    await rendering;

    serverRespondsWith(['shared', 'live']);
    const teardown = await renderAstro(canvas);

    await teardown?.();

    expect(headCss()).toEqual([]);
  });

  test('renders into a canvas that was never in the document', async () => {
    const detachedCanvas = document.createElement('div');

    serverRespondsWith('first');
    const teardown = await renderAstro(detachedCanvas);

    expect(detachedCanvas.innerHTML).toBe('<div>first</div>');

    await teardown?.();
  });
});

describe('the teardown renderToCanvas returns for an Astro story', () => {
  test('clears the story markup and its CSS', async () => {
    serverRespondsWith('first');
    const teardown = await renderAstro(canvas);

    await teardown?.();

    expect(canvas.innerHTML).toBe('');
    expect(headCss()).toEqual([]);
  });

  test('leaves a newer story alone when it runs late, as a Docs story block runs it', async () => {
    serverRespondsWith('first');
    const lateTeardown = await renderAstro(canvas);

    serverRespondsWith('second');
    await renderAstro(canvas);
    await lateTeardown?.();

    expect(canvas.innerHTML).toBe('<div>second</div>');
    expect(headCss()).toEqual(['.second {}']);
  });

  test('still clears the last story when a rerender throws before reaching the server', async () => {
    serverRespondsWith('first');
    const teardown = await renderAstro(canvas);

    const failingStory = storyContext(() => {
      throw new Error('Decorator failed');
    });

    await expect(renderToCanvas(failingStory, canvas)).rejects.toThrow('Decorator failed');
    await teardown?.();

    expect(canvas.innerHTML).toBe('');
    expect(headCss()).toEqual([]);
  });

  test('still clears the last story when the server render fails', async () => {
    serverRespondsWith('first');
    const teardown = await renderAstro(canvas);

    server.render.mockRejectedValueOnce(new Error('Render failed'));
    await expect(renderAstro(canvas)).rejects.toThrow('Render failed');

    expect(canvas.innerHTML).toBe('<div>first</div>');

    await teardown?.();

    expect(canvas.innerHTML).toBe('');
    expect(headCss()).toEqual([]);
  });

  test('leaves no CSS behind when it runs late and the newer render then fails', async () => {
    serverRespondsWith('first');
    const lateTeardown = await renderAstro(canvas);

    const secondRender = serverWaits();
    const rendering = renderAstro(canvas);

    await lateTeardown?.();
    secondRender.fail();
    await expect(rendering).rejects.toThrow('Render failed');

    expect(canvas.innerHTML).toBe('');
    expect(headCss()).toEqual([]);
  });

  test('belongs to the newer story when a slow response arrives after it', async () => {
    const slowRender = serverWaits();
    const slowRendering = renderAstro(canvas);

    serverRespondsWith('second');
    const teardown = await renderAstro(canvas);

    slowRender.respond('first');
    await slowRendering;

    expect(canvas.innerHTML).toBe('<div>second</div>');

    await teardown?.();

    expect(canvas.innerHTML).toBe('');
    expect(headCss()).toEqual([]);
  });

  test('keeps a newer story, without the error, when an older render fails after it', async () => {
    const slowRender = serverWaits();
    const slowRendering = renderAstro(canvas);

    serverRespondsWith('second');
    await renderAstro(canvas);

    slowRender.fail();
    await slowRendering;

    expect(canvas.innerHTML).toBe('<div>second</div>');
    expect(headCss()).toEqual(['.second {}']);
  });

  test('keeps an earlier render\'s response when a rerender\'s story function throws', async () => {
    const slowRender = serverWaits();
    const slowRendering = renderAstro(canvas);
    const failingStory = storyContext(() => {
      throw new Error('Decorator failed');
    });

    await expect(renderToCanvas(failingStory, canvas)).rejects.toThrow('Decorator failed');
    slowRender.respond('first');
    await slowRendering;

    expect(canvas.innerHTML).toBe('<div>first</div>');
  });

  test('leaves a framework story alone when the Astro response arrives after it', async () => {
    const slowRender = serverWaits();
    const slowRendering = renderAstro(canvas);

    await renderToCanvas(storyContext(() => null, { renderer: 'react' }), canvas);
    slowRender.respond('first');
    const teardown = await slowRendering;

    await teardown?.();

    expect(canvas.innerHTML).toBe('<div>react</div>');
    expect(headCss()).toEqual([]);
  });

  test('leaves a framework story alone when it runs late', async () => {
    serverRespondsWith('first');
    const lateTeardown = await renderAstro(canvas);

    await renderToCanvas(storyContext(() => null, { renderer: 'react' }), canvas);
    await lateTeardown?.();

    expect(canvas.innerHTML).toBe('<div>react</div>');
    expect(headCss()).toEqual([]);
  });
});

describe('while an Astro story renders', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  test('shows a loading indicator once the server takes over 200 ms, and replaces it with the story', async () => {
    vi.useFakeTimers();
    const slowRender = serverWaits();
    const rendering = renderAstro(canvas);

    await vi.advanceTimersByTimeAsync(250);

    expect(canvas.querySelector('[data-storybook-astro-loading]')).not.toBeNull();

    slowRender.respond('first');
    await rendering;

    expect(canvas.innerHTML).toBe('<div>first</div>');
  });

  test('shows the slow hint well before the render times out at 5 s', async () => {
    vi.useFakeTimers();
    const slowRender = serverWaits();
    const rendering = renderAstro(canvas);

    await vi.advanceTimersByTimeAsync(4900);

    const hint = Array.from(canvas.querySelectorAll('span')).find((span) =>
      span.textContent?.includes('Still working')
    );

    expect(hint?.hidden).toBe(false);

    slowRender.respond('first');
    await rendering;
  });

  test('overlays a story a slow Controls change rerenders, and puts the canvas back before the new markup goes in', async () => {
    serverRespondsWith('first');
    await renderAstro(canvas);

    vi.useFakeTimers();
    const slowRender = serverWaits();
    const rerendering = renderAstro(canvas);

    await vi.advanceTimersByTimeAsync(250);

    expect(canvas.querySelector('[data-storybook-astro-loading]')).not.toBeNull();
    expect(canvas.style.position).toBe('relative');

    let positionWhenMarkupWritten: string | undefined;
    const writeMarkup = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')!;

    Object.defineProperty(canvas, 'innerHTML', {
      configurable: true,
      get: () => writeMarkup.get!.call(canvas),
      set: (html: string) => {
        positionWhenMarkupWritten = canvas.style.position;
        writeMarkup.set!.call(canvas, html);
      }
    });

    slowRender.respond('second');
    await rerendering;

    expect(positionWhenMarkupWritten).toBe('');
    expect(canvas.style.position).toBe('');
    expect(canvas.innerHTML).toBe('<div>second</div>');
  });

  test('keeps the held height when an older render finishes after a newer one started', async () => {
    serverRespondsWith('first');
    const teardown = await renderAstro(canvas);

    Object.defineProperty(canvas, 'offsetHeight', { configurable: true, value: 900 });
    await teardown?.();

    const olderRender = serverWaits();
    const older = renderAstro(canvas);
    const newerRender = serverWaits();
    const newer = renderAstro(canvas);

    olderRender.respond('older');
    await older;

    expect(canvas.style.minHeight).toBe('900px');

    newerRender.respond('newer');
    await newer;

    expect(canvas.style.minHeight).toBe('');
    expect(canvas.innerHTML).toBe('<div>newer</div>');
  });

  test('keeps the newer render\'s indicator when an older render finishes late', async () => {
    vi.useFakeTimers();
    const olderRender = serverWaits();
    const older = renderAstro(canvas);
    const newerRender = serverWaits();
    const newer = renderAstro(canvas);

    await vi.advanceTimersByTimeAsync(250);
    olderRender.respond('older');
    await older;

    expect(canvas.querySelector('[data-storybook-astro-loading]')).not.toBeNull();

    newerRender.respond('newer');
    await newer;

    expect(canvas.querySelector('[data-storybook-astro-loading]')).toBeNull();
  });

  test('gives the height back when the next story function throws', async () => {
    serverRespondsWith('first');
    const teardown = await renderAstro(canvas);

    Object.defineProperty(canvas, 'offsetHeight', { configurable: true, value: 900 });
    await teardown?.();

    expect(canvas.style.minHeight).toBe('900px');

    const brokenStory = storyContext(() => {
      throw new Error('Story failed');
    });

    await expect(renderToCanvas(brokenStory, canvas)).rejects.toThrow('Story failed');
    expect(canvas.style.minHeight).toBe('');
  });

  test('removes an earlier render\'s indicator when the next story function throws, so it doesn\'t cover the error', async () => {
    vi.useFakeTimers();
    const slowRender = serverWaits();
    const rendering = renderAstro(canvas);

    await vi.advanceTimersByTimeAsync(250);

    expect(canvas.querySelector('[data-storybook-astro-loading]')).not.toBeNull();

    const brokenStory = storyContext(() => {
      throw new Error('Story failed');
    });

    await expect(renderToCanvas(brokenStory, canvas)).rejects.toThrow('Story failed');
    expect(canvas.querySelector('[data-storybook-astro-loading]')).toBeNull();

    slowRender.respond('first');
    await rendering;
  });

  test('removes the indicator when the render fails', async () => {
    vi.useFakeTimers();
    const slowRender = serverWaits();
    const rendering = renderAstro(canvas);

    await vi.advanceTimersByTimeAsync(250);
    slowRender.fail();
    await expect(rendering).rejects.toThrow('Render failed');

    expect(canvas.querySelector('[data-storybook-astro-loading]')).toBeNull();
  });

  test('keeps the canvas height from a teardown until the next render writes', async () => {
    serverRespondsWith('first');
    const teardown = await renderAstro(canvas);

    Object.defineProperty(canvas, 'offsetHeight', { configurable: true, value: 900 });
    await teardown?.();

    expect(canvas.style.minHeight).toBe('900px');

    serverRespondsWith('second');
    await renderAstro(canvas);

    expect(canvas.style.minHeight).toBe('');
  });

  test('gives the canvas its own height back before the next story runs its inline scripts', async () => {
    serverRespondsWith('first');
    const teardown = await renderAstro(canvas);

    Object.defineProperty(canvas, 'offsetHeight', { configurable: true, value: 900 });
    await teardown?.();

    // A browser runs a classic inline script as it goes into the document.
    // happy-dom doesn't run scripts, so note the height at that moment.
    const heightWhenScriptsRan: string[] = [];
    const insertScript = Node.prototype.replaceChild;

    vi.spyOn(Node.prototype, 'replaceChild').mockImplementation(function (
      this: Node,
      newChild,
      oldChild
    ) {
      if (newChild instanceof HTMLScriptElement) {
        heightWhenScriptsRan.push(canvas.style.minHeight);
      }

      return insertScript.call(this, newChild, oldChild);
    });

    server.render.mockResolvedValueOnce({ html: '<div>second</div><script>measureLayout()</script>' });
    await renderAstro(canvas);

    expect(heightWhenScriptsRan).toEqual(['']);
  });

  test('gives the height back when a framework story renders next', async () => {
    serverRespondsWith('first');
    const teardown = await renderAstro(canvas);

    Object.defineProperty(canvas, 'offsetHeight', { configurable: true, value: 900 });
    await teardown?.();
    await renderToCanvas(storyContext(() => null, { renderer: 'react' }), canvas);

    expect(canvas.style.minHeight).toBe('');
  });
});
