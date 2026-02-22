import {
  composeStories as portableComposeStories,
  composeStory as portableComposeStory,
  setProjectAnnotations as portableSetProjectAnnotations,
} from '../portable-stories.ts';
import type { ComposedStory, StoryMeta } from './types.ts';

export function composeStories<TModule extends Record<string, any>>(
  storiesImport: TModule,
  projectAnnotations?: any
) {
  const composed = portableComposeStories(storiesImport, projectAnnotations);

  for (const [storyExportName, story] of Object.entries(composed)) {
    if (typeof story === 'function') {
      (story as ComposedStory).__storybookAstroMeta = storiesImport.default as StoryMeta;
      (story as ComposedStory).__storybookAstroStoryExport = storiesImport[storyExportName] as {
        args?: Record<string, unknown>;
      };
    }
  }

  return composed;
}

export const composeStory = portableComposeStory;
export const setProjectAnnotations = portableSetProjectAnnotations;
