import type ts from 'typescript';

/**
 * Rewrites `interface Props … extends A, B { … }` as `type Props … = A & B & { … }`.
 *
 * Astro's polymorphic idiom resolves to a deferred indexed access on a type
 * parameter, and an interface may only extend types with statically known
 * members. TypeScript reports 2312 and then drops the *entire* base type, so
 * the component from #110 yields three props instead of 199. An intersection
 * has no such restriction (docs/specs/docgen.md#heritage-rewrite).
 *
 * Returns `null` when there is nothing to rewrite. This is a fallback path, so
 * unlike the rest of the virtual file it does not preserve byte offsets — the
 * extractor reads types through the checker, not positions.
 */
export function rewriteInterfaceToTypeAlias(
  typescript: typeof ts,
  virtualSource: string
): string | null {
  const sourceFile = typescript.createSourceFile(
    'props-rewrite.ts',
    virtualSource,
    typescript.ScriptTarget.Latest,
    true
  );

  const declaration = sourceFile.statements.find(
    (statement): statement is ts.InterfaceDeclaration =>
      typescript.isInterfaceDeclaration(statement) &&
      statement.name.text === 'Props' &&
      (statement.heritageClauses?.length ?? 0) > 0
  );

  if (!declaration) {
    return null;
  }

  const openBrace = declaration
    .getChildren(sourceFile)
    .find((child) => child.kind === typescript.SyntaxKind.OpenBraceToken);

  if (!openBrace) {
    return null;
  }

  const typeParameters = declaration.typeParameters
    ? `<${declaration.typeParameters.map((each) => each.getText(sourceFile)).join(', ')}>`
    : '';

  const bases = (declaration.heritageClauses ?? [])
    .flatMap((clause) => clause.types)
    .map((each) => each.getText(sourceFile));

  const members = virtualSource.slice(openBrace.getStart(sourceFile), declaration.end);
  const alias = `type Props${typeParameters} = ${[...bases, members].join(' & ')};`;

  return (
    virtualSource.slice(0, declaration.getStart(sourceFile)) +
    alias +
    virtualSource.slice(declaration.end)
  );
}

/**
 * String-literal constituents of the first type parameter's default.
 *
 * `keyof (A | B)` is the intersection of keys, so instantiating a polymorphic
 * `Props<'a' | 'button'>` in one go loses `href` and `type` — each exists on
 * only one constituent. Returning them lets the extractor instantiate per
 * constituent and merge. Returns an empty array when there is nothing to split,
 * or when the union is wider than `maxConstituents` — an unbounded default like
 * `Tag extends HTMLTag = HTMLTag` would otherwise expand to every element.
 */
export function unionConstituentsOfFirstDefault(
  typescript: typeof ts,
  sourceFile: ts.SourceFile,
  maxConstituents: number
): string[] {
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.InterfaceDeclaration | ts.TypeAliasDeclaration =>
      (typescript.isInterfaceDeclaration(statement) ||
        typescript.isTypeAliasDeclaration(statement)) &&
      statement.name.text === 'Props'
  );

  const defaultType = declaration?.typeParameters?.[0]?.default;

  if (!defaultType || !typescript.isUnionTypeNode(defaultType)) {
    return [];
  }

  const constituents = defaultType.types.filter(
    (each) => typescript.isLiteralTypeNode(each) && typescript.isStringLiteral(each.literal)
  );

  if (constituents.length !== defaultType.types.length || constituents.length > maxConstituents) {
    return [];
  }

  return constituents.map((each) => each.getText(sourceFile));
}
