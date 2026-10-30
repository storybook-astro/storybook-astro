import {
  isAstroComponentFactory,
  isAstroComponentMarker,
  isAstroComponentSlot
} from '@storybook-astro/renderer/types';
import type { HandlerProps } from '../astroRenderHandler.ts';
import { processImageMetadata } from '../astroRenderHandler.ts';
import { MAX_DEPTH, reconstructProps } from '../lib/reconstruct-component-args.ts';
import { reviveDateStrings } from '../lib/revive-dates.ts';
import {
  resolveSanitizationOptions,
  sanitizeArgs,
  sanitizeRenderPayload,
  type SanitizationOptions
} from '../lib/sanitization.ts';

/**
 * What a render page hands to `StoryNode.astro`: HTML, a list of nodes, or a
 * component with its props and named slots. Astro renders the whole tree in
 * one page, so it attaches the styles and island scripts the way a real page
 * gets them.
 */
export type StoryTree = string | StoryTree[] | StoryTreeComponent;

export type StoryTreeComponent = {
  Component: unknown;
  props: Record<string, unknown>;
  slots: Record<string, StoryTree>;
};

/** The components one render page imports, keyed by the module id the browser sends. */
export type RenderPageComponents = Record<string, unknown>;

/**
 * Turns a render request into the tree a render page renders. Runs the same
 * args pipeline as `createAstroRenderHandler` (component references, images,
 * dates, sanitization), but leaves the rendering to Astro instead of the
 * Container, so slot and decorator components stay components.
 */
export async function resolveStoryTree(
  request: HandlerProps,
  components: RenderPageComponents,
  sanitization?: SanitizationOptions
): Promise<StoryTree> {
  const sanitizationOptions = resolveSanitizationOptions(sanitization);
  const loadComponent = async (moduleId: string) => {
    if (!(moduleId in components)) {
      throw new Error(
        `[storybook-astro] ${moduleId} is not part of this story's server build. ` +
          'Import it in the story file (or .storybook/preview) so the build includes it.'
      );
    }

    return components[moduleId];
  };

  const storyComponent = await loadComponent(request.component);
  const storyArgs = reviveDateStrings(
    await processImageMetadata(await reconstructProps(request.args ?? {}, { loadComponent }))
  );
  const sanitizedStory = sanitizeRenderPayload(
    { args: storyArgs, slots: request.slots ?? {} },
    sanitizationOptions
  );
  const story: StoryTreeComponent = {
    Component: storyComponent,
    props: sanitizedStory.args,
    slots: await resolveSlotTrees(sanitizedStory.slots, { loadComponent }, 0)
  };

  if (request.node === undefined) {
    return story;
  }

  // Decorators: the story appears in the tree as a bare reference to its own
  // component, wherever a decorator placed `Story()`. It gets the story's args.
  const { root } = sanitizeRenderPayload(
    { args: {}, slots: { root: request.node } },
    sanitizationOptions
  ).slots;

  return resolveSlotTree('root', root, {
    loadComponent,
    story: { moduleId: request.component, tree: story },
    processProps: async (props) =>
      sanitizeArgs(
        reviveDateStrings(await processImageMetadata(await reconstructProps(props, { loadComponent }))),
        sanitizationOptions
      )
  }, 0);
}

type ResolveOptions = {
  loadComponent: (moduleId: string) => Promise<unknown>;
  /** Set while resolving a decorator tree, to swap the story leaf in. */
  story?: { moduleId: string; tree: StoryTreeComponent };
  processProps?: (props: Record<string, unknown>) => Promise<Record<string, unknown>>;
};

async function resolveSlotTrees(
  slots: Record<string, unknown>,
  options: ResolveOptions,
  depth: number
): Promise<Record<string, StoryTree>> {
  const trees: Record<string, StoryTree> = {};

  for (const [name, value] of Object.entries(slots)) {
    trees[name] = await resolveSlotTree(name, value, options, depth);
  }

  return trees;
}

async function resolveSlotTree(
  name: string,
  value: unknown,
  options: ResolveOptions,
  depth: number
): Promise<StoryTree> {
  if (depth > MAX_DEPTH) {
    throw new Error(
      `Component nesting in slot "${name}" exceeds the maximum depth of ${MAX_DEPTH}. ` +
        'Check for a decorator or slot descriptor that wraps itself.'
    );
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map((item) => resolveSlotTree(name, item, options, depth + 1)));
  }

  if (isAstroComponentMarker(value)) {
    if (options.story && value.moduleId === options.story.moduleId) {
      return options.story.tree;
    }

    return { Component: await options.loadComponent(value.moduleId), props: {}, slots: {} };
  }

  if (isAstroComponentFactory(value)) {
    return { Component: value, props: {}, slots: {} };
  }

  if (isAstroComponentSlot(value)) {
    const component = isAstroComponentMarker(value.component)
      ? await options.loadComponent(value.component.moduleId)
      : value.component;
    const props = value.props
      ? options.processProps
        ? await options.processProps(value.props)
        : await reconstructProps(value.props, options)
      : {};

    return {
      Component: component,
      props,
      slots: value.slots ? await resolveSlotTrees(value.slots, options, depth + 1) : {}
    };
  }

  return typeof value === 'string' ? value : String(value ?? '');
}
