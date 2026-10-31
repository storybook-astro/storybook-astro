import { describe, expect, test } from 'vitest';
import { readSlots } from './slots.ts';

describe('readSlots', () => {
  test('lists the default slot and named slots, in the order they appear', () => {
    const source = [
      '---',
      'const { title } = Astro.props;',
      '---',
      '<section>',
      '  <header><slot name="header" /></header>',
      '  <slot />',
      "  <footer><slot name='footer'>Fallback</slot></footer>",
      '</section>'
    ].join('\n');

    expect(readSlots(source)).toEqual([
      { name: 'header', description: '' },
      { name: 'default', description: '' },
      { name: 'footer', description: '' }
    ]);
  });

  test('reads a description from an @slot comment directly before the slot', () => {
    const source = [
      '<article>',
      '  {/* @slot The card body */}',
      '  <slot />',
      '  <!-- @slot Actions shown under the body -->',
      '  <slot name="actions" />',
      '  {/* A note about layout, not a slot description */}',
      '  <slot name="aside" />',
      '</article>'
    ].join('\n');

    expect(readSlots(source)).toEqual([
      { name: 'default', description: 'The card body' },
      { name: 'actions', description: 'Actions shown under the body' },
      { name: 'aside', description: '' }
    ]);
  });

  test('ignores an @slot comment separated from the slot by other markup', () => {
    const source = ['{/* @slot Not this one */}', '<p>Intro</p>', '<slot />'].join('\n');

    expect(readSlots(source)).toEqual([{ name: 'default', description: '' }]);
  });

  test('skips commented-out slots and slots with a computed name', () => {
    const source = [
      '<!-- <slot name="old" /> -->',
      '{/* <slot name="older" /> */}',
      '<slot name={dynamicName} />',
      '<slot name="kept" />'
    ].join('\n');

    expect(readSlots(source)).toEqual([{ name: 'kept', description: '' }]);
  });

  test('lists each slot once, keeping the first description found', () => {
    const source = ['<slot name="icon" />', '{/* @slot The leading icon */}', '<slot name="icon" />'].join('\n');

    expect(readSlots(source)).toEqual([{ name: 'icon', description: 'The leading icon' }]);
  });

  test('includes slots the frontmatter reads through Astro.slots', () => {
    const source = [
      '---',
      "const html = await Astro.slots.render('content');",
      'const hasFooter = Astro.slots.has("footer");',
      '---',
      '<Fragment set:html={html} />',
      '<slot name="footer" />'
    ].join('\n');

    expect(readSlots(source)).toEqual([
      { name: 'footer', description: '' },
      { name: 'content', description: '' }
    ]);
  });

  test('doesn\'t read a <slot> written in a frontmatter string as a slot', () => {
    const source = ['---', "const example = '<slot name=\"fake\" />';", '---', '<div />'].join('\n');

    expect(readSlots(source)).toEqual([]);
  });
});
