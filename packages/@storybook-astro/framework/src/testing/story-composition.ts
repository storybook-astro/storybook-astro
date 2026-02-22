import {
  composeStories as portableComposeStories,
  composeStory as portableComposeStory,
  setProjectAnnotations as portableSetProjectAnnotations,
} from '../portable-stories.ts';
import type { ProjectAnnotations, Store_CSFExports as StoreCsfExports } from 'storybook/internal/types';
import type { AstroRenderer } from '../portable-stories.ts';
import type { ComposedStory, StoryMeta } from './types.ts';

export function composeStories<
  TModule extends StoreCsfExports<AstroRenderer> & Record<string, unknown>
>(
  storiesImport: TModule,
  projectAnnotations?: ProjectAnnotations<AstroRenderer>
) {
  const composed = portableComposeStories(storiesImport, projectAnnotations);

  for (const [storyExportName, story] of Object.entries(composed)) {
    if (typeof story === 'function') {
      const composedStory = story as ComposedStory;

      composedStory.__storybookAstroMeta = storiesImport.default as StoryMeta;
      composedStory.__storybookAstroStoryExport = storiesImport[
        storyExportName as keyof TModule
      ] as ComposedStory['__storybookAstroStoryExport'];
    }
  }

  return composed;
}

export const composeStory = portableComposeStory;
export const setProjectAnnotations = portableSetProjectAnnotations;
