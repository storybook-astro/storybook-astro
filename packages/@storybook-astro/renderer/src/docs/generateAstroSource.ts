/**
 * Turns a story's component and args into the Astro source a user would paste
 * into a `.astro` file — a frontmatter block with the import, then the tag.
 *
 * Pure by design (docs/specs/code-panel-source.md#design-decisions, Decision 2):
 * the source decorator is a thin shell around this, so every serialization rule
 * is unit-testable without Storybook or a browser. It runs in the preview
 * iframe, so there is no `node:path` here either — the relative import path is
 * derived with plain string work.
 */

import { splitStoryArgs } from '../slotArgs.ts';

/** Values Storybook can put in `args`. Narrowed as we serialize. */
type ArgValue = unknown;

export type AstroSourceOptions = {
  /** Import specifier for the frontmatter. Omitted entirely when absent. */
  importPath?: string;
  /** Width at which a tag switches to one-attribute-per-line. */
  printWidth?: number;
  /**
   * Where object and array props go: a frontmatter `const` the attribute
   * refers to (the default), or written out in the attribute itself
   * (issue #190).
   */
  objectProps?: 'frontmatter' | 'inline';
  /** The story's initial args, so an unedited `slot-<name>` arg defers to `args.slots`. */
  initialArgs?: Record<string, ArgValue>;
};

const DEFAULT_PRINT_WIDTH = 80;

/**
 * Picks the component name, preferring what the docgen extractor found, then
 * the file it came from, then the story title
 * (docs/specs/code-panel-source.md#design-decisions, Decision 5).
 */
export function resolveComponentName(input: {
  displayName?: string;
  moduleId?: string;
  title?: string;
}): string {
  if (input.displayName) {
    return input.displayName;
  }

  const fromModule = basenameWithoutAstro(input.moduleId);

  if (fromModule) {
    return fromModule;
  }

  const titleSegments = (input.title ?? '').split('/').filter(Boolean);

  return titleSegments[titleSegments.length - 1] || 'Component';
}

/**
 * The import line for the frontmatter.
 *
 * Deliberately always a sibling import rather than a path derived from the
 * story's location. Storybook reports `parameters.fileName` relative to the
 * project root (`./src/components/Card.stories.jsx`) while the stub's
 * `moduleId` is absolute, so the two cannot be compared — and for a component
 * imported from another package there is no relative path worth showing
 * anyway. The snippet is a usage sample, so a plausible sibling import reads
 * better than a 200-character absolute path.
 */
export function resolveImportPath(
  moduleId: string | undefined,
  componentName: string
): string {
  return `./${basenameWithoutAstro(moduleId) || componentName}.astro`;
}

export function generateAstroSource(
  componentName: string,
  args: Record<string, ArgValue> = {},
  options: AstroSourceOptions = {}
): string {
  const printWidth = options.printWidth ?? DEFAULT_PRINT_WIDTH;
  const { props, slots } = splitStoryArgs(args, options.initialArgs);
  const hoisted: string[] = [];
  const attributes: string[] = [];

  // Alphabetical so a snippet doesn't reshuffle when Storybook happens to
  // enumerate args in a different order.
  Object.keys(props)
    .sort()
    .forEach((name) => {
      const attribute = serializeProp(name, props[name], componentName, hoisted, options.objectProps);

      if (attribute) {
        attributes.push(attribute);
      }
    });

  const children = serializeSlots(slots);
  // An attribute that spans lines (an inline object, a multi-line string)
  // breaks the tag.
  const breakTag = attributes.some((attribute) => attribute.includes('\n'));
  const tag = formatTag(componentName, attributes, children, printWidth, breakTag);
  const frontmatter = formatFrontmatter(componentName, options.importPath, hoisted);

  return frontmatter ? `${frontmatter}\n${tag}` : tag;
}

/** Returns the attribute text, or `null` when the value shouldn't be emitted. */
function serializeProp(
  name: string,
  rawValue: ArgValue,
  componentName: string,
  hoisted: string[],
  objectProps: AstroSourceOptions['objectProps']
): string | null {
  const value = applyToJSON(rawValue, '');

  // An absent or empty value is what the component would get by default, so
  // showing it is noise. Functions and Symbols have no Astro template
  // representation.
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  ) {
    return null;
  }

  if (value === true) {
    return name;
  }

  if (typeof value === 'string') {
    return `${name}=${quoteString(value)}`;
  }

  let literal: string;

  try {
    literal = printLiteral(value, '', []);
  } catch (error) {
    // A value a snippet can't express is left out rather than allowed to
    // break Show code for the whole story (issue #273).
    if (error instanceof UnserializableValue) {
      return null;
    }

    throw error;
  }

  if (typeof value !== 'object' || value instanceof Date) {
    return `${name}={${literal}}`;
  }

  if (objectProps === 'inline') {
    // Indented one level past the attribute, which sits on its own line.
    return `${name}={${literal.replaceAll('\n', '\n  ')}}`;
  }

  // By default objects and arrays become a frontmatter `const` the attribute
  // refers to, which keeps the tag short. It's the shape Vue's script-setup
  // snippets use.
  const constName = uniqueConstName(name, componentName, hoisted);

  hoisted.push(`const ${constName} = ${literal};`);

  return `${name}={${constName}}`;
}

/** Thrown for a value no JavaScript literal can stand for. */
class UnserializableValue extends Error {}

/**
 * Writes a value as a JavaScript literal, laid out like
 * `JSON.stringify(value, null, 2)` but keeping these types JSON loses (issue
 * #273): a Date stays a `new Date(...)`, a BigInt keeps its `n`, and `NaN`,
 * `Infinity` and `undefined` array entries stay themselves instead of becoming
 * `null`. Object members that are `undefined`, functions or Symbols are left
 * out, as JSON leaves them out. A function or Symbol array entry is written as
 * `undefined`, so the entries after it keep their positions. Other built-ins
 * such as `Map`, `Set` and `RegExp` still print as `{}`, as JSON prints them.
 *
 * An object's own toJSON isn't called here: the caller calls it first with
 * `applyToJSON`, once per value, as JSON.stringify does.
 *
 * `ancestors` holds the objects being printed above this one, so a cycle is
 * caught. Throws `UnserializableValue` for a cycle.
 */
function printLiteral(value: ArgValue, indent: string, ancestors: object[]): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undefined';
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (typeof value === 'bigint') {
    return `${value}n`;
  }

  if (typeof value !== 'object') {
    throw new UnserializableValue();
  }

  // A Number, String or Boolean wrapper prints as the value it wraps, as JSON
  // unwraps it.
  if (value instanceof Number || value instanceof String || value instanceof Boolean) {
    return printLiteral(value.valueOf(), indent, ancestors);
  }

  if (value instanceof Date) {
    const time = value.getTime();

    return Number.isNaN(time) ? 'new Date(NaN)' : `new Date(${JSON.stringify(value.toISOString())})`;
  }

  if (ancestors.includes(value)) {
    throw new UnserializableValue();
  }

  const inside = [...ancestors, value];
  const innerIndent = `${indent}  `;

  if (Array.isArray(value)) {
    // Entries are read by index, as JSON reads them, so a hole is undefined
    // and entries keep their positions. A function or Symbol entry has no
    // literal, so it's written as undefined for the same reason.
    const entries = Array.from({ length: value.length }, (_, index) => {
      const entry = applyToJSON(value[index], String(index));

      return typeof entry === 'function' || typeof entry === 'symbol'
        ? 'undefined'
        : printLiteral(entry, innerIndent, inside);
    });

    return entries.length === 0
      ? '[]'
      : `[\n${entries.map((entry) => innerIndent + entry).join(',\n')}\n${indent}]`;
  }

  const members = Object.entries(value)
    .map(([key, member]): [string, ArgValue] => [key, applyToJSON(member, key)])
    .filter(
      ([, member]) =>
        member !== undefined && typeof member !== 'function' && typeof member !== 'symbol'
    )
    .map(([key, member]) => `${innerIndent}${printKey(key)}: ${printLiteral(member, innerIndent, inside)}`);

  return members.length === 0 ? '{}' : `{\n${members.join(',\n')}\n${indent}}`;
}

/**
 * An object that says how it serializes (a URL, say) is shown that way, as
 * JSON.stringify would show it: toJSON is called once, with the value's key
 * ('' at the top level), before the value is filtered or printed, and never
 * on what it returns. A Date keeps its own `new Date(...)` form instead.
 */
function applyToJSON(value: ArgValue, key: string): ArgValue {
  if (typeof value !== 'object' || value === null || value instanceof Date) {
    return value;
  }

  const toJSON = (value as { toJSON?: unknown }).toJSON;

  return typeof toJSON === 'function' ? toJSON.call(value, key) : value;
}

/**
 * A key is quoted only where JavaScript needs it. `__proto__` is written as a
 * computed key, since in a literal both `__proto__:` and `"__proto__":` set the
 * object's prototype instead of adding a key.
 */
function printKey(key: string): string {
  if (key === '__proto__') {
    return '["__proto__"]';
  }

  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);
}

/**
 * Astro attributes are JSX-like, so a plain string needs quoting that survives
 * whatever the value contains: double quotes normally, single when the value
 * has a double quote, and an expression with a template literal when it has
 * both or spans lines.
 */
function quoteString(value: string): string {
  const hasDouble = value.includes('"');
  const hasSingle = value.includes("'");

  if (value.includes('\n') || (hasDouble && hasSingle)) {
    const escaped = value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

    return `{\`${escaped}\`}`;
  }

  return hasDouble ? `'${value}'` : `"${value}"`;
}

function serializeSlots(slots: ArgValue): string[] {
  if (!slots || typeof slots !== 'object' || Array.isArray(slots)) {
    return [];
  }

  const entries = Object.entries(slots as Record<string, ArgValue>);
  const children: string[] = [];

  entries.forEach(([slotName, content]) => {
    const text = slotContentToString(content);

    if (!text) {
      return;
    }

    children.push(
      slotName === 'default' ? text : `<Fragment slot="${slotName}">${text}</Fragment>`
    );
  });

  return children;
}

/**
 * Slot content is normally an HTML string. A component reference or descriptor
 * has no faithful template form, so it is shown as a comment rather than
 * silently dropped — the reader can see something is there.
 */
function slotContentToString(content: ArgValue): string | null {
  if (typeof content === 'string') {
    return content.trim() || null;
  }

  if (Array.isArray(content)) {
    const parts = content.map(slotContentToString).filter(Boolean);

    return parts.length > 0 ? parts.join('\n') : null;
  }

  if (content === undefined || content === null) {
    return null;
  }

  return '<!-- component slot content -->';
}

function formatTag(
  name: string,
  attributes: string[],
  children: string[],
  printWidth: number,
  breakTag: boolean
): string {
  const inline = attributes.length > 0 ? ` ${attributes.join(' ')}` : '';
  const openInline = `<${name}${inline}>`;
  const selfClosingInline = `<${name}${inline} />`;
  const fitsOnOneLine =
    !breakTag && (children.length > 0 ? openInline.length : selfClosingInline.length) <= printWidth;
  const attributeLines = indent(attributes);

  if (children.length === 0) {
    return fitsOnOneLine ? selfClosingInline : `<${name}\n${attributeLines}\n/>`;
  }

  const open = fitsOnOneLine ? openInline : `<${name}\n${attributeLines}\n>`;

  return `${open}\n${indent(children.flatMap((child) => child.split('\n')))}\n</${name}>`;
}

function formatFrontmatter(
  componentName: string,
  importPath: string | undefined,
  hoisted: string[]
): string | null {
  const lines: string[] = [];

  if (importPath) {
    lines.push(`import ${componentName} from '${importPath}';`);
  }

  if (hoisted.length > 0) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(...hoisted);
  }

  return lines.length > 0 ? `---\n${lines.join('\n')}\n---` : null;
}

function uniqueConstName(propName: string, componentName: string, hoisted: string[]): string {
  const base = propName.replace(/[^A-Za-z0-9_$]/g, '') || 'value';
  const safe = /^[A-Za-z_$]/.test(base) ? base : `_${base}`;
  const taken = (candidate: string) =>
    candidate === componentName || hoisted.some((line) => line.startsWith(`const ${candidate} =`));

  if (!taken(safe)) {
    return safe;
  }

  let suffix = 2;

  while (taken(`${safe}${suffix}`)) {
    suffix += 1;
  }

  return `${safe}${suffix}`;
}

function indent(lines: string[]): string {
  return lines.map((line) => `  ${line}`).join('\n');
}

function posixSegments(path: string): string[] {
  return path.replace(/\\/g, '/').split('/').filter(Boolean);
}

function basenameWithoutAstro(path: string | undefined): string {
  if (!path) {
    return '';
  }

  const last = posixSegments(path).pop() ?? '';

  return last.replace(/\.astro$/, '');
}
