// @ts-ignore - Storybook internal modules have complex module resolution
import type {
  Args,
  ComponentAnnotations,
  NamedOrDefaultProjectAnnotations,
  NormalizedProjectAnnotations,
  ProjectAnnotations,
  StoryAnnotationsOrFn,
  WebRenderer,
} from 'storybook/internal/types';
// @ts-ignore - Storybook internal modules have complex module resolution
import {
  composeStory as originalComposeStory,
  composeStories as originalComposeStories,
  setProjectAnnotations as originalSetProjectAnnotations,
} from 'storybook/internal/preview-api';
import { applyDecorators } from '@storybook-astro/renderer/decorators';

// Define the AstroRenderer type to match other frameworks
export interface AstroRenderer extends WebRenderer {
  component: any;
  storyResult: any;
}

// Create a render function for testing that mimics Storybook's render behavior
const render = (args: Args, context?: any) => {
  const Component = context?.component;
  const renderer = context?.parameters?.renderer;
  const id = context?.id || 'test-story';
  
  // Renderers that are known to not work in the current integration
  const brokenRenderers: string[] = [];
  
  // Mimic the renderer detection logic from the main renderer
  if (renderer && brokenRenderers.includes(renderer)) {
    throw new Error(`Renderer '${renderer}' not found. Available renderers: react, vue, svelte, solid, preact`);
  }
  
  // For Astro components and working integrations, return a renderable object
  if (!Component) {
    throw new Error(`Unable to render story ${id} as the component annotation is missing from the default export`);
  }
  
  // Astro components can be identified by isAstroComponentFactory
  if (typeof Component === 'function' && (Component as any).isAstroComponentFactory) {
    // This is an Astro component - return it for server-side rendering
    return Component;
  }
  
  // For framework components that have working integrations
  if (typeof Component === 'function') {
    if (renderer && !brokenRenderers.includes(renderer)) {
      // This would delegate to working framework renderer
      return Component;
    }
    
    // If no renderer specified for function component
    if (!renderer) {
      throw new Error(
        `Component appears to be a framework component but no renderer is specified. ` +
        `Add 'parameters: { renderer: "framework-name" }' to your story configuration.`
      );
    }
  }
  
  // Return a basic representation for testing
  return {
    component: Component,
    args: args,
    renderer: renderer || 'astro'
  };
};

/**
 * Function that sets the globalConfig of your storybook. The global config is the preview module of
 * your .storybook folder.
 *
 * It should be run a single time, so that your global config (e.g. decorators) is applied to your
 * stories when using `composeStories` or `composeStory`.
 *
 * Example:
 *
 * ```jsx
 * // setup-file.js
 * import { setProjectAnnotations } from '@storybook-astro/framework';
 * import projectAnnotations from './.storybook/preview';
 *
 * setProjectAnnotations(projectAnnotations);
 * ```
 *
 * @param projectAnnotations - E.g. (import projectAnnotations from '../.storybook/preview')
 */
export function setProjectAnnotations<R extends AstroRenderer = AstroRenderer>(
  projectAnnotations:
    | NamedOrDefaultProjectAnnotations<R>
    | NamedOrDefaultProjectAnnotations<R>[]
): NormalizedProjectAnnotations<R> {
  return originalSetProjectAnnotations<R>(projectAnnotations);
}

/**
 * Function that will receive a story along with meta (e.g. a default export from a .stories file)
 * and optionally projectAnnotations e.g. (import * as projectAnnotations from '../.storybook/preview')
 * and will return a composed component that has all args/parameters/decorators/etc combined and applied to it.
 *
 * It's very useful for reusing a story in scenarios outside of Storybook like unit testing.
 *
 * Example:
 * ```jsx
 * import { render } from '@testing-library/react';
 * import { composeStory } from '@storybook-astro/framework';
 * import meta, { Primary as PrimaryStory } from './Button.stories';
 *
 * const Primary = composeStory(PrimaryStory, meta);
 *
 * test('renders primary button', () => {
 *   const { getByRole } = render(<Primary>Hello world</Primary>);
 *   expect(getByRole('button')).toBeInTheDocument();
 * });
 * ```
 *
 * @param story - E.g. (import { Primary } from './Button.stories')
 * @param componentAnnotations - E.g. (import meta from './Button.stories')
 * @param projectAnnotations - E.g. (import * as projectAnnotations from '../.storybook/preview') this can be applied automatically if you use `setProjectAnnotations` in your setup files.
 * @param exportsName - In case your story does not contain a name and you want it to have a name.
 */
export function composeStory<TArgs extends Args = Args, R extends AstroRenderer = AstroRenderer>(
  story: StoryAnnotationsOrFn<R, TArgs>,
  componentAnnotations: ComponentAnnotations<R, TArgs>,
  projectAnnotations?: ProjectAnnotations<R>,
  exportsName?: string
) {
  // Merge in the Astro-aware `render` and `applyDecorators` (the renderer's
  // decorator composition, Decorator Support Step 5) — a project's own
  // annotations still win when it supplies either.
  const mergedProjectAnnotations: any = projectAnnotations ? {
    ...projectAnnotations,
    render: projectAnnotations.render || render,
    applyDecorators: projectAnnotations.applyDecorators || applyDecorators
  } : {
    render,
    applyDecorators
  };

  return originalComposeStory<AstroRenderer, TArgs>(
    story as any,
    componentAnnotations as any,
    mergedProjectAnnotations as any,
    exportsName as any
  );
}

/**
 * Function that will receive a stories import (e.g. `import * as stories from './Button.stories'`)
 * and optionally a globalConfig (e.g. `import * from '../.storybook/preview`)
 * and will return an object containing all the stories passed, but now as a composed component that has all args/parameters/decorators/etc combined and applied to it.
 *
 * It's very useful for reusing stories in scenarios outside of Storybook like unit testing.
 *
 * Example:
 * ```jsx
 * import { render } from '@testing-library/react';
 * import { composeStories } from '@storybook-astro/framework';
 * import * as stories from './Button.stories';
 *
 * const { Primary, Secondary } = composeStories(stories);
 *
 * test('renders primary button', () => {
 *   const { getByRole } = render(<Primary>Hello world</Primary>);
 *   expect(getByRole('button')).toBeInTheDocument();
 * });
 * ```
 *
 * @param storiesImport - E.g. (import * as stories from './Button.stories')
 * @param projectAnnotations - E.g. (import * as globalConfig from '../.storybook/preview') this can be applied automatically if you use `setProjectAnnotations` in your setup files.
 */
export function composeStories<TModule extends Record<string, any>, R extends AstroRenderer = AstroRenderer>(
  storiesImport: TModule,
  projectAnnotations?: ProjectAnnotations<R>
): { [K in keyof Omit<TModule, 'default'>]: any } {
  // Merge in the Astro-aware `render` and `applyDecorators` (the renderer's
  // decorator composition, Decorator Support Step 5) — a project's own
  // annotations still win when it supplies either.
  const mergedProjectAnnotations: any = projectAnnotations ? {
    ...projectAnnotations,
    render: projectAnnotations.render || render,
    applyDecorators: projectAnnotations.applyDecorators || applyDecorators
  } : {
    render,
    applyDecorators
  };

  return originalComposeStories(storiesImport as any, mergedProjectAnnotations as any) as { [K in keyof Omit<TModule, 'default'>]: any };
}
