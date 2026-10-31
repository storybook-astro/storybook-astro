import { describe, expect, test } from 'vitest';
import { extractArgTypes } from './extractArgTypes.ts';

const titleProp = {
  name: 'title',
  required: true,
  type: { name: 'string' },
  description: 'The heading text.',
  defaultValue: null
};

describe('extractArgTypes', () => {
  test('documents each slot under a slots category, with a text control (issues #188, #203)', () => {
    const argTypes = extractArgTypes({
      __docgenInfo: {
        displayName: 'Section',
        description: '',
        props: { title: titleProp },
        slots: [
          { name: 'default', description: 'The section body' },
          { name: 'actions', description: '' }
        ]
      }
    });

    expect(argTypes?.title).toMatchObject({ name: 'title', description: 'The heading text.' });
    expect(argTypes?.['slot:default']).toEqual({
      name: 'default',
      description: 'The section body',
      type: { name: 'other', value: 'slot', required: false },
      control: 'text',
      table: { category: 'slots', type: { summary: 'default slot' } }
    });
    expect(argTypes?.['slot:actions']?.table?.type).toEqual({ summary: 'named slot' });
  });

  test('documents the slots of a component with no props', () => {
    const argTypes = extractArgTypes({
      __docgenInfo: { displayName: 'Wrapper', description: '', props: {}, slots: [{ name: 'default', description: '' }] }
    });

    expect(Object.keys(argTypes ?? {})).toEqual(['slot:default']);
  });

  test('returns nothing for a component with neither props nor slots', () => {
    expect(extractArgTypes({ __docgenInfo: { displayName: 'Empty', description: '', props: {} } })).toBeNull();
  });
});
