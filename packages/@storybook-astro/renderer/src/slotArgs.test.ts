import { describe, expect, test } from 'vitest';
import { lockNonTextSlotControls, seedSlotArgs, slotArgName, splitStoryArgs } from './slotArgs.ts';

const slotArgTypes = {
  [slotArgName('default')]: { name: 'default', control: { type: 'text' } },
  [slotArgName('footer')]: { name: 'footer', control: { type: 'text' } }
};

describe('splitStoryArgs', () => {
  test('separates props from slot content', () => {
    expect(splitStoryArgs({ title: 'Hello', slots: { default: '<p>Body</p>' } })).toEqual({
      props: { title: 'Hello' },
      slots: { default: '<p>Body</p>' }
    });
  });

  test('folds a slot edited in Controls into the slots, over the story\'s own content', () => {
    const args = {
      title: 'Hello',
      slots: { default: '<p>Body</p>', footer: '<b>OK</b>' },
      [slotArgName('default')]: '<p>Edited</p>'
    };

    expect(splitStoryArgs(args)).toEqual({
      props: { title: 'Hello' },
      slots: { default: '<p>Edited</p>', footer: '<b>OK</b>' }
    });
  });

  test('adds a slot the story left empty', () => {
    expect(splitStoryArgs({ [slotArgName('footer')]: 'Footer' })).toEqual({
      props: {},
      slots: { footer: 'Footer' }
    });
  });

  test('ignores a slots arg that isn\'t an object', () => {
    expect(splitStoryArgs({ slots: 'nope' }).slots).toEqual({});
  });
});

describe('seedSlotArgs', () => {
  test('starts each slot control at the story\'s text content', () => {
    const seeded = seedSlotArgs({
      argTypes: slotArgTypes,
      initialArgs: { slots: { default: '<p>Body</p>', missing: 'not a slot the docgen found' } }
    } as never);

    expect(seeded).toEqual({ [slotArgName('default')]: '<p>Body</p>' });
  });

  test('leaves a slot holding a component unseeded', () => {
    const component = () => {};

    expect(
      seedSlotArgs({ argTypes: slotArgTypes, initialArgs: { slots: { default: component } } } as never)
    ).toEqual({});
  });
});

describe('lockNonTextSlotControls', () => {
  test('removes the control from a slot whose story content isn\'t text', () => {
    const argTypes = lockNonTextSlotControls({
      argTypes: slotArgTypes,
      initialArgs: { slots: { default: [{ component: 'Card' }], footer: '<b>OK</b>' } }
    } as never);

    expect(argTypes[slotArgName('default')].control).toEqual({ disable: true });
    expect(argTypes[slotArgName('footer')].control).toEqual({ type: 'text' });
  });

  test('removes the JSON editor from the slots row when every slot has its own control', () => {
    const argTypes = lockNonTextSlotControls({
      argTypes: slotArgTypes,
      initialArgs: { slots: { default: '<p>Body</p>' } }
    } as never);

    expect(argTypes.slots?.control).toEqual({ disable: true });
  });

  test('keeps the JSON editor on the slots row for a slot the docgen didn\'t find', () => {
    const argTypes = lockNonTextSlotControls({
      argTypes: slotArgTypes,
      initialArgs: { slots: { default: '<p>Body</p>', aside: '<p>Aside</p>' } }
    } as never);

    expect(argTypes.slots).toBeUndefined();
  });
});
