import { describe, test, expect } from 'vitest';
import { collectAstroScanImports, astroScanModule } from './vitePluginAstroDepScan.ts';

describe('what the dependency scanner sees in a .astro file', () => {
  test('a <script> mentioned in a frontmatter comment is prose, not a script block', () => {
    // The real Accordion.astro shape that broke the scan: Vite matched this
    // `<script>` as markup, sliced the file from there, and failed to parse.
    const source = [
      '---',
      '/**',
      ' * Interactivity uses an inline `<script>` tag.',
      ' */',
      "import Icon from './Icon.astro';",
      '---',
      '<div></div>'
    ].join('\n');

    expect(collectAstroScanImports(source)).toEqual(['./Icon.astro']);
  });

  test('frontmatter imports are reported, which Vite misses on its own', () => {
    const source = [
      '---',
      "import Card from './Card.astro';",
      "import { format } from 'date-fns';",
      "import styles from './card.css';",
      '---',
      '<article></article>'
    ].join('\n');

    expect(collectAstroScanImports(source)).toEqual([
      './Card.astro',
      'date-fns',
      './card.css'
    ]);
  });

  test('real <script> blocks below the frontmatter still contribute imports', () => {
    const source = [
      '---',
      "import Counter from './Counter.astro';",
      '---',
      '<div></div>',
      '<script>',
      "  import confetti from 'canvas-confetti';",
      '  confetti();',
      '</script>'
    ].join('\n');

    expect(collectAstroScanImports(source)).toEqual(['./Counter.astro', 'canvas-confetti']);
  });

  test('a <script src> contributes its src', () => {
    const source = '---\n---\n<script src="./widget.js"></script>';

    expect(collectAstroScanImports(source)).toEqual(['./widget.js']);
  });

  test('imports commented out in frontmatter are ignored', () => {
    const source = [
      '---',
      "// import Old from './Old.astro';",
      "/* import Older from './Older.astro'; */",
      "import New from './New.astro';",
      '---'
    ].join('\n');

    expect(collectAstroScanImports(source)).toEqual(['./New.astro']);
  });

  test("Astro's virtual modules are skipped — the scanner cannot resolve them", () => {
    const source = [
      '---',
      "import { Image } from 'astro:assets';",
      "import thing from 'virtual:something';",
      "import real from './Real.astro';",
      '---'
    ].join('\n');

    expect(collectAstroScanImports(source)).toEqual(['./Real.astro']);
  });

  test('a duplicated specifier is reported once', () => {
    const source = [
      '---',
      "import a from './Shared.astro';",
      "import b from './Shared.astro';",
      '---'
    ].join('\n');

    expect(collectAstroScanImports(source)).toEqual(['./Shared.astro']);
  });

  test('a file with no imports still yields a loadable module', () => {
    expect(astroScanModule('---\n---\n<p>hi</p>')).toBe('export default {};');
  });

  test('the emitted module is import statements plus the default every story imports', () => {
    const source = "---\nimport Card from './Card.astro';\n---";

    expect(astroScanModule(source)).toBe('import "./Card.astro";\nexport default {};');
  });
});

describe('type-only imports', () => {
  test('are skipped — they resolve to .d.ts files the scanner chokes on', () => {
    const source = [
      '---',
      "import type { HTMLAttributes } from 'astro/types';",
      "import type Props from './props';",
      "export type { Foo } from './foo';",
      "import Card from './Card.astro';",
      '---'
    ].join('\n');

    expect(collectAstroScanImports(source)).toEqual(['./Card.astro']);
  });

  test('an inline type specifier does not discard the whole statement', () => {
    const source = "---\nimport { type Variant, renderBadge } from './badge';\n---";

    expect(collectAstroScanImports(source)).toEqual(['./badge']);
  });
});
