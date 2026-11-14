import { afterEach, describe, expect, test, vi } from 'vitest';
import { lockNonTextSlotControls, seedSlotArgs, slotArgName, splitStoryArgs } from './slotArgs.ts';

const slotArgTypes = {
  [slotArgName('default')]: { name: 'default', control: { type: 'text' } },
  [slotArgName('footer')]: { name: 'footer', control: { type: 'text' } }
};

describe('slotArgName', () => {
  test('is a key Storybook keeps in the URL', () => {
    // Storybook's validateArgs only writes keys matching this to the URL.
    expect(slotArgName('footer')).toMatch(/^[a-zA-Z0-9 _-]*$/);
  });

  test('splitStoryArgs folds the URL-safe key into the slots', () => {
    expect(splitStoryArgs({ 'slot-footer': 'Footer' })).toEqual({
      props: {},
      slots: { footer: 'Footer' }
    });
  });
});

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

  test('a play function\'s change to args.slots shows while the slot control is unedited', () => {
    const initialArgs = {
      slots: { default: '<p>Body</p>' },
      [slotArgName('default')]: '<p>Body</p>'
    };
    const args = { ...initialArgs, slots: { default: '<p>From updateArgs</p>' } };

    expect(splitStoryArgs(args, initialArgs).slots).toEqual({ default: '<p>From updateArgs</p>' });
  });

  test('a slot edited in Controls still wins over a changed args.slots', () => {
    const initialArgs = {
      slots: { default: '<p>Body</p>' },
      [slotArgName('default')]: '<p>Body</p>'
    };
    const args = {
      slots: { default: '<p>From updateArgs</p>' },
      [slotArgName('default')]: '<p>Edited</p>'
    };

    expect(splitStoryArgs(args, initialArgs).slots).toEqual({ default: '<p>Edited</p>' });
  });

  test('a text edit never replaces a component the story put in the slot', () => {
    const Badge = () => {};
    const initialArgs = { slots: { default: Badge } };
    const args = { slots: { default: Badge }, [slotArgName('default')]: 'typed text' };

    expect(splitStoryArgs(args, initialArgs).slots).toEqual({ default: Badge });
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

  test('keeps the JSON editor on the slots row for a slot holding an array, which has no text control', () => {
    const argTypes = lockNonTextSlotControls({
      argTypes: slotArgTypes,
      initialArgs: { slots: { default: ['<p>a</p>', '<p>b</p>'] } }
    } as never);

    expect(argTypes[slotArgName('default')].control).toEqual({ disable: true });
    expect(argTypes.slots).toBeUndefined();
  });

  test('keeps the JSON editor on the slots row when the story fills no slots', () => {
    const argTypes = lockNonTextSlotControls({
      argTypes: {},
      initialArgs: { slots: {} }
    } as never);

    expect(argTypes.slots).toBeUndefined();
  });
});

describe('with the Docgen Server on', () => {
  // The preview gets no docgen on this path, so no `slot-<name>` argTypes:
  // those reach the manager from the docgen payload (#267).
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test.each(['experimentalDocgenServer', 'docgenServer'])(
    'seeds each text slot without a preview argType (%s)',
    (flag) => {
      vi.stubGlobal('FEATURES', { [flag]: true });

      const seeded = seedSlotArgs({
        argTypes: {},
        initialArgs: { slots: { default: '<p>Body</p>', footer: () => {} } }
      } as never);

      expect(seeded).toEqual({ [slotArgName('default')]: '<p>Body</p>' });
    }
  );

  test('locks the control of a slot holding a component, so the payload\'s text control stays off', () => {
    vi.stubGlobal('FEATURES', { experimentalDocgenServer: true });

    const argTypes = lockNonTextSlotControls({
      argTypes: {},
      initialArgs: { slots: { default: () => {}, footer: '<b>OK</b>' } }
    } as never);

    expect(argTypes[slotArgName('default')]).toEqual({ control: { disable: true } });
    expect(argTypes[slotArgName('footer')]).toBeUndefined();
  });

  test('keeps the JSON editor on the slots row, since the preview can\'t see which slots have a row', () => {
    vi.stubGlobal('FEATURES', { experimentalDocgenServer: true });

    const argTypes = lockNonTextSlotControls({
      argTypes: {},
      initialArgs: { slots: { default: '<p>Body</p>' } }
    } as never);

    expect(argTypes.slots).toBeUndefined();
  });

  test('without it, a slot the docgen didn\'t find gets no arg and no row', () => {
    vi.stubGlobal('FEATURES', {});

    expect(seedSlotArgs({ argTypes: {}, initialArgs: { slots: { default: '<p>Body</p>' } } } as never)).toEqual({});
    expect(
      lockNonTextSlotControls({ argTypes: {}, initialArgs: { slots: { default: () => {} } } } as never)
    ).toEqual({});
  });
});
