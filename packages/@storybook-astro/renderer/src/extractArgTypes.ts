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
 * parsing, `@ignore` handling, union-to-select inference and default-value
 * formatting, so all that is left here is the mapping onto `StrictArgTypes`.
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

  for (const { propDef } of props) {
    const { name, description, type, sbType, defaultValue, jsDocTags, required } = propDef;

    argTypes[name] = {
      name,
      description,
      type: { required, ...sbType },
      table: {
        type: type ?? undefined,
        jsDocTags,
        defaultValue: defaultValue ?? undefined
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
      control: 'text',
      table: { category: 'slots', type: { summary: name === 'default' ? 'default slot' : 'named slot' } }
    };
  }

  return argTypes;
};
