import { STORY_STYLE_ATTRIBUTE } from './types.ts';

const STORY_STYLE = `style[${STORY_STYLE_ATTRIBUTE}]`;

// One head element per distinct CSS text, shared by every canvas that renders
// it. A Docs page renders several stories into one head, each into its own
// canvas, and stories of one component ship the same CSS, so each stylesheet
// goes in once (issue #234). A shared element stays where it is, and new CSS
// goes in before the next stylesheet the render shares, so each canvas keeps
// its own order. Two canvases that need shared stylesheets in opposite orders
// get the first canvas's order. An element leaves when its last canvas lets go.
type SharedStyle = { element: HTMLStyleElement; canvases: Set<Element> };

const sharedStylesByDocument = new WeakMap<Document, Map<string, SharedStyle>>();
const stylesByCanvas = new WeakMap<Element, SharedStyle[]>();

/**
 * Parses a render's HTML and moves its component CSS into the document head,
 * so the story's own markup is the canvas's first child (issue #224). Returns
 * the rest of the HTML, parsed, for the caller to write into the page with
 * `template.innerHTML`. Moving the template's nodes instead would turn
 * `<noscript>` content into live elements, since templates parse with
 * scripting off.
 *
 * The styles replace the ones this canvas's last render put there, so CSS
 * deleted in an edit stops applying. CSS already in the head, from another
 * canvas or this canvas's last render, is shared and stays where it is, so one
 * copy of a global stylesheet doesn't land after a component's CSS and
 * override it, as on an Astro page, which ships each stylesheet once. New CSS
 * goes in before the next stylesheet this render shares, so the render's own
 * order holds, or at the end of the head when it shares none after it, where
 * Astro component CSS went before #189 too, after any CSS the story's modules
 * added on import. Two canvases that need shared stylesheets in opposite
 * orders get the first canvas's order.
 */
export function moveStoryStylesToHead(html: string, canvasElement: Element) {
  const document = canvasElement.ownerDocument;
  const template = document.createElement('template');

  template.innerHTML = html;

  const styles = Array.from(template.content.querySelectorAll<HTMLStyleElement>(STORY_STYLE));
  const cssTexts = [...new Set(styles.map((style) => style.textContent ?? ''))];
  const previousStyles = stylesByCanvas.get(canvasElement) ?? [];

  styles.forEach((style) => style.remove());

  // A rerender with the same CSS, such as a Controls change, keeps the
  // elements it has, so the CSS of a Docs page's stories keeps its order.
  const unchanged =
    cssTexts.length === previousStyles.length &&
    cssTexts.every(
      (css, index) =>
        previousStyles[index].element.isConnected && css === previousStyles[index].element.textContent
    );

  if (unchanged) {
    return template;
  }

  const sharedStyles = sharedStylesFor(document);
  // Find the CSS another canvas, or this canvas's last render, already put in
  // the head before letting go of the old, so CSS this canvas keeps across an
  // edit isn't removed and added back.
  const reusedStyles = cssTexts.map((css) => {
    const shared = sharedStyles.get(css);

    return shared?.element.isConnected ? shared : undefined;
  });
  const nextStyles = cssTexts.map((css, index) => {
    let shared = reusedStyles[index];

    if (!shared) {
      const element = document.createElement('style');
      // Going in before the next stylesheet this render shares keeps the
      // render's own order, so an edited global.css stays ahead of the
      // button.css that overrides it. With nothing shared after it, it goes
      // at the end of the head.
      const nextReusedStyle = reusedStyles.slice(index + 1).find((reused) => reused !== undefined);

      element.setAttribute(STORY_STYLE_ATTRIBUTE, '');
      element.textContent = css;
      document.head.insertBefore(element, nextReusedStyle?.element ?? null);
      shared = { element, canvases: new Set() };
      sharedStyles.set(css, shared);
    }

    shared.canvases.add(canvasElement);

    return shared;
  });

  releaseStyles(canvasElement, previousStyles.filter((shared) => !nextStyles.includes(shared)));
  stylesByCanvas.set(canvasElement, nextStyles);

  return template;
}

/**
 * Adds a stylesheet to the head ahead of the story CSS, so the story CSS wins
 * ties at equal specificity however the page was reached.
 */
export function addStylesheetBeforeStoryStyles(stylesheet: Element, document: Document) {
  document.head.insertBefore(stylesheet, document.head.querySelector(STORY_STYLE));
}

/** Removes the component CSS this canvas put in the head, unless another canvas still uses it. */
export function removeStoryStyles(canvasElement: Element) {
  releaseStyles(canvasElement, stylesByCanvas.get(canvasElement) ?? []);
  stylesByCanvas.delete(canvasElement);
}

function releaseStyles(canvasElement: Element, styles: SharedStyle[]) {
  const sharedStyles = sharedStylesFor(canvasElement.ownerDocument);

  for (const shared of styles) {
    shared.canvases.delete(canvasElement);

    if (shared.canvases.size === 0) {
      shared.element.remove();

      if (sharedStyles.get(shared.element.textContent ?? '') === shared) {
        sharedStyles.delete(shared.element.textContent ?? '');
      }
    }
  }
}

function sharedStylesFor(document: Document) {
  let sharedStyles = sharedStylesByDocument.get(document);

  if (!sharedStyles) {
    sharedStyles = new Map();
    sharedStylesByDocument.set(document, sharedStyles);
  }

  return sharedStyles;
}
