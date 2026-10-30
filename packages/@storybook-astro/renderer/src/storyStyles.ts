import { STORY_STYLE_ATTRIBUTE } from './types.ts';

const STORY_STYLE = `style[${STORY_STYLE_ATTRIBUTE}]`;

// The head styles each canvas put there. A Docs page renders several stories
// into one head, each into its own canvas, and each canvas owns its copies.
const stylesByCanvas = new Map<Element, HTMLStyleElement[]>();

/**
 * Moves a render's component CSS out of its HTML and into the document head,
 * so the story's own markup is the canvas's first child (issue #224). The
 * styles replace the ones this canvas's last render put there, so CSS deleted
 * in an edit stops applying.
 *
 * Head is where Astro component CSS went before #189 too, so new styles go to
 * its end, in cascade order.
 */
export function moveStoryStylesToHead(fragment: DocumentFragment, canvasElement: Element) {
  const styles = Array.from(fragment.querySelectorAll<HTMLStyleElement>(STORY_STYLE));

  styles.forEach((style) => style.remove());
  removeStoryStyles(canvasElement);

  // A canvas can leave the page without a teardown, as when a Docs story's
  // rerender fails and Storybook replaces it with the error. Its CSS has
  // nothing left to style.
  if (!canvasElement.isConnected) {
    return;
  }

  canvasElement.ownerDocument.head.append(...styles);
  stylesByCanvas.set(canvasElement, styles);
}

/** Removes the component CSS this canvas put in the head. */
export function removeStoryStyles(canvasElement: Element) {
  stylesByCanvas.get(canvasElement)?.forEach((style) => style.remove());
  stylesByCanvas.delete(canvasElement);
}

/**
 * Clears the canvases that no longer show a story, as each render starts and
 * when a Docs page has rendered: canvases that have left the page, as when a
 * Docs page closes, and, on a Docs page, the story canvas it hides. The hidden
 * canvas loses its markup too, so going back to the story doesn't show it
 * unstyled while the next render is on its way.
 *
 * A canvas still on screen keeps its story and CSS until the next render into
 * it replaces both, so moving between stories never shows the old one blank
 * or unstyled during the server round trip.
 */
export function removeHiddenStoryStyles(viewMode: string | undefined) {
  stylesByCanvas.forEach((_, canvas) => {
    const hiddenByDocs = viewMode === 'docs' && !canvas.closest('#storybook-docs');

    if (!canvas.isConnected || hiddenByDocs) {
      removeStoryStyles(canvas);
      canvas.replaceChildren();
    }
  });
}
