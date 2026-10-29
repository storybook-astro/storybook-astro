// The `<style>` elements the render handler puts ahead of a story's markup,
// one per component `<style>` block.
const STORY_STYLE = 'style[data-storybook-astro-styles]';

// The head styles each canvas put there. A Docs page renders several stories
// into one head, each into its own canvas, and each canvas owns its copies.
const stylesByCanvas = new WeakMap<Element, HTMLStyleElement[]>();

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
  const nextStyles = Array.from(fragment.querySelectorAll<HTMLStyleElement>(STORY_STYLE));
  const previousStyles = stylesByCanvas.get(canvasElement) ?? [];

  nextStyles.forEach((style) => style.remove());

  // A rerender with the same CSS, such as a controls change, keeps the
  // elements it has, so the browser doesn't restyle the page for nothing.
  const unchanged =
    nextStyles.length === previousStyles.length &&
    nextStyles.every(
      (style, index) =>
        previousStyles[index].isConnected && style.textContent === previousStyles[index].textContent
    );

  if (unchanged) {
    return;
  }

  previousStyles.forEach((style) => style.remove());
  canvasElement.ownerDocument.head.append(...nextStyles);
  stylesByCanvas.set(canvasElement, nextStyles);
}

/** Removes the component CSS this canvas put in the head, when Storybook tears its story down. */
export function removeStoryStyles(canvasElement: Element) {
  stylesByCanvas.get(canvasElement)?.forEach((style) => style.remove());
  stylesByCanvas.delete(canvasElement);
}
