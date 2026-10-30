// @vitest-environment happy-dom
import { beforeEach, describe, expect, test, vi } from 'vitest';
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

/** Has the next server render answer with this story's CSS and markup. */
function serverRespondsWith(name: string) {
  server.render.mockResolvedValueOnce({
    html: `<style data-storybook-astro-styles>.${name} {}</style><div>${name}</div>`
  });
}

/** Holds the next server render until the test answers or fails it. */
function serverWaits() {
  let respond!: (name: string) => void;
  let fail!: () => void;

  server.render.mockReturnValueOnce(
    new Promise((resolve, reject) => {
      respond = (name) =>
        resolve({ html: `<style data-storybook-astro-styles>.${name} {}</style><div>${name}</div>` });
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

  test('keeps a newer story when an older render fails after it', async () => {
    const slowRender = serverWaits();
    const slowRendering = renderAstro(canvas);

    serverRespondsWith('second');
    await renderAstro(canvas);

    slowRender.fail();
    await expect(slowRendering).rejects.toThrow('Render failed');

    expect(canvas.innerHTML).toBe('<div>second</div>');
    expect(headCss()).toEqual(['.second {}']);
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

describe('the teardown renderToCanvas returns for a framework story', () => {
  test('leaves a newer story alone when it runs late', async () => {
    const reactStory = storyContext(() => null, { renderer: 'react' });
    const lateTeardown = await renderToCanvas(reactStory, canvas);

    await renderToCanvas(reactStory, canvas);
    await lateTeardown?.();

    expect(canvas.innerHTML).toBe('<div>react</div>');
  });
});
