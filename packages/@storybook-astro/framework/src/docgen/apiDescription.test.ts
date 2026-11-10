import { describe, expect, test } from 'vitest';
import { extractArgTypes } from '@storybook-astro/renderer/extractArgTypes';
import { formatApiDescription } from './apiDescription.ts';
import type { AstroDocgenInfo, AstroDocgenProp } from './types.ts';

function prop(name: string, overrides: Partial<AstroDocgenProp> = {}): AstroDocgenProp {
  return {
    name,
    required: false,
    type: { name: 'string' },
    description: '',
    defaultValue: null,
    ...overrides
  };
}

/** Formats a component the way the docgen payload does, from the table's argTypes. */
function describeComponent(info: Partial<AstroDocgenInfo>) {
  const component: AstroDocgenInfo = { displayName: 'Card', description: '', props: {}, ...info };

  return formatApiDescription(extractArgTypes({ __docgenInfo: component }), component);
}

describe('the props an agent reads', () => {
  test('lists required, optional, defaulted and described props as a Props type', () => {
    const markdown = describeComponent({
      props: {
        title: prop('title', { required: true, description: 'Heading text.' }),
        subtitle: prop('subtitle'),
        featured: prop('featured', {
          type: { name: 'boolean' },
          defaultValue: { value: false }
        }),
        variant: prop('variant', {
          description: 'How loud the card is.',
          type: {
            name: 'enum',
            raw: '"primary" | "secondary"',
            value: [{ value: '"primary"' }, { value: '"secondary"' }]
          },
          defaultValue: { value: 'primary' }
        })
      }
    });

    expect(markdown).toBe(
      [
        '## Props',
        '',
        '```',
        'export type Props = {',
        '  /**',
        '    Heading text.',
        '  */',
        '  title: string;',
        '  subtitle?: string;',
        '  featured?: boolean = false;',
        '  /**',
        '    How loud the card is.',
        '  */',
        '  variant?: "primary" | "secondary" = "primary";',
        '}',
        '```'
      ].join('\n')
    );
  });

  test('keeps every line of a multi-line description inside the comment', () => {
    const markdown = describeComponent({
      props: {
        href: prop('href', { description: 'Where the card links.\n\nUse */ with care.' })
      }
    });

    expect(markdown).toContain(
      ['  /**', '    Where the card links.', '', '    Use *\\/ with care.', '  */'].join('\n')
    );
  });

  test('keeps a multi-line array default on its prop line', () => {
    const markdown = describeComponent({
      props: {
        items: prop('items', {
          type: { name: 'string[]' },
          defaultValue: { value: "[\n  'a',\n  'b'\n]" }
        })
      }
    });

    expect(markdown).toContain("  items?: string[] = [ 'a', 'b' ];\n}");
  });

  test('leaves out a prop the props table hides with @ignore', () => {
    const markdown = describeComponent({
      props: {
        title: prop('title'),
        internal: prop('internal', { description: '@ignore' })
      }
    });

    expect(markdown).toContain('title?: string;');
    expect(markdown).not.toContain('internal');
  });
});

describe('the slots an agent reads', () => {
  test('lists each slot with its description, and how to fill a named one', () => {
    const markdown = describeComponent({
      props: { title: prop('title') },
      slots: [
        { name: 'default', description: 'The card body' },
        { name: 'actions', description: '' }
      ]
    });

    expect(markdown).toContain(
      [
        '## Slots',
        '',
        '- `default` (child content): The card body',
        '- `actions`',
        '',
        "In a story, pass slot content in `args.slots` (`slots: { <name>: '…' }`). " +
          'In an Astro template, put `slot="<name>"` on the child element.'
      ].join('\n')
    );
    // Slot rows live in the same argTypes, but they are not props.
    expect(markdown).not.toContain('slot-default');
  });

  test('a component with only a default slot is told to fill it through args.slots', () => {
    const markdown = describeComponent({ slots: [{ name: 'default', description: '' }] });

    expect(markdown).toBe(
      [
        '## Slots',
        '',
        '- `default` (child content)',
        '',
        "In a story, pass slot content in `args.slots` (`slots: { default: '…' }`)."
      ].join('\n')
    );
  });

  test('keeps a wrapped @slot description in one list item', () => {
    const markdown = describeComponent({
      slots: [{ name: 'footer', description: 'Shown under the body.\n * Accepts markup.\nKeep it short.' }]
    });

    expect(markdown).toContain(
      ['## Slots', '', '- `footer`: Shown under the body. Accepts markup. Keep it short.', ''].join('\n')
    );
  });
});

test('a component with no props or slots has no API description', () => {
  expect(describeComponent({})).toBeUndefined();
});
