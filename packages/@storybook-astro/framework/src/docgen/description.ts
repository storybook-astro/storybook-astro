import type ts from 'typescript';

export interface ComponentDescription {
  /** Free text only — block tags are split out so they don't render as noise. */
  text: string;
  tags?: Record<string, string>;
}

/**
 * Finds the component's description in its frontmatter.
 *
 * A "floating" JSDoc block isn't floating: TypeScript attaches it to whatever
 * statement follows, so the block above `const buttonVariants = cva(…)` is
 * reachable from that statement. Precedence, first non-empty winning
 * (docs/specs/docgen.md#description-precedence):
 *
 * 1. the first statement whose JSDoc carries `@component` or `@description`
 * 2. JSDoc on the `Props` declaration
 * 3. the file's leading block, if it isn't attached to an import
 *
 * The prior art takes the first `/** *\/` in the file by regex, which happily
 * picks up a license header or a JSDoc written above an import.
 */
export function readComponentDescription(
  typescript: typeof ts,
  sourceFile: ts.SourceFile
): ComponentDescription {
  const blocks = sourceFile.statements.map((statement) => ({
    statement,
    tags: tagsOf(typescript, statement),
    text: freeTextOf(typescript, statement)
  }));

  const explicit = blocks.find((block) => 'component' in block.tags || 'description' in block.tags);

  if (explicit) {
    const { description, ...rest } = explicit.tags;

    return {
      text: description || explicit.text,
      tags: Object.keys(rest).length > 0 ? rest : undefined
    };
  }

  const props = blocks.find(
    (block) =>
      (typescript.isInterfaceDeclaration(block.statement) ||
        typescript.isTypeAliasDeclaration(block.statement)) &&
      block.statement.name.text === 'Props' &&
      block.text
  );

  if (props) {
    return { text: props.text, tags: tagsOrUndefined(props.tags) };
  }

  const [leading] = blocks;

  // A JSDoc above an import documents the import, not the component.
  if (leading?.text && !typescript.isImportDeclaration(leading.statement)) {
    return { text: leading.text, tags: tagsOrUndefined(leading.tags) };
  }

  return { text: '' };
}

function tagsOrUndefined(tags: Record<string, string>): Record<string, string> | undefined {
  return Object.keys(tags).length > 0 ? tags : undefined;
}

function tagsOf(typescript: typeof ts, node: ts.Node): Record<string, string> {
  const tags: Record<string, string> = {};

  for (const tag of typescript.getJSDocTags(node)) {
    tags[tag.tagName.text] = commentToString(typescript, tag.comment).trim();
  }

  return tags;
}

/** The prose above the first block tag, which is what a description should be. */
function freeTextOf(typescript: typeof ts, node: ts.Node): string {
  return typescript
    .getJSDocCommentsAndTags(node)
    .filter((each): each is ts.JSDoc => !!(each as ts.JSDoc).comment || 'tags' in each)
    .map((each) => commentToString(typescript, (each as ts.JSDoc).comment))
    .join('\n')
    .trim();
}

function commentToString(
  typescript: typeof ts,
  comment: string | ts.NodeArray<ts.JSDocComment> | undefined
): string {
  if (comment === undefined) {
    return '';
  }

  return typeof comment === 'string' ? comment : typescript.displayPartsToString(comment);
}
