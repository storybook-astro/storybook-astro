import typescript from 'typescript';
import { describe, expect, test } from 'vitest';
import { readAstroPropsBinding } from './defaultValues.ts';
import { buildVirtualSource } from './virtualFile.ts';

/** Reads the binding out of real `.astro` frontmatter, the way the extractor does. */
function bindingFor(frontmatter: string) {
  const source = buildVirtualSource(`---\n${frontmatter}\n---\n<div />`) as string;
  const sourceFile = typescript.createSourceFile(
    '/src/Component.astro.ts',
    source,
    typescript.ScriptTarget.Latest,
    true
  );

  return readAstroPropsBinding(typescript, sourceFile);
}

describe('defaults are read from the destructuring pattern', () => {
  test.each([
    ["const { a = 'x' } = Astro.props;", "'x'"],
    ['const { a = "x" } = Astro.props;', '"x"'],
    ['const { a = 42 } = Astro.props;', '42'],
    ['const { a = -1 } = Astro.props;', '-1'],
    ['const { a = true } = Astro.props;', 'true'],
    ['const { a = null } = Astro.props;', 'null'],
    ['const { a = undefined } = Astro.props;', 'undefined'],
    ['const { a = `x` } = Astro.props;', '`x`'],
    ['const { a = defaultNavItems } = Astro.props;', 'defaultNavItems'],
    ["const { a = ['a', 'b'] } = Astro.props;", "['a', 'b']"],
    ['const { a = -offset } = Astro.props;', '-offset'],
    ['const { a = `${base}/home` } = Astro.props;', '`${base}/home`']
  ])('a default keeps its source text: %s', (frontmatter, expected) => {
    expect(bindingFor(frontmatter).defaults.get('a')).toEqual({ value: expected });
  });

  test('a prop destructured without a default has none', () => {
    const binding = bindingFor('const { a } = Astro.props;');

    expect(binding.defaults.has('a')).toBe(false);
    expect(binding.destructured.has('a')).toBe(true);
  });
});

describe('the annotated forms of Astro.props are all recognised', () => {
  test.each([
    'const { a = 1 } = Astro.props;',
    'const { a = 1 } = Astro.props as Props;',
    'const { a = 1 } = Astro.props satisfies Props;',
    'const { a = 1 } = (Astro.props as Props);'
  ])('%s', (frontmatter) => {
    expect(bindingFor(frontmatter).defaults.get('a')?.value).toBe('1');
  });
});

describe('the destructured set is the component author’s public surface', () => {
  test('a renamed binding records the prop name, not the local alias', () => {
    const binding = bindingFor("const { class: className = 'card' } = Astro.props;");

    expect(binding.destructured.has('class')).toBe(true);
    expect(binding.destructured.has('className')).toBe(false);
    expect(binding.defaults.get('class')?.value).toBe("'card'");
  });

  test('a rest element is not a prop', () => {
    const binding = bindingFor('const { as = "button", ...rest } = Astro.props;');

    expect([...binding.destructured]).toEqual(['as']);
  });

  test('every destructured name is captured, defaulted or not', () => {
    const binding = bindingFor(
      "const { as = 'button', href, disabled = false } = Astro.props as Props;"
    );

    expect([...binding.destructured].sort()).toEqual(['as', 'disabled', 'href']);
  });
});

describe('unrelated code is left alone', () => {
  test('a destructure of something other than Astro.props', () => {
    expect(bindingFor("const { a = 1 } = someOtherObject;").destructured.size).toBe(0);
  });

  test('Astro.props read without destructuring', () => {
    expect(bindingFor('const props = Astro.props;').destructured.size).toBe(0);
  });

  test('a destructure nested in a function is not the component surface', () => {
    const binding = bindingFor(
      ['function helper() {', '  const { a = 1 } = Astro.props;', '}'].join('\n')
    );

    expect(binding.destructured.size).toBe(0);
  });
});
