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
 * Head is where Astro component CSS went before #189 too, so a first render's
 * styles go to its end, in cascade order. A rerender puts its styles where the
 * last render's were, so a Controls change on a Docs page doesn't reorder the
 * page's CSS.
 *
 * The styles go in even when the canvas isn't in the page yet, since a caller
 * can attach it after rendering. If it never is, the next render clears them.
 */
export function moveStoryStylesToHead(fragment: DocumentFragment, canvasElement: Element) {
  const styles = Array.from(fragment.querySelectorAll<HTMLStyleElement>(STORY_STYLE));
  const previousStyles = stylesByCanvas.get(canvasElement) ?? [];
  const previousPlace = previousStyles.find((style) => style.isConnected);

  if (previousPlace) {
    previousPlace.before(...styles);
  } else {
    canvasElement.ownerDocument.head.append(...styles);
  }

  previousStyles.forEach((style) => style.remove());
  stylesByCanvas.set(canvasElement, styles);
}

/** Removes the component CSS this canvas put in the head. */
export function removeStoryStyles(canvasElement: Element) {
  stylesByCanvas.get(canvasElement)?.forEach((style) => style.remove());
  stylesByCanvas.delete(canvasElement);
}

// Storybook hides whichever of its two roots isn't showing with `hidden`.
const HIDDEN_STORYBOOK_ROOT = '#storybook-root[hidden], #storybook-docs[hidden]';

/**
 * Clears the canvases that no longer show a story, removing their CSS and
 * markup, as each render starts and when a Docs page has rendered. Those are
 * canvases that have left the page, as when a Docs page closes, and canvases
 * in whichever Storybook root is hidden: the story canvas while a Docs page
 * shows, and a Docs page's canvases while a story shows. The markup goes too,
 * so going back to a story doesn't show the old one unstyled while the next
 * render is on its way.
 *
 * A canvas still on screen keeps its story and CSS until the next render into
 * it replaces both, so moving between stories never shows the old one blank
 * or unstyled during the server round trip.
 */
export function clearHiddenCanvases() {
  stylesByCanvas.forEach((_, canvas) => {
    if (!canvas.isConnected || canvas.closest(HIDDEN_STORYBOOK_ROOT)) {
      removeStoryStyles(canvas);
      canvas.replaceChildren();
    }
  });
}
