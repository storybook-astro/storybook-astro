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

/** Values Storybook can put in `args`. Narrowed as we serialize. */
type ArgValue = unknown;

export type AstroSourceOptions = {
  /** Import specifier for the frontmatter. Omitted entirely when absent. */
  importPath?: string;
  /** Width at which a tag switches to one-attribute-per-line. */
  printWidth?: number;
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
  const { slots, ...props } = args;
  const hoisted: string[] = [];
  const attributes: string[] = [];

  // Alphabetical so a snippet doesn't reshuffle when Storybook happens to
  // enumerate args in a different order.
  Object.keys(props)
    .sort()
    .forEach((name) => {
      const attribute = serializeProp(name, props[name], componentName, hoisted);

      if (attribute) {
        attributes.push(attribute);
      }
    });

  const children = serializeSlots(slots);
  const tag = formatTag(componentName, attributes, children, printWidth);
  const frontmatter = formatFrontmatter(componentName, options.importPath, hoisted);

  return frontmatter ? `${frontmatter}\n${tag}` : tag;
}

/** Returns the attribute text, or `null` when the value shouldn't be emitted. */
function serializeProp(
  name: string,
  value: ArgValue,
  componentName: string,
  hoisted: string[]
): string | null {
  // An absent or empty value is what the component would get by default, so
  // showing it is noise. Functions have no Astro template representation.
  if (value === undefined || value === null || value === '' || typeof value === 'function') {
    return null;
  }

  if (value === true) {
    return name;
  }

  if (value === false) {
    return `${name}={false}`;
  }

  if (typeof value === 'number') {
    return `${name}={${value}}`;
  }

  if (typeof value === 'bigint') {
    return `${name}={${value}n}`;
  }

  if (typeof value === 'string') {
    return `${name}=${quoteString(value)}`;
  }

  if (value instanceof Date) {
    return `${name}={new Date(${JSON.stringify(value.toISOString())})}`;
  }

  // Objects and arrays would be unreadable inline, so they become a frontmatter
  // `const` and the attribute references it — the same shape Vue's script-setup
  // snippets use.
  const constName = uniqueConstName(name, componentName, hoisted);

  hoisted.push(`const ${constName} = ${prettyPrint(value)};`);

  return `${name}={${constName}}`;
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
  printWidth: number
): string {
  const inline = attributes.length > 0 ? ` ${attributes.join(' ')}` : '';
  const openInline = `<${name}${inline}>`;
  const selfClosingInline = `<${name}${inline} />`;
  const fitsOnOneLine =
    (children.length > 0 ? openInline.length : selfClosingInline.length) <= printWidth;

  if (children.length === 0) {
    return fitsOnOneLine ? selfClosingInline : `<${name}\n${indent(attributes)}\n/>`;
  }

  const open = fitsOnOneLine ? openInline : `<${name}\n${indent(attributes)}\n>`;

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

/** JSON with the quotes left on keys only where JS would need them. */
function prettyPrint(value: ArgValue): string {
  return JSON.stringify(value, null, 2).replace(/^(\s*)"([A-Za-z_$][\w$]*)":/gm, '$1$2:');
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
