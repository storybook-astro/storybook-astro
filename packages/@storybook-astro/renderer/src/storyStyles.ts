import { FONT_STYLE_ATTRIBUTE, STORY_STYLE_ATTRIBUTE } from './types.ts';

const STORY_STYLE = `style[${STORY_STYLE_ATTRIBUTE}]`;
const FONT_STYLE = `style[${FONT_STYLE_ATTRIBUTE}]`;

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
 * deleted in an edit stops applying. New CSS goes to the end of the head, where
 * Astro component CSS went before #189 too, after any CSS the story's modules
 * added on import.
 */
export function moveStoryStylesToHead(html: string, canvasElement: Element) {
  const document = canvasElement.ownerDocument;
  const template = document.createElement('template');

  template.innerHTML = html;
  moveFontStylesToHead(template, document);

  const styles = Array.from(template.content.querySelectorAll<HTMLStyleElement>(STORY_STYLE));
  const previousStyles = stylesByCanvas.get(canvasElement) ?? [];

  // A rerender with the same CSS, such as a Controls change, keeps the
  // elements it has, so the CSS of a Docs page's stories keeps its order.
  const unchanged =
    styles.length === previousStyles.length &&
    styles.every(
      (style, index) =>
        previousStyles[index].isConnected && style.textContent === previousStyles[index].textContent
    );

  if (unchanged) {
    styles.forEach((style) => style.remove());

    return template;
  }

  removeStoryStyles(canvasElement);
  document.head.append(...styles);
  stylesByCanvas.set(canvasElement, styles);

  return template;
}

/**
 * Dev mode's `@font-face` CSS is the same for every story, so one copy stays
 * in the head for the session. Removing and re-adding it with each story
 * could flash the fallback font.
 */
function moveFontStylesToHead(template: HTMLTemplateElement, document: Document) {
  const fontStyle = template.content.querySelector(FONT_STYLE);

  if (!fontStyle) {
    return;
  }

  const currentFontStyle = document.head.querySelector(FONT_STYLE);

  if (currentFontStyle?.textContent === fontStyle.textContent) {
    fontStyle.remove();

    return;
  }

  currentFontStyle?.remove();
  addStylesheetBeforeStoryStyles(fontStyle, document);
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
