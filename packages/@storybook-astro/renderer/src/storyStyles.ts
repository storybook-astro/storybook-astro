import { STORY_STYLE_ATTRIBUTE } from './types.ts';

const STORY_STYLE = `style[${STORY_STYLE_ATTRIBUTE}]`;

// The head styles each canvas put there. A Docs page renders several stories
// into one head, each into its own canvas, and each canvas owns its copies.
const stylesByCanvas = new WeakMap<Element, HTMLStyleElement[]>();

/**
 * Parses a render's HTML and moves its component CSS into the document head,
 * so the story's own markup is the canvas's first child (issue #224). Returns
 * the rest of the HTML, parsed, for the caller to write into the page with
 * `template.innerHTML`. Moving the template's nodes instead would turn
 * `<noscript>` content into live elements, since templates parse with
 * scripting off.
 *
 * The styles replace the ones this canvas's last render put there, so CSS
 * deleted in an edit stops applying. They go to the end of the head, where
 * Astro component CSS went before #189 too, after any CSS the story's modules
 * added on import.
 */
export function moveStoryStylesToHead(html: string, canvasElement: Element) {
  const document = canvasElement.ownerDocument;
  const template = document.createElement('template');

  template.innerHTML = html;

  const styles = Array.from(template.content.querySelectorAll<HTMLStyleElement>(STORY_STYLE));

  removeStoryStyles(canvasElement);
  document.head.append(...styles);
  stylesByCanvas.set(canvasElement, styles);

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
