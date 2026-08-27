import type ts from 'typescript';

export interface AstroPropsBinding {
  /** Prop name → default, for props destructured with one. */
  defaults: Map<string, string | number | boolean | null>;
  /**
   * Every prop name the component destructures, with or without a default.
   *
   * This is the author's own statement of the public surface, so the prop
   * filter keeps these regardless of where they were declared — it is what
   * recovers `as`, `href` and `class` on a polymorphic component whose types
   * all come from `node_modules` (docs/specs/docgen.md#prop-filtering).
   */
  destructured: Set<string>;
}

/**
 * Reads `const { … } = Astro.props` from a component's frontmatter.
 *
 * Only top-level statements are considered: a destructure nested inside a
 * function isn't the component's prop surface. The `as Props` and
 * `satisfies Props` forms are both recognised, since neither changes what is
 * being destructured.
 */
export function readAstroPropsBinding(
  typescript: typeof ts,
  sourceFile: ts.SourceFile
): AstroPropsBinding {
  const defaults = new Map<string, string | number | boolean | null>();
  const destructured = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (!typescript.isVariableStatement(statement)) {
      continue;
    }

    for (const declaration of statement.declarationList.declarations) {
      if (
        !declaration.initializer ||
        !isAstroProps(typescript, declaration.initializer) ||
        !typescript.isObjectBindingPattern(declaration.name)
      ) {
        continue;
      }

      for (const element of declaration.name.elements) {
        // `...rest` collects whatever is left over; it isn't a prop itself.
        if (element.dotDotDotToken) {
          continue;
        }

        // `{ class: className }` documents `class`, not `className`. The prior
        // art read the binding name here and so recorded the local alias.
        const propName = (element.propertyName ?? element.name).getText(sourceFile);

        destructured.add(propName);

        if (element.initializer) {
          defaults.set(propName, literalValueOf(typescript, element.initializer, sourceFile));
        }
      }
    }
  }

  return { defaults, destructured };
}

/** Matches `Astro.props`, `Astro.props as Props` and `Astro.props satisfies Props`. */
function isAstroProps(typescript: typeof ts, node: ts.Expression): boolean {
  let expression = node;

  while (
    typescript.isAsExpression(expression) ||
    typescript.isSatisfiesExpression(expression) ||
    typescript.isTypeAssertionExpression(expression) ||
    typescript.isParenthesizedExpression(expression)
  ) {
    expression = expression.expression;
  }

  return (
    typescript.isPropertyAccessExpression(expression) &&
    typescript.isIdentifier(expression.expression) &&
    expression.expression.text === 'Astro' &&
    expression.name.text === 'props'
  );
}

/**
 * Narrows an initializer to something safe to serialise into the bundle.
 * Anything that isn't a plain literal keeps its source text, which is what
 * readers want to see for `navItems = defaultNavItems`.
 */
function literalValueOf(
  typescript: typeof ts,
  node: ts.Expression,
  sourceFile: ts.SourceFile
): string | number | boolean | null {
  if (typescript.isStringLiteral(node) || typescript.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (node.kind === typescript.SyntaxKind.TrueKeyword) {
    return true;
  }

  if (node.kind === typescript.SyntaxKind.FalseKeyword) {
    return false;
  }

  if (node.kind === typescript.SyntaxKind.NullKeyword) {
    return null;
  }

  if (typescript.isNumericLiteral(node)) {
    return Number(node.text);
  }

  if (
    typescript.isPrefixUnaryExpression(node) &&
    node.operator === typescript.SyntaxKind.MinusToken &&
    typescript.isNumericLiteral(node.operand)
  ) {
    return -Number(node.operand.text);
  }

  return node.getText(sourceFile);
}
