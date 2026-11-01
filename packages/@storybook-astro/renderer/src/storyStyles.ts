import { STORY_STYLE_ATTRIBUTE } from './types.ts';

const STORY_STYLE = `style[${STORY_STYLE_ATTRIBUTE}]`;

// One head element per distinct CSS text, shared by every canvas that renders
// it. A Docs page renders several stories into one head, each into its own
// canvas, and stories of one component ship the same CSS, so each stylesheet
// goes in once (issue #234). CSS another canvas also uses stays where it is.
// CSS no other canvas uses moves with the render: it goes in before the next
// stylesheet the render shares, or at the end of the head, so the canvas keeps
// its own order. Two canvases that need shared stylesheets in opposite orders
// get the first canvas's order for those. An element leaves when its last
// canvas lets go.
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
 * deleted in an edit stops applying. CSS another canvas already put in the
 * head is shared and stays where it is, so one copy of a global stylesheet
 * doesn't land after a component's CSS and override it, as on an Astro page,
 * which ships each stylesheet once. The rest of the render's CSS, new or held
 * only by this canvas, goes in in render order: before the next stylesheet
 * this render shares, or at the end of the head when it shares none after it,
 * where Astro component CSS went before #189 too, after any CSS the story's
 * modules added on import. A canvas no other canvas shares CSS with gets all
 * of its CSS re-added at the end. Two canvases that need shared stylesheets in
 * opposite orders get the first canvas's order for those.
 */
export function moveStoryStylesToHead(html: string, canvasElement: Element) {
  const document = canvasElement.ownerDocument;
  const template = document.createElement('template');

  template.innerHTML = html;

  const parsedStyles = Array.from(template.content.querySelectorAll<HTMLStyleElement>(STORY_STYLE));
  const parsedTexts = parsedStyles.map((style) => style.textContent ?? '');
  // A stylesheet two modules ship keeps its last place: that copy is the one
  // that wins ties, so the cascade matches the render's.
  const styles = parsedStyles.filter((_style, index) => parsedTexts.lastIndexOf(parsedTexts[index]) === index);
  const cssTexts = styles.map((style) => style.textContent ?? '');
  const previousStyles = stylesByCanvas.get(canvasElement) ?? [];

  parsedStyles.forEach((style) => style.remove());

  // A rerender with the same CSS, such as a Controls change, keeps the
  // elements it has, so the CSS of a Docs page's stories keeps its order.
  const unchanged =
    cssTexts.length === previousStyles.length &&
    cssTexts.every(
      (css, index) =>
        previousStyles[index].element.parentNode === document.head &&
        css === previousStyles[index].element.textContent
    );

  if (unchanged) {
    return template;
  }

  const sharedStyles = sharedStylesFor(document);
  // Find the CSS already in the head before letting go of the old, so CSS this
  // canvas keeps across an edit isn't removed and added back. An element
  // something moved out of the head counts as gone.
  const reusedStyles = cssTexts.map((css) => {
    const shared = sharedStyles.get(css);

    return shared?.element.parentNode === document.head ? shared : undefined;
  });
  const isAnchor = (shared: SharedStyle | undefined) =>
    shared !== undefined && Array.from(shared.canvases).some((canvas) => canvas !== canvasElement);
  let previousElement: HTMLStyleElement | null = null;

  const nextStyles = reusedStyles.map((reused, index) => {
    const shared = reused ?? { element: styles[index], canvases: new Set<Element>() };

    if (!reused) {
      sharedStyles.set(cssTexts[index], shared);
    }

    if (!isAnchor(reused)) {
      // Going in before the next stylesheet this render shares keeps the
      // render's own order, so an edited global.css stays ahead of the
      // button.css that overrides it. If that stylesheet sits ahead of the CSS
      // this render just placed, going right after that CSS keeps the order
      // instead.
      const nextAnchor = reusedStyles.slice(index + 1).find(isAnchor)?.element ?? null;
      const anchorIsBehindPrevious =
        previousElement !== null &&
        nextAnchor !== null &&
        (previousElement.compareDocumentPosition(nextAnchor) & previousElement.DOCUMENT_POSITION_PRECEDING) !== 0;

      const insertBefore = anchorIsBehindPrevious ? (previousElement?.nextSibling ?? null) : nextAnchor;

      if (insertBefore !== shared.element) {
        document.head.insertBefore(shared.element, insertBefore);
      }
    }

    shared.canvases.add(canvasElement);
    previousElement = shared.element;

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
