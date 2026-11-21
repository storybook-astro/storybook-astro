import type ts from 'typescript';
import type { AstroDocgenDefault } from './types.ts';

export interface AstroPropsBinding {
  /** Prop name → its default, for props destructured with one. */
  defaults: Map<string, AstroDocgenDefault>;
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
  const defaults = new Map<string, AstroDocgenDefault>();
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
        const propName = propNameOf(typescript, element.propertyName ?? element.name, sourceFile);

        destructured.add(propName);

        if (element.initializer) {
          defaults.set(propName, {
            value: literalValueOf(typescript, element.initializer, sourceFile),
            source: element.initializer.getText(sourceFile)
          });
        }
      }
    }
  }

  return { defaults, destructured };
}

/**
 * A quoted key names the prop without its quotes: `'aria-label': ariaLabel`
 * destructures `aria-label` (issue #373). A computed key keeps its source text.
 */
function propNameOf(
  typescript: typeof ts,
  name: ts.PropertyName | ts.BindingName,
  sourceFile: ts.SourceFile
): string {
  if (
    typescript.isIdentifier(name) ||
    typescript.isStringLiteral(name) ||
    typescript.isNumericLiteral(name) ||
    typescript.isNoSubstitutionTemplateLiteral(name)
  ) {
    return name.text;
  }

  return name.getText(sourceFile);
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
export function literalValueOf(
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
