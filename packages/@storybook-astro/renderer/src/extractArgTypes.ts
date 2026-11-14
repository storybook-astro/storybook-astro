import { extractComponentProps } from 'storybook/internal/docs-tools';
import type { ArgTypesExtractor } from 'storybook/internal/docs-tools';
import type { StrictArgTypes } from 'storybook/internal/types';
import { slotArgName } from './slotArgs.ts';

/**
 * Turns the `__docgenInfo` the framework attached to an Astro component stub
 * into the rows Storybook's Controls panel and props table render.
 *
 * The heavy lifting is `extractComponentProps`, which already understands the
 * `react-docgen-typescript` shape our extractor emits — that is why it emits
 * that shape (docs/specs/docgen.md#design-decisions). It gives us JSDoc tag
 * parsing and union-to-select inference, so all that is left here is the
 * mapping onto `StrictArgTypes`. The extractor drops `@ignore` props itself.
 * Defaults skip docs-tools: the table shows the default's source text as the
 * extractor recorded it, since docs-tools would quote it by the prop's declared
 * type and drop `null` and `undefined` (issue #355).
 */
export const extractArgTypes: ArgTypesExtractor = (component): StrictArgTypes | null => {
  if (!component) {
    return null;
  }

  const props = extractComponentProps(component, 'props');
  const slots: Array<{ name: string; description: string }> = component.__docgenInfo?.slots ?? [];

  if (props.length === 0 && slots.length === 0) {
    return null;
  }

  const argTypes: StrictArgTypes = {};

  for (const { propDef, docgenInfo } of props) {
    const { name, description, type, sbType, jsDocTags, required } = propDef;
    // docs-tools types the default as react-docgen-typescript's `{ value }`;
    // ours also carries the source text the table prints.
    const defaultSource = (docgenInfo.defaultValue as { source?: string } | null)?.source;

    argTypes[name] = {
      name,
      description,
      type: { required, ...sbType },
      table: {
        type: type ?? undefined,
        jsDocTags,
        defaultValue: defaultSource ? { summary: defaultSource } : undefined
      }
    };
  }

  // One row per slot (issue #188), with a text control whose arg the renderer
  // folds back into `args.slots` (issue #203, see slotArgs.ts).
  for (const { name, description } of slots) {
    argTypes[slotArgName(name)] = {
      name,
      description,
      type: { name: 'other', value: 'slot', required: false },
      // The object form: Storybook only normalizes the `'text'` shorthand on
      // argTypes a story writes, and addon-docs renders no control for it here.
      control: { type: 'text' },
      table: { category: 'slots', type: { summary: name === 'default' ? 'default slot' : 'named slot' } }
    };
  }

  return argTypes;
};
