import { SourceType } from 'storybook/internal/docs-tools';
import { emitTransformCode, useEffect } from 'storybook/internal/preview-api';
import type { PartialStoryFn, StoryContext } from 'storybook/internal/types';
import type { AstroRenderer } from '../types.ts';
import {
  generateAstroSource,
  resolveComponentName,
  resolveImportPath
} from './generateAstroSource.ts';

/**
 * Emits the Astro template a story's args describe, so Docs "Show code" and the
 * Code Panel show component usage instead of the raw story file
 * (docs/specs/code-panel-source.md).
 *
 * Delivered as a docs-only preview annotation, so projects without addon-docs
 * never load it. The snippet is generated from `context.component` + args
 * rather than from what `storyFn()` returns, which keeps it independent of
 * decorators and of which render mode produced the HTML.
 */
export const sourceDecorator = (
  storyFn: PartialStoryFn<AstroRenderer>,
  context: StoryContext<AstroRenderer>
) => {
  const story = storyFn();

  // Generating source is a side effect of rendering, never a transform of it —
  // the story value is returned untouched.
  useEffect(() => {
    if (shouldSkipSourceRender(context)) {
      return;
    }

    const code = astroSourceFor(context);

    if (code) {
      emitTransformCode(code, context);
    }
  });

  return story;
};

/** The standard skip logic every renderer implements, so user overrides win. */
function shouldSkipSourceRender(context: StoryContext<AstroRenderer>): boolean {
  const source = context?.parameters?.docs?.source;

  if (source?.type === SourceType.DYNAMIC) {
    return false;
  }

  return (
    !context?.parameters?.__isArgsStory ||
    Boolean(source?.code) ||
    source?.type === SourceType.CODE
  );
}

/**
 * Returns the snippet, or `null` when this story isn't one we can describe in
 * Astro template syntax.
 */
function astroSourceFor(context: StoryContext<AstroRenderer>): string | null {
  // `parameters.renderer` is `'astro'` for every story and is never unset, so a
  // *delegated* framework story is one set to something else (see the note on
  // `applyDecorators` in ../decorators.ts). Those render through the
  // framework's own pipeline and would need its source generator, not ours.
  const renderer = context?.parameters?.renderer as string | undefined;

  if (renderer && renderer !== 'astro') {
    return null;
  }

  const component = context?.component as AstroStub | undefined;

  // Astro component stubs carry `moduleId`. Anything else — a string or an
  // HTMLElement story — has no component usage to show.
  if (!component?.moduleId) {
    return null;
  }

  const name = resolveComponentName({
    displayName: component.__docgenInfo?.displayName,
    moduleId: component.moduleId,
    title: context.title
  });

  return generateAstroSource(name, context.args ?? {}, {
    importPath: resolveImportPath(component.moduleId, name)
  });
}

type AstroStub = {
  moduleId?: string;
  __docgenInfo?: { displayName?: string };
};
