// An Astro story renders on the server, which can take seconds on a cold dev
// server or in server mode, and since #224 the canvas is empty while the next
// render is on its way. The indicator waits a short grace period so fast
// renders never flash a spinner (issue #236).
const SHOW_DELAY_MS = 200;
// Must stay below the 5000 ms render timeout in the framework's
// renderer-dev.ts and renderer-server.ts, or the render fails before the hint
// can show. renderer-static.ts has no timeout, since it only fetches the
// prerendered stories file.
const SLOW_HINT_DELAY_MS = 2500;

const GRAY = 'rgba(128, 128, 128, 0.9)';
const LIGHT_GRAY = 'rgba(128, 128, 128, 0.3)';

// Removes the indicator each canvas shows. A newer render into the canvas
// removes the older one's first, so two renders in flight show one indicator.
const hideByCanvas = new WeakMap<HTMLElement, () => void>();

/**
 * Shows "Rendering story…" in the canvas if the render takes longer than
 * 200 ms, until `hideRenderLoadingIndicator` removes it.
 *
 * What the reader sees depends on the canvas, not on what started the render.
 * A canvas whose story has been cleared (a story switch, a remount, a saved
 * edit, or a Controls change on a story that uses `mount`) gets the indicator
 * in place of the story. A canvas that still shows a story, as on most
 * Controls changes, gets it as an overlay, so the story stays visible. Styles
 * are inline, so no `<style>` goes into the canvas.
 */
export function showRenderLoadingIndicator(canvasElement: HTMLElement) {
  hideRenderLoadingIndicator(canvasElement);

  let root: HTMLElement | undefined;
  let previousPosition: string | undefined;
  let slowHintTimer: ReturnType<typeof setTimeout> | undefined;

  const showTimer = setTimeout(() => {
    const elements = createIndicator(canvasElement.ownerDocument);

    root = elements.root;

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
      // get a gray box spilling onto whatever sits below it. The z-index keeps
      // it above positioned story elements, such as a sticky header. `clip`
      // rather than `hidden`, because `hidden` makes the overlay a scroll
      // container and the sticky row below would stick inside it instead of
      // the page.
      Object.assign(root.style, {
        position: 'absolute',
        inset: '0',
        zIndex: '2147483647',
        minHeight: '',
        overflow: 'clip',
        background: 'rgba(128, 128, 128, 0.12)'
      });

      // On a story taller than the window, the middle of the overlay can be
      // below the fold. The sticky row stays in view while the reader
      // scrolls, and the overlay's own centering still applies on a short
      // canvas. One row with a small spinner fits a button-height canvas,
      // where the standalone column would be cut through the middle, and
      // the text stays on one line, cut off with an ellipsis, rather than
      // wrapping out of sight.
      const row = canvasElement.ownerDocument.createElement('div');

      Object.assign(row.style, {
        position: 'sticky',
        top: 'calc(50% - 12px)',
        bottom: 'calc(50% - 12px)',
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: '8px',
        minWidth: '0',
        maxWidth: '100%'
      });
      Object.assign(elements.spinner.style, {
        width: '16px',
        height: '16px',
        borderWidth: '2px',
        flexShrink: '0'
      });
      elements.label.style.whiteSpace = 'nowrap';
      Object.assign(elements.hint.style, {
        whiteSpace: 'nowrap',
        minWidth: '0',
        overflow: 'hidden',
        textOverflow: 'ellipsis'
      });
      row.append(elements.spinner, elements.label, elements.hint);
      root.append(row);
    }

    canvasElement.appendChild(root);
    slowHintTimer = setTimeout(() => {
      elements.hint.hidden = false;
    }, SLOW_HINT_DELAY_MS - SHOW_DELAY_MS);
  }, SHOW_DELAY_MS);

  hideByCanvas.set(canvasElement, () => {
    clearTimeout(showTimer);
    clearTimeout(slowHintTimer);
    root?.remove();

    if (previousPosition !== undefined) {
      canvasElement.style.position = previousPosition;
    }

    hideByCanvas.delete(canvasElement);
  });
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

  // A still ring reads as "busy" without motion for readers who asked for less.
  // A CSS animation rather than a Web Animation, because Storybook's
  // waitForAnimations skips only infinite CSS animations before it reports a
  // story rendered. The sb-rotate360 keyframes come from Storybook's preview
  // head; where they're missing (portable stories) the ring stays still.
  if (!document.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    spinner.style.animation = 'sb-rotate360 0.8s linear infinite';
  }

  const label = document.createElement('span');

  label.textContent = 'Rendering story…';

  const hint = document.createElement('span');

  hint.textContent = 'Still working. A cold render server or a slow connection can take a few seconds.';
  hint.hidden = true;

  root.append(spinner, label, hint);

  return { root, spinner, label, hint };
}

/** Removes the indicator the canvas shows, or cancels one that hasn't appeared yet. */
export function hideRenderLoadingIndicator(canvasElement: HTMLElement) {
  hideByCanvas.get(canvasElement)?.();
}

// The `min-height` each canvas had before a teardown held its height.
const heldHeightByCanvas = new WeakMap<HTMLElement, string>();

/**
 * Keeps the canvas at its current height after a teardown empties it, until
 * the next Astro render writes its markup or fails, so the page doesn't
 * collapse and regrow while the next render is on its way. A framework story
 * releases it when it starts rendering. A Remount or a Docs story block then keeps the
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

/** Gives the canvas back its own height once the next Astro render writes its markup or fails, or a framework story starts rendering. */
export function releaseCanvasHeight(canvasElement: HTMLElement) {
  const minHeight = heldHeightByCanvas.get(canvasElement);

  if (minHeight === undefined) {
    return;
  }

  canvasElement.style.minHeight = minHeight;
  heldHeightByCanvas.delete(canvasElement);
}
