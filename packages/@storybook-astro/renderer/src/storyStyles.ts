import { STORY_STYLE_ATTRIBUTE } from './types.ts';

const STORY_STYLE = `style[${STORY_STYLE_ATTRIBUTE}]`;

// One head element per CSS text, shared by every canvas that ships it (issue #234).
// Where each render's CSS goes is described on moveStoryStylesToHead.
type StoryStyle = { element: HTMLStyleElement; canvases: Set<Element> };

const stylesByDocument = new WeakMap<Document, Map<string, StoryStyle>>();
const stylesByCanvas = new WeakMap<Element, StoryStyle[]>();

/**
 * Parses a render's HTML and moves its component CSS into the document head,
 * so the story's own markup is the canvas's first child (issue #224). Returns
 * the rest of the HTML, parsed, for the caller to write into the page with
 * `template.innerHTML`. Moving the template's nodes instead would turn
 * `<noscript>` content into live elements, since templates parse with
 * scripting off.
 *
 * The styles replace the ones this canvas's last render put there, so CSS
 * deleted in an edit stops applying. Canvases that ship the same CSS share one
 * element. CSS another canvas also holds stays where it is, so one copy of a
 * global stylesheet doesn't land after a component's CSS and override it, as
 * on an Astro page, which ships each stylesheet once. Two canvases that need
 * shared stylesheets in opposite orders get the first canvas's order for those.
 *
 * The rest of the render's CSS, new or held only by this canvas, goes in in
 * render order, before the earliest stylesheet in the head that this render
 * shares later on and that sits after the CSS the render placed so far. If
 * every such stylesheet sits ahead of that CSS, it goes right after it. If the
 * render shares nothing later on, it goes at the end of the head, where Astro
 * component CSS went before #189 too, after any CSS the story's modules added
 * on import.
 */
export function moveStoryStylesToHead(html: string, canvasElement: Element) {
  const document = canvasElement.ownerDocument;
  const template = document.createElement('template');

  template.innerHTML = html;

  const parsedStyles = Array.from(template.content.querySelectorAll<HTMLStyleElement>(STORY_STYLE));
  const parsedTexts = parsedStyles.map((style) => style.textContent ?? '');
  // Identical CSS a render ships twice (two modules compiling to the same
  // text) goes in once, at its last place, so it still wins ties as the
  // render's last copy did.
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

  const storyStyles = storyStylesFor(document);
  // Look up the CSS already in the head before letting go of the old, so this
  // canvas reuses elements instead of adding copies. An element something
  // moved out of the head counts as gone.
  const reusedStyles = cssTexts.map((css) => {
    const storyStyle = storyStyles.get(css);

    return storyStyle?.element.parentNode === document.head ? storyStyle : undefined;
  });
  const isSharedWithAnotherCanvas = (
    storyStyle: StoryStyle | undefined
  ): storyStyle is StoryStyle =>
    storyStyle !== undefined &&
    Array.from(storyStyle.canvases).some((canvas) => canvas !== canvasElement);
  // This render's element that sits furthest down the head so far.
  let lastPlacedElement: HTMLStyleElement | null = null;

  const nextStyles = reusedStyles.map((reused, index) => {
    const storyStyle = reused ?? { element: styles[index], canvases: new Set<Element>() };

    if (!reused) {
      storyStyles.set(cssTexts[index], storyStyle);
    }

    if (!isSharedWithAnotherCanvas(reused)) {
      // See moveStoryStylesToHead's JSDoc for this placement rule.
      const laterSharedElements = reusedStyles
        .slice(index + 1)
        .filter(isSharedWithAnotherCanvas)
        .map((laterStyle) => laterStyle.element);
      const placedSoFar = lastPlacedElement;
      const laterSharedElement =
        laterSharedElements
          .filter((element) => placedSoFar === null || isAheadOf(placedSoFar, element))
          .sort((element, other) => (isAheadOf(element, other) ? -1 : 1))[0] ?? null;
      let insertBefore: Node | null = laterSharedElement;

      if (laterSharedElement === null && laterSharedElements.length > 0 && placedSoFar !== null) {
        insertBefore = placedSoFar.nextSibling;
      }

      if (insertBefore !== storyStyle.element) {
        document.head.insertBefore(storyStyle.element, insertBefore);
      }
    }

    storyStyle.canvases.add(canvasElement);

    if (lastPlacedElement === null || isAheadOf(lastPlacedElement, storyStyle.element)) {
      lastPlacedElement = storyStyle.element;
    }

    return storyStyle;
  });

  releaseStyles(canvasElement, previousStyles.filter((storyStyle) => !nextStyles.includes(storyStyle)));
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

function releaseStyles(canvasElement: Element, styles: StoryStyle[]) {
  const storyStyles = storyStylesFor(canvasElement.ownerDocument);

  for (const storyStyle of styles) {
    storyStyle.canvases.delete(canvasElement);

    if (storyStyle.canvases.size === 0) {
      storyStyle.element.remove();

      if (storyStyles.get(storyStyle.element.textContent ?? '') === storyStyle) {
        storyStyles.delete(storyStyle.element.textContent ?? '');
      }
    }
  }
}

/** Whether `node` comes before `other` in the document. */
function isAheadOf(node: Node, other: Node) {
  return (node.compareDocumentPosition(other) & node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

function storyStylesFor(document: Document) {
  let storyStyles = stylesByDocument.get(document);

  if (!storyStyles) {
    storyStyles = new Map();
    stylesByDocument.set(document, storyStyles);
  }

  return storyStyles;
}
