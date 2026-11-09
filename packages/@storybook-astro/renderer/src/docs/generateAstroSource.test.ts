import { describe, test, expect } from 'vitest';
import {
  generateAstroSource,
  resolveComponentName,
  resolveImportPath
} from './generateAstroSource.ts';

describe('serializing prop values', () => {
  test('a string becomes a quoted attribute', () => {
    expect(generateAstroSource('Card', { title: 'Hello' })).toBe('<Card title="Hello" />');
  });

  test('a string containing a double quote switches to single quotes', () => {
    expect(generateAstroSource('Card', { title: 'He said "hi"' })).toBe(
      `<Card title='He said "hi"' />`
    );
  });

  test('a string containing both quote kinds becomes a template literal', () => {
    expect(generateAstroSource('Card', { title: `it's "quoted"` })).toBe(
      '<Card title={`it\'s "quoted"`} />'
    );
  });

  test('a multi-line string becomes a template literal', () => {
    expect(generateAstroSource('Card', { body: 'one\ntwo' })).toBe(
      ['<Card', '  body={`one', 'two`}', '/>'].join('\n')
    );
  });

  test('a multi-line string breaks the tag, leaving its continuation line unindented', () => {
    // Re-indenting the continuation would change the string's value.
    expect(generateAstroSource('Card', { text: 'a\nb', title: 'Hi' })).toBe(
      ['<Card', '  text={`a', 'b`}', '  title="Hi"', '/>'].join('\n')
    );
  });

  test('backticks and interpolation in a template literal are escaped', () => {
    expect(generateAstroSource('Card', { body: 'a `b` ${c}\nd' })).toBe(
      ['<Card', '  body={`a \\`b\\` \\${c}', 'd`}', '/>'].join('\n')
    );
  });

  test('true renders bare, false renders as an expression', () => {
    expect(generateAstroSource('Card', { featured: true })).toBe('<Card featured />');
    expect(generateAstroSource('Card', { featured: false })).toBe('<Card featured={false} />');
  });

  test('numbers and bigints render as expressions', () => {
    expect(generateAstroSource('Card', { count: 42 })).toBe('<Card count={42} />');
    expect(generateAstroSource('Card', { count: 9007199254740993n })).toBe(
      '<Card count={9007199254740993n} />'
    );
  });

  test('a Date renders as a constructor call', () => {
    const source = generateAstroSource('Card', { published: new Date('2026-06-11T10:00:00Z') });

    expect(source).toBe('<Card published={new Date("2026-06-11T10:00:00.000Z")} />');
  });

  test('empty, null, undefined and function values are omitted', () => {
    const source = generateAstroSource('Card', {
      title: '',
      subtitle: null,
      body: undefined,
      onClick: () => {},
      kept: 'yes'
    });

    expect(source).toBe('<Card kept="yes" />');
  });

  test('props are sorted alphabetically so snippets are stable', () => {
    expect(generateAstroSource('Card', { zeta: 'z', alpha: 'a' })).toBe(
      '<Card alpha="a" zeta="z" />'
    );
  });
});

describe('writing complex values inline (issue #190)', () => {
  test('an object is written out in its attribute, and the tag breaks onto lines', () => {
    const source = generateAstroSource(
      'Card',
      { media: { src: '/a.png', width: 600 }, title: 'Title', slots: { default: 'Content' } },
      { importPath: './Card.astro', objectProps: 'inline' }
    );

    expect(source).toBe(
      [
        '---',
        "import Card from './Card.astro';",
        '---',
        '<Card',
        '  media={{',
        '    src: "/a.png",',
        '    width: 600',
        '  }}',
        '  title="Title"',
        '>',
        '  Content',
        '</Card>'
      ].join('\n')
    );
  });

  test('an array is written out the same way, with no frontmatter const', () => {
    const source = generateAstroSource('List', { items: ['a', 'b'] }, { objectProps: 'inline' });

    expect(source).toBe(['<List', '  items={[', '    "a",', '    "b"', '  ]}', '/>'].join('\n'));
  });

  test('an empty array keeps the tag on one line', () => {
    expect(generateAstroSource('List', { items: [] }, { objectProps: 'inline' })).toBe(
      '<List items={[]} />'
    );
  });

  test('each level of a nested object is indented two more spaces', () => {
    const source = generateAstroSource(
      'Card',
      { media: { size: { w: 600 } } },
      { objectProps: 'inline' }
    );

    expect(source).toBe(
      ['<Card', '  media={{', '    size: {', '      w: 600', '    }', '  }}', '/>'].join('\n')
    );
  });
});

describe('values JSON cannot represent (issue #273)', () => {
  const modes = ['frontmatter', 'inline'] as const;

  describe.each(modes)('with objectProps %s', (objectProps) => {
    /** The printed literal for `value`, from whichever place the mode puts it. */
    function literalFor(value: unknown): string {
      const source = generateAstroSource('Card', { value }, { objectProps });

      if (objectProps === 'inline') {
        return source.replace(/^<Card\n {2}value=\{/, '').replace(/\}\n\/>$/, '').replaceAll('\n  ', '\n');
      }

      return source.replace(/^---\nconst value = /, '').replace(/;\n---\n<Card value=\{value\} \/>$/, '');
    }

    test('a nested Date stays a Date', () => {
      expect(literalFor({ start: new Date('2026-06-11T00:00:00Z') })).toBe(
        '{\n  start: new Date("2026-06-11T00:00:00.000Z")\n}'
      );
    });

    test('a nested BigInt keeps its n instead of throwing', () => {
      expect(literalFor({ big: 1n })).toBe('{\n  big: 1n\n}');
    });

    test('nested NaN and Infinity stay themselves', () => {
      expect(literalFor({ a: NaN, b: Infinity, c: -Infinity })).toBe(
        '{\n  a: NaN,\n  b: Infinity,\n  c: -Infinity\n}'
      );
    });

    test('undefined array entries and holes stay undefined, keeping positions', () => {
      // eslint-disable-next-line no-sparse-arrays
      expect(literalFor([1, undefined, , 4])).toBe('[\n  1,\n  undefined,\n  undefined,\n  4\n]');
    });

    test('undefined, function and Symbol members are left out of an object', () => {
      expect(literalFor({ kept: 1, gone: undefined, onClick: () => {}, tag: Symbol('t') })).toBe(
        '{\n  kept: 1\n}'
      );
    });

    test('an own __proto__ key is written as a computed key', () => {
      const literal = literalFor(JSON.parse('{"__proto__": {"a": 1}}'));

      expect(literal).toBe('{\n  ["__proto__"]: {\n    a: 1\n  }\n}');
      // Evaluated, the literal has an own key rather than a new prototype.
      expect(Object.keys(new Function(`return ${literal};`)())).toEqual(['__proto__']);
    });

    test('keys that are not identifiers stay quoted', () => {
      expect(literalFor({ 'data-id': 1 })).toBe('{\n  "data-id": 1\n}');
    });

    test('a circular value is left out instead of throwing', () => {
      const node: Record<string, unknown> = { name: 'root' };

      node.self = node;

      expect(generateAstroSource('Card', { value: node, title: 'Hi' }, { objectProps })).toBe(
        '<Card title="Hi" />'
      );
    });

    test('a function or Symbol array entry is written as undefined, keeping positions', () => {
      expect(literalFor(['a', () => {}, Symbol('s'), 'b'])).toBe(
        '[\n  "a",\n  undefined,\n  undefined,\n  "b"\n]'
      );
    });

    test('Number and String wrapper objects print as the value they wrap', () => {
      expect(literalFor({ count: new Number(5), label: new String('ab') })).toBe(
        '{\n  count: 5,\n  label: "ab"\n}'
      );
    });

    test('an object whose toJSON returns itself prints its members', () => {
      expect(
        literalFor({
          a: 1,
          toJSON() {
            return this;
          }
        })
      ).toBe('{\n  a: 1\n}');
    });
  });

  test('a top-level Symbol is omitted instead of throwing', () => {
    expect(generateAstroSource('Card', { tag: Symbol('t'), title: 'Hi' })).toBe(
      '<Card title="Hi" />'
    );
  });

  test('top-level NaN and Infinity render as expressions', () => {
    expect(generateAstroSource('Card', { a: NaN, b: Infinity })).toBe('<Card a={NaN} b={Infinity} />');
  });

  test('an invalid Date renders as new Date(NaN) instead of throwing', () => {
    expect(generateAstroSource('Card', { when: new Date('nope') })).toBe(
      '<Card when={new Date(NaN)} />'
    );
  });

  test('a shared, non-circular reference is printed each time it appears', () => {
    const shared = { a: 1 };

    expect(generateAstroSource('Card', { pair: [shared, shared] }, { objectProps: 'inline' })).toBe(
      ['<Card', '  pair={[', '    {', '      a: 1', '    },', '    {', '      a: 1', '    }', '  ]}', '/>'].join('\n')
    );
  });
});

describe('slots edited in Controls (issue #203)', () => {
  test('a per-slot arg becomes slot content, not an attribute', () => {
    const source = generateAstroSource('Card', {
      title: 'Hi',
      slots: { default: 'Old' },
      'slot-default': 'Edited'
    });

    expect(source).toBe(['<Card title="Hi">', '  Edited', '</Card>'].join('\n'));
  });
});

describe('hoisting complex values into frontmatter', () => {
  test('an object becomes a const and an attribute reference', () => {
    const source = generateAstroSource('Card', { author: { name: 'Ada', role: 'Engineer' } });

    expect(source).toBe(
      [
        '---',
        'const author = {',
        '  name: "Ada",',
        '  role: "Engineer"',
        '};',
        '---',
        '<Card author={author} />'
      ].join('\n')
    );
  });

  test('an array is hoisted the same way', () => {
    const source = generateAstroSource('List', { items: ['a', 'b'] });

    expect(source).toContain('const items = [\n  "a",\n  "b"\n];');
    expect(source).toContain('<List items={items} />');
  });

  test('a const clashing with the component name is suffixed', () => {
    const source = generateAstroSource('Card', { Card: { a: 1 } });

    expect(source).toContain('const Card2 = {');
    expect(source).toContain('<Card Card={Card2} />');
  });

  test('a prop name that is not a valid identifier is sanitised', () => {
    const source = generateAstroSource('Card', { 'data-config': { a: 1 } });

    expect(source).toContain('const dataconfig = {');
    expect(source).toContain('data-config={dataconfig}');
  });
});

describe('slots', () => {
  test('a default slot becomes indented children and an open/close tag', () => {
    const source = generateAstroSource('Card', {
      title: 'Hi',
      slots: { default: '<p>Body</p>' }
    });

    expect(source).toBe('<Card title="Hi">\n  <p>Body</p>\n</Card>');
  });

  test('a named slot is wrapped in a Fragment', () => {
    const source = generateAstroSource('Card', {
      slots: { footer: '<a href="/more">Read more</a>' }
    });

    expect(source).toBe(
      '<Card>\n  <Fragment slot="footer"><a href="/more">Read more</a></Fragment>\n</Card>'
    );
  });

  test('an array slot joins its string entries', () => {
    const source = generateAstroSource('Box', {
      slots: { default: ['<p>one</p>', '<p>two</p>'] }
    });

    expect(source).toBe('<Box>\n  <p>one</p>\n  <p>two</p>\n</Box>');
  });

  test('component slot content is marked rather than dropped silently', () => {
    const source = generateAstroSource('Box', { slots: { default: { component: () => {} } } });

    expect(source).toBe('<Box>\n  <!-- component slot content -->\n</Box>');
  });

  test('empty slots leave the tag self-closing', () => {
    expect(generateAstroSource('Card', { slots: { default: '   ' } })).toBe('<Card />');
    expect(generateAstroSource('Card', { slots: {} })).toBe('<Card />');
  });
});

describe('line breaking', () => {
  test('a tag longer than the print width breaks one attribute per line', () => {
    const source = generateAstroSource('Hero', {
      imageAlt: 'Beautiful Mosque Architecture',
      imageUrl: 'https://example.com/a/rather/long/image/path/that/pushes/past/eighty.jpg'
    });

    expect(source).toBe(
      [
        '<Hero',
        '  imageAlt="Beautiful Mosque Architecture"',
        '  imageUrl="https://example.com/a/rather/long/image/path/that/pushes/past/eighty.jpg"',
        '/>'
      ].join('\n')
    );
  });

  test('a broken tag with children still closes normally', () => {
    const source = generateAstroSource(
      'Hero',
      { title: 'A fairly long title value here', slots: { default: '<p>Body</p>' } },
      { printWidth: 20 }
    );

    expect(source).toBe(
      ['<Hero', '  title="A fairly long title value here"', '>', '  <p>Body</p>', '</Hero>'].join(
        '\n'
      )
    );
  });
});

describe('frontmatter', () => {
  test('an import path produces an import line', () => {
    const source = generateAstroSource('Card', { title: 'Hi' }, { importPath: './Card.astro' });

    expect(source).toBe(
      ["---", "import Card from './Card.astro';", '---', '<Card title="Hi" />'].join('\n')
    );
  });

  test('an import and a const are separated by a blank line', () => {
    const source = generateAstroSource(
      'Card',
      { author: { name: 'Ada' } },
      { importPath: './Card.astro' }
    );

    expect(source.split('\n').slice(0, 4)).toEqual([
      '---',
      "import Card from './Card.astro';",
      '',
      'const author = {'
    ]);
  });

  test('no import and no consts means no frontmatter at all', () => {
    expect(generateAstroSource('Card', { title: 'Hi' })).toBe('<Card title="Hi" />');
  });
});

describe('resolveComponentName', () => {
  test('prefers the docgen displayName', () => {
    expect(
      resolveComponentName({ displayName: 'HeroHijri', moduleId: '/x/Other.astro', title: 'A/B' })
    ).toBe('HeroHijri');
  });

  test('falls back to the module basename', () => {
    expect(resolveComponentName({ moduleId: '/src/components/Card.astro', title: 'A/B' })).toBe(
      'Card'
    );
  });

  test('falls back to the last title segment', () => {
    expect(resolveComponentName({ title: 'Astro/Layout/Hero' })).toBe('Hero');
  });

  test('falls back to a generic name when nothing is known', () => {
    expect(resolveComponentName({})).toBe('Component');
  });
});

describe('resolveImportPath', () => {
  // Storybook reports `parameters.fileName` project-relative while `moduleId`
  // is absolute, so a derived relative path is meaningless — a sibling import
  // is what a usage sample should show.
  test('uses the component file basename', () => {
    expect(resolveImportPath('/src/components/Card.astro', 'Card')).toBe('./Card.astro');
  });

  test('normalises Windows separators', () => {
    expect(resolveImportPath('C:\\p\\src\\Card.astro', 'Card')).toBe('./Card.astro');
  });

  test('keeps the real filename when it differs from the display name', () => {
    expect(resolveImportPath('/src/HeroHijri.astro', 'Hero')).toBe('./HeroHijri.astro');
  });

  test('falls back to the component name when there is no moduleId', () => {
    expect(resolveImportPath(undefined, 'Card')).toBe('./Card.astro');
  });
});
