import type { RenderComponentInput, RenderResponseMessage } from '@storybook-astro/renderer/types';

const PRERENDERED_STORIES_FILE = 'astro-prerendered-stories.json';

let prerenderedStoriesPromise: Promise<Record<string, string>> | undefined;

export async function render(data: RenderComponentInput) {
  // eslint-disable-next-line n/no-unsupported-features/node-builtins
  const id = crypto.randomUUID();
  const storyId = data.story?.id;

  if (!storyId) {
    throw new Error(
      'Astro static renderer expected a story id, but none was provided in the render payload.'
    );
  }

  const prerenderedStories = await loadPrerenderedStories();
  const html = prerenderedStories[storyId];

  if (html === undefined) {
    throw new Error(
      `No prerendered HTML was found for story "${storyId}". Rebuild Storybook static output.`
    );
  }

  return {
    id,
    html
  } satisfies RenderResponseMessage['data'];
}

export function init() {
  return;
}

export function applyStyles() {
  return;
}

async function loadPrerenderedStories() {
  if (!prerenderedStoriesPromise) {
    const jsonPath = resolvePrerenderedStoriesUrl();

    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    prerenderedStoriesPromise = fetch(jsonPath).then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `Failed to load ${PRERENDERED_STORIES_FILE}. Received ${response.status} ${response.statusText}.`
        );
      }

      return (await response.json()) as Record<string, string>;
    });
  }

  return prerenderedStoriesPromise;
}

function resolvePrerenderedStoriesUrl() {
  return new URL(PRERENDERED_STORIES_FILE, window.location.href).toString();
}
