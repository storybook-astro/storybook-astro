import type { AstroDocgenProp, PropFilter } from './types.ts';

const NODE_MODULES = /[/\\]node_modules[/\\]/;

/**
 * Keeps the props a reader came to see and drops inherited DOM noise.
 *
 * A `Props` extending `HTMLAttributes` or `Polymorphic` resolves to around 200
 * properties, 191 of them from `astro/astro-jsx.d.ts`. Unfiltered, every Astro
 * props table is unusable (docs/specs/docgen.md#prop-filtering).
 *
 * Two rules that the conventional `react-docgen-typescript` recipe gets wrong
 * for Astro:
 *
 * - A prop survives if *any* declaration sits outside `node_modules`. A
 *   locally redeclared `disabled` also has a declaration in `astro/types`, so
 *   dropping on the first `node_modules` hit silently deletes it.
 * - A prop the component destructures from `Astro.props` always survives,
 *   wherever its type was declared. That destructuring is the author's own
 *   statement of the public surface, and it is what recovers `as`, `href` and
 *   `class` on a polymorphic component whose types all live in `node_modules`.
 */
export function createDefaultPropFilter(destructuredProps: ReadonlySet<string>): PropFilter {
  return (prop) => {
    // Astro takes content through <slot>, so a `children` prop is inherited
    // noise from a framework type unless someone documented it.
    if (prop.name === 'children' && !prop.description) {
      return false;
    }

    return destructuredProps.has(prop.name) || isDeclaredInProject(prop);
  };
}

function isDeclaredInProject(prop: AstroDocgenProp): boolean {
  const declarations = prop.declarations ?? [];

  // No declaration information is not evidence of third-party origin.
  return (
    declarations.length === 0 ||
    declarations.some((declaration) => !NODE_MODULES.test(declaration.fileName))
  );
}
