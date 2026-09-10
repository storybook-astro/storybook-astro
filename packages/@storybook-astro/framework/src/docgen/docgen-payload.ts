import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createMetaComponentResolver,
  getComponentIdFromEntry,
  getStoryImportPathFromEntry
} from 'storybook/internal/common';
import {
  extractComponentDescription,
  extractDescription,
  loadCsf
} from 'storybook/internal/csf-tools';
import type { DocgenPayload, DocgenProviderInput } from 'storybook/internal/types';
import { extractArgTypes } from '@storybook-astro/renderer/extractArgTypes';
import type { AstroDocgenInfo } from './types.ts';

/** One instance per worker: the resolver caches its module resolutions. */
const resolveMetaComponent = createMetaComponentResolver({ extensions: ['.astro'] });

/** Reads one component's docgen. Satisfied by `AstroDocgen` from `./index.ts`. */
export interface DocgenSource {
  extract(astroFilePath: string, astroSource: string): Promise<AstroDocgenInfo | null>;
}

export interface DocgenPayloadContext {
  docgen: DocgenSource;
  /**
   * Directory the story index's import paths are relative to. The worker shares
   * the dev server's process, so its `cwd` is the one core resolved the index
   * against; tests pass a fixture directory instead.
   */
  workingDir?: string;
}

/**
 * Builds the docgen payload for the `.astro` component one story file documents.
 *
 * Returns `undefined` to hand the request to the rest of the provider chain.
 * That covers both "nothing here to read" and "not an Astro component" — a
 * React or Vue story reached through an integration belongs to that renderer's
 * provider, and claiming it would starve them.
 */
export async function buildDocgenPayload(
  input: DocgenProviderInput,
  context: DocgenPayloadContext
): Promise<DocgenPayload | undefined> {
  const storyImportPath = getStoryImportPathFromEntry(input.entry);

  if (!storyImportPath) {
    return undefined;
  }

  const storyPath = join(context.workingDir ?? process.cwd(), storyImportPath);
  const storySource = await read(storyPath);

  if (storySource === undefined) {
    return undefined;
  }

  const base = {
    id: getComponentIdFromEntry(input.entry),
    name: componentNameFromTitle(input.entry.title),
    path: storyImportPath,
    jsDocTags: {}
  } satisfies DocgenPayload;

  let csf;

  try {
    csf = loadCsf(storySource, { makeTitle: () => input.entry.title }).parse();
  } catch (error) {
    // The one failure worth claiming the payload for. Every other bail below is
    // ambiguous enough to belong to another provider, but a story file that
    // will not parse leaves the author with a blank page and no clue why.
    return {
      ...base,
      error: {
        name: 'Story file could not be parsed',
        message: `${messageOf(error)}\n\n${storyImportPath}`
      }
    };
  }

  const resolved = resolveMetaComponent(csf, storyPath);

  if ('reason' in resolved) {
    return undefined;
  }

  const { localName, path: componentPath } = resolved.component;

  if (!componentPath?.endsWith('.astro')) {
    return undefined;
  }

  const astroSource = await read(componentPath);

  if (astroSource === undefined) {
    return undefined;
  }

  const info = await context.docgen.extract(componentPath, astroSource);

  if (!info) {
    return undefined;
  }

  // The CSF meta's own docblock wins over the component's, and the tag map is
  // resolved the same way every other framework's provider resolves it.
  const { description, summary, jsDocTags } = extractComponentDescription(
    extractDescription(csf._metaStatement) || undefined,
    info.description || undefined,
    toJsDocTags(info.tags)
  );

  return {
    ...base,
    name: localName || info.displayName || base.name,
    description,
    summary,
    jsDocTags,
    argTypes: extractArgTypes({ __docgenInfo: info }) ?? undefined,
    renderer: 'astro'
  };
}

/** The last segment of a story title, for when the component has no name of its own. */
function componentNameFromTitle(title: string): string {
  return title.split('/').at(-1)!.replace(/\s+/g, '');
}

/** `undefined` when the file is gone — an indexed entry can outlive its file. */
async function read(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** Our extractor keeps one value per tag; the payload's tag map holds a list. */
function toJsDocTags(tags: Record<string, string> | undefined): Record<string, string[]> {
  return Object.fromEntries(Object.entries(tags ?? {}).map(([tag, value]) => [tag, [value]]));
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
