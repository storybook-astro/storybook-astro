import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createMetaComponentResolver,
  getComponentIdFromEntry,
  getStoryImportPathFromEntry
} from 'storybook/internal/common';
import { storyNameFromExport } from 'storybook/internal/csf';
import {
  createStoryArgsResolver,
  createStoryReferenceResolver,
  extractStoryJSDocInfo,
  loadCsf,
  noSnippetWarning,
  type CsfFile
} from 'storybook/internal/csf-tools';
import * as csfTools from 'storybook/internal/csf-tools';
import type { StoryDoc, StoryDocsPayload, StoryDocsProviderInput } from 'storybook/internal/types';
import {
  generateAstroSource,
  resolveComponentName,
  resolveImportPath
} from '@storybook-astro/renderer/generateAstroSource';

/** Both caches live for the dev server's lifetime, as they do in `@storybook/react`. */
const resolveMetaComponent = createMetaComponentResolver({ extensions: ['.astro'] });
const openStoryReferences = createStoryReferenceResolver();

export interface StoryDocsPayloadContext {
  /** Directory the story index's import paths are relative to; tests pass a fixture directory. */
  workingDir?: string;
}

/**
 * Builds the story docs AI agents read through `docs-show` and
 * `docs-show-story`: each story's name, description and an Astro snippet.
 *
 * The snippet comes from the same generator as Show code, built from the args
 * written in the stories file, read statically from the CSF file. With the
 * Docgen Server on, the Docs page's Show code prints this snippet, so it
 * doesn't follow Controls. A story whose args can't all be read gets a
 * `warning` and no snippet, since a snippet missing an arg would show the
 * wrong usage. A story's hand-written `parameters.docs.source.code` is used
 * as it is, and `docs.source.type: 'code'` without one gets no snippet.
 *
 * Returns `undefined` when the stories file doesn't document an `.astro`
 * component, so the request goes on to the next provider.
 */
export async function buildStoryDocsPayload(
  input: StoryDocsProviderInput,
  context: StoryDocsPayloadContext = {}
): Promise<StoryDocsPayload | undefined> {
  const storyImportPath = getStoryImportPathFromEntry(input.entry);

  if (!storyImportPath) {
    return undefined;
  }

  const storyPath = join(context.workingDir ?? process.cwd(), storyImportPath);
  let csf: CsfFile;

  try {
    const storySource = await readFile(storyPath, 'utf8');

    csf = loadCsf(storySource, { makeTitle: () => input.entry.title }).parse();
  } catch {
    // A missing or unparsable file. The docgen payload reports the parse
    // error, so this provider leaves it to the rest of the chain.
    return undefined;
  }

  const resolved = resolveMetaComponent(csf, storyPath);

  if ('reason' in resolved || !resolved.component.path?.endsWith('.astro')) {
    return undefined;
  }

  const componentName = resolveComponentName({
    moduleId: resolved.component.path,
    title: input.entry.title
  });
  const argsResolver = createStoryArgsResolver(csf, { filePath: storyPath, ...openStoryReferences() });
  const stories: Record<string, StoryDoc> = {};

  for (const [exportName, story] of Object.entries(csf._stories)) {
    const doc: StoryDoc = {
      id: story.id,
      name: story.name ?? storyNameFromExport(exportName)
    };

    try {
      const { args, unresolved, storyMembers, metaMembers } = argsResolver.resolve(exportName);
      const { description, summary } = readStoryDescription(csf, exportName, storyMembers.properties);
      const renderer =
        readParameter(storyMembers.properties, ['renderer']) ??
        readParameter(metaMembers.properties, ['renderer']);
      const readSourceParameter = (key: string) =>
        readParameter(storyMembers.properties, ['docs', 'source', key]) ??
        readParameter(metaMembers.properties, ['docs', 'source', key]);
      const sourceCode = readSourceParameter('code');
      const sourceType = readSourceParameter('type');

      if (description) {
        doc.description = description;
      }
      if (summary) {
        doc.summary = summary;
      }

      if (typeof renderer === 'string' && renderer !== 'astro') {
        // Show code has no snippet for these either: the story renders
        // through the integration's own Storybook renderer.
        doc.warning = `This story renders with the ${renderer} integration, so it has no Astro snippet.`;
      } else if (typeof sourceCode === 'string') {
        // The author's own source wins, as it does in Show code.
        doc.snippet = sourceCode;
      } else if (sourceType === 'code') {
        // Show code prints the story's CSF source here, which isn't Astro
        // usage, so agents get neither a snippet nor a warning.
      } else {
        // What the resolver couldn't follow, plus any value that isn't a literal.
        const unreadable = [...unresolved];
        const values = readArgValues(args, unreadable);

        if (unreadable.length > 0) {
          doc.warning = noSnippetWarning(unreadable);
        } else {
          doc.snippet = generateAstroSource(componentName, values, {
            importPath: resolveImportPath(resolved.component.path, componentName),
            objectProps: readSourceParameter('objectProps') === 'inline' ? 'inline' : 'frontmatter',
            // Nothing has been edited, so an unedited `slot-<name>` arg defers
            // to `args.slots`, as it does in Show code.
            initialArgs: values
          });
        }
      }
    } catch (error) {
      doc.error = {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error)
      };
    }

    stories[story.id] = doc;
  }

  // No `import`: core would put it above the snippet, outside the
  // frontmatter, and each snippet already imports the component there.
  return {
    id: getComponentIdFromEntry(input.entry),
    name: componentName,
    path: storyImportPath,
    stories
  };
}

/**
 * The story's `parameters.docs.description.story` string, which the Docs page
 * shows over the JSDoc, or else the story's JSDoc, as other frameworks read it.
 *
 * Storybook 11 reads comments through the CSF file's source editor, so
 * `extractStoryJSDocInfo` takes it as a second argument. Storybook 10 takes
 * only the node and has no `editor`. Calling it this way works on both.
 */
function readStoryDescription(
  csf: CsfFile,
  exportName: string,
  storyProperties: Record<string, unknown>
): { description?: string; summary?: string } {
  const fromParameters = readParameter(storyProperties, ['docs', 'description', 'story']);

  if (typeof fromParameters === 'string') {
    return { description: fromParameters };
  }

  const extract = extractStoryJSDocInfo as (
    node: unknown,
    editor?: unknown
  ) => { description?: string; summary?: string };

  return extract(csf._storyStatements[exportName], (csf as { editor?: unknown }).editor);
}

/** A literal under `parameters`, or `undefined` when it isn't there or isn't a literal. */
function readParameter(configProperties: Record<string, unknown>, path: string[]): unknown {
  let node = configProperties.parameters as AstNode | undefined;

  for (const key of path) {
    node = node && objectMember(unwrap(node), key);
  }

  if (!node) {
    return undefined;
  }

  const unresolved: string[] = [];
  const value = readValue(node, unresolved);

  return unresolved.length === 0 ? value : undefined;
}

/**
 * Reads each arg's node into the value Show code would see. Anything that
 * isn't a literal (a component, an imported name, a call) is added to
 * `unresolved`. Functions are read as `undefined`, which Show code leaves out
 * too, since a template can't hold one.
 */
function readArgValues(args: Record<string, unknown>, unresolved: string[]): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).map(([name, node]) => [name, readValue(node as AstNode, unresolved)])
  );
}

/**
 * The nodes come from Babel on Storybook 10 and from oxc (ESTree) on
 * Storybook 11, so both spellings of each literal are handled.
 */
type AstNode = { type: string; [key: string]: unknown };

/**
 * Source text for the warning that names what couldn't be read. Storybook 11
 * renamed `sourceOf` to `oneLineTextOf`; a named import of the one a version
 * lacks would fail to load this module.
 */
const describeNode = ((csfTools as Record<string, unknown>).sourceOf ??
  (csfTools as Record<string, unknown>).oneLineTextOf) as (node: AstNode) => string;

const FUNCTION_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'ObjectMethod']);

function readValue(rawNode: AstNode, unresolved: string[]): unknown {
  const node = unwrap(rawNode);

  switch (node.type) {
    case 'StringLiteral':
    case 'NumericLiteral':
    case 'BooleanLiteral':
      return node.value;
    case 'NullLiteral':
      return null;
    case 'BigIntLiteral':
      return BigInt(node.value as string);
    case 'Literal':
      if (typeof node.bigint === 'string') {
        return BigInt(node.bigint);
      }
      if (!node.regex) {
        return node.value;
      }
      break;
    case 'TemplateLiteral':
      if ((node.expressions as unknown[]).length === 0) {
        return (node.quasis as Array<{ value: { cooked: string } }>)[0].value.cooked;
      }
      break;
    case 'Identifier':
      if (node.name === 'undefined') {
        return undefined;
      }
      if (node.name === 'NaN') {
        return NaN;
      }
      if (node.name === 'Infinity') {
        return Infinity;
      }
      break;
    case 'UnaryExpression': {
      const argument = readValue(node.argument as AstNode, unresolved);

      if (node.operator === 'void') {
        return undefined;
      }
      if (node.operator === '-' && typeof argument === 'number') {
        return -argument;
      }
      break;
    }
    case 'ArrayExpression':
      return (node.elements as Array<AstNode | null>).map((element) => {
        if (element === null) {
          return undefined;
        }
        if (element.type === 'SpreadElement') {
          unresolved.push(describeNode(element));

          return undefined;
        }

        return readValue(element, unresolved);
      });
    case 'ObjectExpression':
      return readObject(node, unresolved);
    case 'NewExpression': {
      const [argument] = node.arguments as AstNode[];
      const callee = node.callee as AstNode;

      if (callee.type === 'Identifier' && callee.name === 'Date' && argument) {
        const value = readValue(argument, unresolved);

        if (typeof value === 'string' || typeof value === 'number') {
          return new Date(value);
        }
      }
      break;
    }
    default:
      if (FUNCTION_TYPES.has(node.type)) {
        return undefined;
      }
  }

  unresolved.push(describeNode(node));

  return undefined;
}

function readObject(node: AstNode, unresolved: string[]): Record<string, unknown> {
  const object: Record<string, unknown> = {};

  for (const member of node.properties as AstNode[]) {
    const key = staticKey(member);

    if (key === undefined || member.kind === 'get' || member.kind === 'set') {
      unresolved.push(describeNode(member));
      continue;
    }

    object[key] =
      member.type === 'ObjectMethod' || member.method === true
        ? undefined
        : readValue(member.value as AstNode, unresolved);
  }

  return object;
}

function objectMember(node: AstNode, name: string): AstNode | undefined {
  if (node.type !== 'ObjectExpression') {
    return undefined;
  }

  const member = (node.properties as AstNode[]).find((property) => staticKey(property) === name);

  return member && !FUNCTION_TYPES.has(member.type) && member.method !== true
    ? (member.value as AstNode)
    : undefined;
}

/** A property's key, or `undefined` for a spread or a computed key that isn't a literal. */
function staticKey(member: AstNode): string | undefined {
  if (member.type !== 'ObjectProperty' && member.type !== 'Property' && member.type !== 'ObjectMethod') {
    return undefined;
  }

  const key = member.key as AstNode;

  if (key.type === 'Identifier' && !member.computed) {
    return key.name as string;
  }

  const value = key.type === 'Identifier' ? undefined : readLiteralKey(key);

  return value === undefined ? undefined : String(value);
}

function readLiteralKey(key: AstNode): string | number | undefined {
  const value = key.value;

  return ['StringLiteral', 'NumericLiteral', 'Literal'].includes(key.type) &&
    (typeof value === 'string' || typeof value === 'number')
    ? value
    : undefined;
}

/** Peels TypeScript `as`, `satisfies` and `!` wrappers and parentheses. */
function unwrap(node: AstNode): AstNode {
  let current = node;

  while (
    current.type === 'TSAsExpression' ||
    current.type === 'TSSatisfiesExpression' ||
    current.type === 'TSNonNullExpression' ||
    current.type === 'ParenthesizedExpression'
  ) {
    current = current.expression as AstNode;
  }

  return current;
}
