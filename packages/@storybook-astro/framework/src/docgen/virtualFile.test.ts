import { describe, expect, test } from 'vitest';
import { appendPropsProbes, buildVirtualSource, virtualFilePathFor } from './virtualFile.ts';

describe('the virtual file sits beside the component', () => {
  test('so relative imports and path aliases resolve from the component folder', () => {
    expect(virtualFilePathFor('/src/components/Button.astro')).toBe(
      '/src/components/Button.astro.ts'
    );
  });
});

describe('frontmatter is kept and everything else is blanked', () => {
  test('the template is replaced by whitespace', () => {
    const source = ['---', "const label = 'hi';", '---', '<button>{label}</button>'].join('\n');

    const virtual = buildVirtualSource(source);

    expect(virtual).toContain("const label = 'hi';");
    expect(virtual).not.toContain('<button>');
  });

  test('every TypeScript offset is the offset in the original .astro file', () => {
    const source = [
      '---',
      'interface Props {',
      '  title?: string;',
      '}',
      '---',
      '<h1>{Astro.props.title}</h1>'
    ].join('\n');

    const virtual = buildVirtualSource(source) as string;

    expect(virtual).toHaveLength(source.length);
    expect(virtual.indexOf('interface Props')).toBe(source.indexOf('interface Props'));
    expect(virtual.indexOf('title?: string')).toBe(source.indexOf('title?: string'));
  });

  test('line numbers are preserved so diagnostics point at the right line', () => {
    const source = ['---', 'const a = 1;', '---', '<p>one</p>', '<p>two</p>'].join('\n');

    const lineCount = (text: string) => text.split('\n').length;

    expect(lineCount(buildVirtualSource(source) as string)).toBe(lineCount(source));
  });

  test('the opening fence becomes a comment rather than disappearing', () => {
    const virtual = buildVirtualSource(['---', 'const a = 1;', '---', ''].join('\n')) as string;

    expect(virtual.startsWith('// ')).toBe(true);
  });

  test('a --- inside a frontmatter string does not end the frontmatter early', () => {
    const source = ['---', "const divider = '---';", 'const after = 2;', '---', '<hr />'].join('\n');

    const virtual = buildVirtualSource(source) as string;

    expect(virtual).toContain('const after = 2;');
  });

  test('an indented closing fence still closes the frontmatter', () => {
    const source = ['---', 'const a = 1;', '  ---  ', '<p>hi</p>'].join('\n');

    const virtual = buildVirtualSource(source) as string;

    expect(virtual).toContain('const a = 1;');
    expect(virtual).not.toContain('<p>');
  });
});

describe('components with nothing to extract are skipped', () => {
  test('a file with no frontmatter', () => {
    expect(buildVirtualSource('<p>just markup</p>')).toBeNull();
  });

  test('a file whose frontmatter is never closed', () => {
    expect(buildVirtualSource('---\nconst a = 1;\n')).toBeNull();
  });

  test('an empty frontmatter block', () => {
    expect(buildVirtualSource(['---', '', '---', '<p>hi</p>'].join('\n'))).toBeNull();
  });
});

describe('the Props probes apply generic defaults', () => {
  test('declares a value of type Props so the checker instantiates it', () => {
    const { source, names } = appendPropsProbes('interface Props { a?: string }');

    expect(names).toHaveLength(1);
    expect(source).toContain(`declare const ${names[0]}: Props;`);
  });

  test('one probe per union constituent, so per-element props are not lost', () => {
    const { source, names } = appendPropsProbes('type Props<T> = { as: T }', ["'a'", "'button'"]);

    expect(names).toHaveLength(2);
    expect(source).toContain(`${names[0]}: Props<'a'>;`);
    expect(source).toContain(`${names[1]}: Props<'button'>;`);
  });

  test('probe names do not collide', () => {
    const { names } = appendPropsProbes('type Props<T> = { as: T }', ["'a'", "'b'", "'c'"]);

    expect(new Set(names).size).toBe(3);
  });

  test('is appended past the original content so no offset moves', () => {
    const original = 'interface Props { a?: string }';

    expect(appendPropsProbes(original).source.startsWith(original)).toBe(true);
  });
});
