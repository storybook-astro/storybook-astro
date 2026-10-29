// The `<style>` elements the render handler puts ahead of a story's markup,
// one per component `<style>` block.
const STORY_STYLE = 'style[data-storybook-astro-styles]';

/**
 * Moves a render's component CSS out of its HTML and into the iframe head, so
 * the story's own markup is the canvas's first child (issue #224).
 *
 * The styles go to the end of the head in cascade order, after Storybook's and
 * the project's global CSS, where they were when they sat in the canvas. A
 * block already in the head is moved rather than added again. In the Canvas,
 * blocks this render didn't ship are dropped. On a Docs page every story
 * shares the head, so blocks are only added.
 */
export function moveStoryStylesToHead(fragment: DocumentFragment, document: Document, viewMode?: string) {
  const headStyles = Array.from(document.head.querySelectorAll<HTMLStyleElement>(STORY_STYLE));
  const keptStyles = new Set<HTMLStyleElement>();

  fragment.querySelectorAll<HTMLStyleElement>(STORY_STYLE).forEach((style) => {
    const headStyle = headStyles.find(
      (candidate) => !keptStyles.has(candidate) && candidate.textContent === style.textContent
    );

    if (headStyle) {
      style.remove();
    }

    keptStyles.add(headStyle ?? style);
    document.head.appendChild(headStyle ?? style);
  });

  if (viewMode === 'docs') {
    return;
  }

  headStyles.filter((style) => !keptStyles.has(style)).forEach((style) => style.remove());
}

/** Drops the last Astro story's component CSS, for a story that isn't rendered by Astro. */
export function removeStoryStyles(document: Document) {
  document.head.querySelectorAll(STORY_STYLE).forEach((style) => style.remove());
}
