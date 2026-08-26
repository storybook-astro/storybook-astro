/**
 * Docgen output for a single `.astro` component.
 *
 * The shape deliberately matches `react-docgen-typescript`: Storybook's
 * `extractComponentProps` (`storybook/internal/docs-tools`) already consumes it,
 * which is what gives us JSDoc tag parsing, `@ignore` handling, union control
 * inference and default-value formatting without reimplementing any of it.
 * See docs/specs/docgen.md#design-decisions (Decision 2).
 */
export interface AstroDocgenInfo {
  displayName: string;
  description: string;
  props: Record<string, AstroDocgenProp>;
  /** JSDoc block tags from the component description, minus the free text. */
  tags?: Record<string, string>;
}

export interface AstroDocgenProp {
  name: string;
  required: boolean;
  type: AstroDocgenPropType;
  description: string;
  defaultValue: { value: string | number | boolean | null } | null;
  parent?: DeclarationRef;
  declarations?: DeclarationRef[];
  tags?: Record<string, string>;
}

export interface AstroDocgenPropType {
  name: string;
  /** Full type text, when `name` is a summary like `Array` or `signature`. */
  raw?: string;
  /** Constituents of a literal union, for select controls. */
  value?: Array<{ value: string }>;
}

/**
 * Where a prop was declared. `name` is the declaring interface or type alias
 * when there is one, and otherwise the nearest named ancestor — props coming
 * from `VariantProps<typeof x>` are property assignments in an object literal
 * and have no declaring type at all (docs/specs/docgen.md#prop-filtering).
 */
export interface DeclarationRef {
  fileName: string;
  name: string;
}

export type PropFilter = (prop: AstroDocgenProp, component: { name: string }) => boolean;

export interface AstroDocgenOptions {
  /**
   * Decides which props reach the table. By default props declared only under
   * `node_modules` are dropped, unless the component destructures them from
   * `Astro.props` (docs/specs/docgen.md#prop-filtering).
   */
  propFilter?: PropFilter;
  /** Overrides tsconfig discovery, which otherwise walks up from the component. */
  tsconfigPath?: string;
}
