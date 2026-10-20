// Server-mode renders go over HTTP and can take seconds (a cold render server
// boots a full Vite SSR runtime). Without feedback the canvas either keeps
// showing the previous story or sits frozen while Controls changes are in
// flight. This indicator waits a short grace period so fast renders (dev HMR,
// warm servers) never flash a spinner, then either replaces the stale story
// (story switch) or overlays the current one (same-story re-render).

const SHOW_DELAY_MS = 200;
const SLOW_HINT_DELAY_MS = 5000;

const SPINNER_STYLES = `
@keyframes storybook-astro-spin {
  to { transform: rotate(360deg); }
}
.storybook-astro-loading-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(128, 128, 128, 0.3);
  border-top-color: rgba(128, 128, 128, 0.9);
  border-radius: 50%;
  animation: storybook-astro-spin 0.8s linear infinite;
}
@media (prefers-reduced-motion: reduce) {
  .storybook-astro-loading-spinner {
    animation: none;
    border-top-color: rgba(128, 128, 128, 0.3);
  }
}
`;

export type RenderLoadingIndicatorOptions = {
  /** Replace the canvas content (story switch) instead of overlaying it (same-story re-render). */
  replaceContent: boolean;
};

/**
 * Schedules a loading indicator on the story canvas and returns a cleanup
 * function. Call the cleanup once the render settles (success or failure) —
 * it cancels a not-yet-shown indicator, removes an overlay, and restores any
 * mutated inline styles. Replaced content is left for the caller to overwrite
 * with the rendered HTML.
 */
export function scheduleRenderLoadingIndicator(
  canvasElement: HTMLElement,
  options: RenderLoadingIndicatorOptions
): () => void {
  const documentRef = canvasElement.ownerDocument;
  let overlayElement: HTMLElement | undefined;
  let previousInlinePosition: string | undefined;
  let slowHintTimer: ReturnType<typeof setTimeout> | undefined;

  const showTimer = setTimeout(() => {
    const indicator = createIndicatorElement(documentRef);

    if (options.replaceContent) {
      canvasElement.innerHTML = '';
      canvasElement.appendChild(indicator.root);
    } else {
      // Overlay needs a positioned ancestor; remember what we change so the
      // cleanup can put it back.
      const computedPosition = getComputedStyle(canvasElement).position;

      if (computedPosition === 'static' || computedPosition === '') {
        previousInlinePosition = canvasElement.style.position;
        canvasElement.style.position = 'relative';
      }

      indicator.root.style.position = 'absolute';
      indicator.root.style.inset = '0';
      indicator.root.style.background = 'rgba(128, 128, 128, 0.12)';
      overlayElement = indicator.root;
      canvasElement.appendChild(indicator.root);
    }

    slowHintTimer = setTimeout(() => {
      indicator.hint.hidden = false;
    }, SLOW_HINT_DELAY_MS - SHOW_DELAY_MS);
  }, SHOW_DELAY_MS);

  return () => {
    clearTimeout(showTimer);
    clearTimeout(slowHintTimer);
    overlayElement?.remove();

    if (previousInlinePosition !== undefined) {
      canvasElement.style.position = previousInlinePosition;
    }
  };
}

function createIndicatorElement(documentRef: Document) {
  const root = documentRef.createElement('div');

  root.className = 'storybook-astro-loading';
  root.setAttribute('role', 'status');
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.alignItems = 'center';
  root.style.justifyContent = 'center';
  root.style.gap = '12px';
  root.style.minHeight = '120px';
  root.style.fontFamily =
    '"Nunito Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';
  root.style.fontSize = '13px';
  root.style.color = 'rgba(128, 128, 128, 0.95)';

  const styles = documentRef.createElement('style');

  styles.textContent = SPINNER_STYLES;

  const spinner = documentRef.createElement('div');

  spinner.className = 'storybook-astro-loading-spinner';

  const label = documentRef.createElement('span');

  label.textContent = 'Rendering story…';

  const hint = documentRef.createElement('span');

  hint.textContent = 'Still working — the render server may be starting up.';
  hint.hidden = true;

  root.append(styles, spinner, label, hint);

  return { root, hint };
}
