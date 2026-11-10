import type { StrictArgTypes } from 'storybook/internal/types';
import type { AstroDocgenInfo } from './types.ts';

/**
 * The Markdown `DocgenPayload.apiDescription` carries: a component's props and
 * slots, for AI agents reading `@storybook/addon-mcp`'s `docs-show` and for
 * `/manifests/components.html`.
 *
 * Storybook core drops `argTypes` before it formats a component for an agent
 * and builds the props section only from React docgen, so without this an
 * Astro component reaches the agent with no props (issue #353). The props
 * section copies the shape core gives React components (`formatPropsSection`
 * in core's docs toolset), so an agent reads both the same way.
 *
 * It is built from the extractor's argTypes, the rows the props table starts
 * from, so a prop the extractor leaves out (the prop filter) is left out
 * here too, and defaults read the same. A story's `argTypes` aren't
 * applied: `table: { disable: true }` there hides a row from the table only.
 * The type text comes from the extractor, since the table summarizes a literal
 * union as `enum`.
 */
export function formatApiDescription(
  argTypes: StrictArgTypes | null,
  info: AstroDocgenInfo
): string | undefined {
  const sections = [...propsSection(argTypes, info), ...slotsSection(info)];

  return sections.length > 0 ? sections.join('\n').trim() : undefined;
}

function propsSection(argTypes: StrictArgTypes | null, info: AstroDocgenInfo): string[] {
  // Slot rows share the argTypes; only keys the extractor read as props count.
  const props = Object.entries(argTypes ?? {}).filter(([key]) => key in info.props);

  if (props.length === 0) {
    return [];
  }

  const lines = ['## Props', '', '```', 'export type Props = {'];

  for (const [key, argType] of props) {
    const { type } = info.props[key];
    const typeText = type.name === 'enum' && type.raw ? type.raw : type.name;
    const optional = argType.type?.required ? '' : '?';
    // Typed as a string, but a `false` or `0` default arrives as itself.
    const defaultValue: unknown = argType.table?.defaultValue?.summary;
    // An array or object default keeps its source's line breaks, which would
    // read as stray members of the type.
    const fallback =
      defaultValue == null || defaultValue === ''
        ? ''
        : ` = ${String(defaultValue).replace(/\s+/g, ' ')}`;

    lines.push(...docComment(argType.description));
    lines.push(`  ${key}${optional}: ${typeText}${fallback};`);
  }

  lines.push('}', '```', '');

  return lines;
}

function slotsSection(info: AstroDocgenInfo): string[] {
  const slots = info.slots ?? [];

  if (slots.length === 0) {
    return [];
  }

  const lines = ['## Slots', ''];

  for (const { name, description } of slots) {
    const label = name === 'default' ? '`default` (child content)' : `\`${name}\``;
    // A wrapped `@slot` comment would otherwise break out of its list item.
    const text = description
      .split('\n')
      .map((line) => line.replace(/^\s*\*?\s*/, '').trim())
      .filter(Boolean)
      .join(' ');

    lines.push(text ? `- ${label}: ${text}` : `- ${label}`);
  }

  lines.push('');

  // Astro stories have no `children` arg, so even a default slot needs saying.
  if (slots.some(({ name }) => name !== 'default')) {
    lines.push(
      'In a story, pass slot content in `args.slots` (`slots: { <name>: \'…\' }`). ' +
        'In an Astro template, put `slot="<name>"` on the child element.',
      ''
    );
  } else {
    lines.push('In a story, pass slot content in `args.slots` (`slots: { default: \'…\' }`).', '');
  }

  return lines;
}

function docComment(description: string | undefined): string[] {
  const text = description?.trim();

  if (!text) {
    return [];
  }

  // A `*/` inside the description would close the comment early.
  const lines = text.replaceAll('*/', '*\\/').split('\n');

  return ['  /**', ...lines.map((line) => (line ? `    ${line}` : '')), '  */'];
}
