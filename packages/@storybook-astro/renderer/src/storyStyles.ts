import { STORY_STYLE_ATTRIBUTE } from './types.ts';

const STORY_STYLE = `style[${STORY_STYLE_ATTRIBUTE}]`;

// The head styles each canvas put there. A Docs page renders several stories
// into one head, each into its own canvas, and each canvas owns its copies.
const stylesByCanvas = new Map<Element, HTMLStyleElement[]>();

// Canvases seen in the page. Only those can have left it: a caller can render
// into a canvas before attaching it.
const attachedCanvases = new WeakSet<Element>();

/**
 * Parses a render's HTML and moves its component CSS into the document head,
 * so the story's own markup is the canvas's first child (issue #224). Returns
 * the rest of the HTML, parsed, for the caller to write into the page with
 * `template.innerHTML`. Moving the template's nodes instead would turn
 * `<noscript>` content into live elements, since templates parse with
 * scripting off.
 *
 * The styles replace the ones this canvas's last render put there, so CSS
 * deleted in an edit stops applying. Head is where Astro component CSS went
 * before #189 too. A first render's styles go to its end, in cascade order,
 * and a rerender's go where the last render's were, so a Controls change on a
 * Docs page doesn't reorder the page's CSS.
 */
export function moveStoryStylesToHead(html: string, canvasElement: Element) {
  const document = canvasElement.ownerDocument;
  const template = document.createElement('template');

  template.innerHTML = html;

  const styles = Array.from(template.content.querySelectorAll<HTMLStyleElement>(STORY_STYLE));
  const previousStyles = stylesByCanvas.get(canvasElement) ?? [];
  const previousPlace = previousStyles.find((style) => style.isConnected);

  if (previousPlace) {
    previousPlace.before(...styles);
  } else {
    document.head.append(...styles);
  }

  previousStyles.forEach((style) => style.remove());
  stylesByCanvas.set(canvasElement, styles);

  if (canvasElement.isConnected) {
    attachedCanvases.add(canvasElement);
  }

  return template;
}

/**
 * Adds a stylesheet to the head ahead of the story CSS, so the story CSS wins
 * ties at equal specificity however the page was reached.
 */
export function addStylesheetBeforeStoryStyles(stylesheet: Element, document: Document) {
  document.head.insertBefore(stylesheet, document.head.querySelector(STORY_STYLE));
}

/** Removes the component CSS this canvas put in the head. */
export function removeStoryStyles(canvasElement: Element) {
  stylesByCanvas.get(canvasElement)?.forEach((style) => style.remove());
  stylesByCanvas.delete(canvasElement);
}

// Storybook hides whichever of its two roots isn't showing with `hidden`.
const HIDDEN_STORYBOOK_ROOT = '#storybook-root[hidden], #storybook-docs[hidden]';

/**
 * Clears the canvases that no longer show a story, as each render starts and
 * when a Docs page has rendered:
 *
 * - Canvases in whichever Storybook root is hidden: the story canvas while a
 *   Docs page shows, and a Docs page's canvases while a story shows. Their
 *   markup goes too, so going back to a story doesn't show the old one
 *   unstyled while the next render is on its way.
 * - Canvases that have left the page, as when a Docs page closes, lose their
 *   CSS. A canvas that has never been in the page is left alone, since its
 *   caller may still attach it.
 *
 * A canvas still on screen keeps its story and CSS until the next render into
 * it replaces both, so moving between stories never shows the old one blank
 * or unstyled during the server round trip.
 */
export function clearHiddenCanvases() {
  stylesByCanvas.forEach((_, canvas) => {
    if (canvas.isConnected) {
      attachedCanvases.add(canvas);

      if (canvas.closest(HIDDEN_STORYBOOK_ROOT)) {
        removeStoryStyles(canvas);
        canvas.replaceChildren();
      }
    } else if (attachedCanvases.has(canvas)) {
      removeStoryStyles(canvas);
    }
  });
}
