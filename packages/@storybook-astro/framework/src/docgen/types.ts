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
  /** The slots the component accepts, in the order they first appear. */
  slots?: AstroDocgenSlot[];
}

/** A slot an `.astro` component accepts (docs/specs/docgen.md#slots). */
export interface AstroDocgenSlot {
  /** `default` for an unnamed `<slot />`. */
  name: string;
  /** From a `@slot` comment directly before the `<slot>`, or empty. */
  description: string;
}

export interface AstroDocgenProp {
  name: string;
  required: boolean;
  type: AstroDocgenPropType;
  description: string;
  defaultValue: AstroDocgenDefault | null;
  parent?: DeclarationRef;
  declarations?: DeclarationRef[];
  tags?: Record<string, string>;
}

/**
 * A destructuring default, or else the prop's `@default` tag, whose text is
 * then `source` and is parsed for `value` the same way (issue #371).
 *
 * `source` is the initializer exactly as written (`'/home'`, `defaultTitle`,
 * `null`). It keeps the difference between a string literal and an
 * identifier, which the parsed `value` loses, so the props table and the API
 * description for AI agents both print it (issue #355). `value` is the
 * initializer as a plain literal where it is one, and its source text
 * otherwise; it stays for `docgen.propFilter` functions that read it.
 */
export interface AstroDocgenDefault {
  value: string | number | boolean | null;
  source: string;
}

export interface AstroDocgenPropType {
  name: string;
  /** Full type text, when `name` is a summary like `Array` or `signature`. */
  raw?: string;
  /**
   * The whole type text, when TypeScript shortened `name` (`{ ...; }`). Only
   * the API description for AI agents prints it; the table keeps the summary.
   */
  untruncated?: string;
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
   * `Astro.props` (docs/specs/docgen.md#prop-filtering). A prop is dropped
   * before the filter runs, so a filter can't bring it back, when the
   * component's own `Props` declaration marks it `@ignore`, or, for a prop
   * `Props` only inherits or a union `Props`, when any declaration it comes
   * from does.
   * `prop.tags` holds TypeScript's merged tags, so a prop the component
   * redeclares over an ignored base can still show `tags.ignore`.
   */
  propFilter?: PropFilter;
  /** Overrides tsconfig discovery, which otherwise walks up from the component. */
  tsconfigPath?: string;
}
