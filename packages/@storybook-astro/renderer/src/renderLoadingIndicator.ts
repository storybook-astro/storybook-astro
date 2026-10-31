// An Astro story renders on the server, which can take seconds on a cold dev
// server or in server mode, and since #224 the canvas is empty while the next
// render is on its way. The indicator waits a short grace period so fast
// renders never flash a spinner (issue #236).
const SHOW_DELAY_MS = 200;
// Must stay below the 5000 ms render timeout in the framework's
// renderer-dev.ts and renderer-server.ts, or the render fails before the hint
// can show.
const SLOW_HINT_DELAY_MS = 2500;

const GRAY = 'rgba(128, 128, 128, 0.9)';
const LIGHT_GRAY = 'rgba(128, 128, 128, 0.3)';

// Removes the latest render's indicator from each canvas. A newer render into
// the canvas removes the older one's first, so two renders in flight show one
// indicator.
const stopByCanvas = new WeakMap<HTMLElement, () => void>();

/**
 * Shows "Rendering story…" in the canvas if the render takes longer than
 * 200 ms, and returns the function that removes it once the render settles.
 *
 * An empty canvas (a story switch, a remount, a saved edit) gets the indicator
 * in place of the story. A canvas that still shows the story (a Controls
 * change) gets it as an overlay, so the story stays visible. Styles are inline,
 * so no `<style>` goes into the canvas.
 */
export function showRenderLoadingIndicator(canvasElement: HTMLElement): () => void {
  stopByCanvas.get(canvasElement)?.();

  let root: HTMLElement | undefined;
  let animation: Animation | undefined;
  let previousPosition: string | undefined;
  let slowHintTimer: ReturnType<typeof setTimeout> | undefined;

  const showTimer = setTimeout(() => {
    const elements = createIndicator(canvasElement.ownerDocument);

    root = elements.root;
    animation = elements.animation;

    if (canvasElement.childElementCount > 0) {
      // The overlay needs a positioned canvas. Remember what was there so the
      // cleanup can put it back.
      const { position } = getComputedStyle(canvasElement);

      if (position === 'static' || position === '') {
        previousPosition = canvasElement.style.position;
        canvasElement.style.position = 'relative';
      }

      // The overlay covers the canvas exactly, so drop the standalone
      // indicator's min-height: a short story such as a button would otherwise
      // get a gray box spilling onto whatever sits below it.
      Object.assign(root.style, {
        position: 'absolute',
        inset: '0',
        minHeight: '',
        overflow: 'hidden',
        background: 'rgba(128, 128, 128, 0.12)'
      });
    }

    canvasElement.appendChild(root);
    slowHintTimer = setTimeout(() => {
      elements.hint.hidden = false;
    }, SLOW_HINT_DELAY_MS - SHOW_DELAY_MS);
  }, SHOW_DELAY_MS);

  const stop = () => {
    clearTimeout(showTimer);
    clearTimeout(slowHintTimer);
    // An infinite animation never finishes, and Storybook waits for running
    // animations before it reports a story rendered. Cancelling ends the wait.
    animation?.cancel();
    root?.remove();

    if (previousPosition !== undefined) {
      canvasElement.style.position = previousPosition;
      previousPosition = undefined;
    }

    if (stopByCanvas.get(canvasElement) === stop) {
      stopByCanvas.delete(canvasElement);
    }
  };

  stopByCanvas.set(canvasElement, stop);

  return stop;
}

function createIndicator(document: Document) {
  const root = document.createElement('div');

  root.setAttribute('role', 'status');
  root.setAttribute('data-storybook-astro-loading', '');
  Object.assign(root.style, {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    minHeight: '120px',
    fontFamily: '"Nunito Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
    fontSize: '13px',
    color: GRAY
  });

  const spinner = document.createElement('div');

  Object.assign(spinner.style, {
    width: '28px',
    height: '28px',
    boxSizing: 'border-box',
    border: `3px solid ${LIGHT_GRAY}`,
    borderTopColor: GRAY,
    borderRadius: '50%'
  });

  let animation: Animation | undefined;

  // A still ring reads as "busy" without motion for readers who asked for less.
  if (!document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    animation = spinner.animate?.([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
      duration: 800,
      iterations: Infinity
    });
  }

  const label = document.createElement('span');

  label.textContent = 'Rendering story…';

  const hint = document.createElement('span');

  hint.textContent = 'Still working. The render server may be starting up.';
  hint.hidden = true;

  root.append(spinner, label, hint);

  return { root, hint, animation };
}

/** Removes the canvas's indicator, for a render that isn't an Astro one. */
export function hideRenderLoadingIndicator(canvasElement: HTMLElement) {
  stopByCanvas.get(canvasElement)?.();
}

// The `min-height` each canvas had before a teardown held its height.
const heldHeightByCanvas = new WeakMap<HTMLElement, string>();

/**
 * Keeps the canvas at its current height after a teardown empties it, until
 * the next render settles, so the page doesn't collapse and regrow while the
 * next render is on its way. A Remount or a Docs story block then keeps the
 * reader's scroll position. A saved edit in the Canvas tab still scrolls to
 * the top: Storybook resets the scroll position before every story render.
 */
export function holdCanvasHeight(canvasElement: HTMLElement) {
  const height = canvasElement.offsetHeight;

  if (height === 0 || heldHeightByCanvas.has(canvasElement)) {
    return;
  }

  heldHeightByCanvas.set(canvasElement, canvasElement.style.minHeight);
  canvasElement.style.minHeight = `${height}px`;
}

/** Gives the canvas back its own height once the next render has settled. */
export function releaseCanvasHeight(canvasElement: HTMLElement) {
  const minHeight = heldHeightByCanvas.get(canvasElement);

  if (minHeight === undefined) {
    return;
  }

  canvasElement.style.minHeight = minHeight;
  heldHeightByCanvas.delete(canvasElement);
}
