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
  const styles = Array.from(fragment.querySelectorAll<HTMLStyleElement>(STORY_STYLE));

  removeStoryStyles(canvasElement);
  canvasElement.ownerDocument.head.append(...styles);
  stylesByCanvas.set(canvasElement, styles);
}

/** Removes the component CSS this canvas put in the head. */
export function removeStoryStyles(canvasElement: Element) {
  stylesByCanvas.get(canvasElement)?.forEach((style) => style.remove());
  stylesByCanvas.delete(canvasElement);
}

// The latest render into each canvas, so a teardown can tell whether a newer
// render has taken the canvas over.
const latestRenderByCanvas = new WeakMap<Element, object>();

// Canvases whose story Storybook removed, still showing it.
const removedStoryCanvases = new Set<Element>();

/**
 * Records that a render into this canvas has started, and returns the
 * teardown for it.
 *
 * Storybook calls the teardown when it removes the story: on navigation, on a
 * remount, and for each story on a Docs page when the page goes. The next
 * render often lands in the same canvas a server round trip later, and
 * clearing the canvas right away would leave it blank until then. So the
 * teardown only marks the canvas, and the next render settles it: a render
 * into the same canvas replaces the markup and CSS together, and a render
 * into any other canvas clears the marked ones, as when you move between a
 * story and a Docs page. A page that renders no story keeps the last one's CSS
 * until the next render.
 */
export function startCanvasRender(canvasElement: Element) {
  const render = {};

  latestRenderByCanvas.set(canvasElement, render);
  removedStoryCanvases.delete(canvasElement);
  removedStoryCanvases.forEach((canvas) => {
    removeStoryStyles(canvas);
    canvas.innerHTML = '';
  });
  removedStoryCanvases.clear();

  return () => {
    // A late teardown mustn't touch the render that has replaced this one.
    if (latestRenderByCanvas.get(canvasElement) === render) {
      removedStoryCanvases.add(canvasElement);
    }
  };
}
