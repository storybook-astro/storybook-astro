import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import {
  extractAstroImportSpecifiers,
  vitePluginAstroComponentMarker
} from './vitePluginAstroComponentMarker.ts';

const ASTRO6_CLIENT_STUB = `
export default function() {
  throw new Error('Astro components cannot be used in the browser');
}
`;

const tempDir = mkdtempSync(join(tmpdir(), 'astro-marker-test-'));

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function writeAstroFile(relativePath: string, source: string): string {
  const filePath = join(tempDir, relativePath);

  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(filePath, source);

  return filePath;
}

type TransformablePlugin = {
  configResolved: (config: { command: string }) => void;
  transform: (code: string, id: string) => { code: string } | null;
};

function createPlugin(command: 'serve' | 'build' = 'serve') {
  const plugin = vitePluginAstroComponentMarker() as unknown as TransformablePlugin;

  plugin.configResolved({ command });

  return plugin;
}

describe('vitePluginAstroComponentMarker transform', () => {
  test('ignores non-astro modules and non-stub code', () => {
    const plugin = createPlugin();

    expect(plugin.transform(ASTRO6_CLIENT_STUB, '/some/module.ts')).toBeNull();
    expect(plugin.transform('export default {};', '/some/Component.astro')).toBeNull();
  });

  test('replaces the stub with a marked component factory', () => {
    const filePath = writeAstroFile('Plain.astro', '<div>Hello</div>');
    const plugin = createPlugin();
    const result = plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    expect(result?.code).toContain('isAstroComponentFactory = true');
    expect(result?.code).toContain(JSON.stringify(filePath));
  });

  test('imports style sub-modules for own <style> blocks in dev mode', () => {
    const filePath = writeAstroFile(
      'Styled.astro',
      '<div class="a">Hi</div>\n<style>.a { color: red; }</style>'
    );
    const plugin = createPlugin();
    const result = plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    expect(result?.code).toContain(`${filePath}?astro&type=style&index=0&lang.css`);
  });

  test('re-imports child .astro components so their scoped styles load in dev mode', () => {
    const filePath = writeAstroFile(
      'Parent.astro',
      [
        '---',
        "import Child from './Child.astro';",
        "import Aliased from '@components/Other.astro';",
        '---',
        '<div class="parent"><Child /><Aliased /></div>',
        '<style>.parent { padding: 16px; }</style>'
      ].join('\n')
    );
    const plugin = createPlugin();
    const result = plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    expect(result?.code).toContain(`import "./Child.astro";`);
    expect(result?.code).toContain(`import "@components/Other.astro";`);
  });

  test('inlines CSS from the component and its children in build mode', () => {
    writeAstroFile(
      'build/Child.astro',
      '<div class="child">Hello</div>\n<style>.child { color: red; }</style>'
    );
    const parentPath = writeAstroFile(
      'build/Parent.astro',
      [
        '---',
        "import Child from './Child.astro';",
        '---',
        '<div class="parent"><Child /></div>',
        '<style>.parent { padding: 16px; }</style>'
      ].join('\n')
    );
    const plugin = createPlugin('build');
    const result = plugin.transform(ASTRO6_CLIENT_STUB, parentPath);

    expect(result?.code).toContain('.parent { padding: 16px; }');
    expect(result?.code).toContain('.child { color: red; }');
  });

  test('handles circular child imports in build mode without recursing forever', () => {
    const aPath = writeAstroFile(
      'cycle/A.astro',
      "---\nimport B from './B.astro';\n---\n<B />\n<style>.a { color: blue; }</style>"
    );

    writeAstroFile(
      'cycle/B.astro',
      "---\nimport A from './A.astro';\n---\n<A />\n<style>.b { color: green; }</style>"
    );

    const plugin = createPlugin('build');
    const result = plugin.transform(ASTRO6_CLIENT_STUB, aPath);

    expect(result?.code).toContain('.a { color: blue; }');
    expect(result?.code).toContain('.b { color: green; }');
  });
});

describe('extractAstroImportSpecifiers', () => {
  test('finds default, side-effect, and dynamic .astro imports in the frontmatter', () => {
    const source = [
      '---',
      "import Child from './Child.astro';",
      "import './SideEffect.astro';",
      "const Lazy = await import('./Lazy.astro');",
      "import { helper } from './utils.ts';",
      '---',
      '<div />'
    ].join('\n');

    expect(extractAstroImportSpecifiers(source)).toEqual([
      './Child.astro',
      './SideEffect.astro',
      './Lazy.astro'
    ]);
  });

  test('ignores commented-out imports', () => {
    const source = [
      '---',
      "// import Old from './Old.astro';",
      "/* import Older from './Older.astro'; */",
      "import Current from './Current.astro';",
      '---',
      '<div />'
    ].join('\n');

    expect(extractAstroImportSpecifiers(source)).toEqual(['./Current.astro']);
  });

  test('returns nothing for components without frontmatter', () => {
    expect(extractAstroImportSpecifiers('<div>Hello</div>')).toEqual([]);
  });

  test('deduplicates repeated specifiers', () => {
    const source = [
      '---',
      "import A from './Child.astro';",
      "const B = await import('./Child.astro');",
      '---'
    ].join('\n');

    expect(extractAstroImportSpecifiers(source)).toEqual(['./Child.astro']);
  });
});
