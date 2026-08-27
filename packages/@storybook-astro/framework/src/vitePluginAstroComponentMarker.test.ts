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
  transform: (code: string, id: string) => Promise<{ code: string } | null>;
};

function createPlugin(
  command: 'serve' | 'build' = 'serve',
  options?: Parameters<typeof vitePluginAstroComponentMarker>[0]
) {
  const plugin = vitePluginAstroComponentMarker(options) as unknown as TransformablePlugin;

  plugin.configResolved({ command });

  return plugin;
}

describe('vitePluginAstroComponentMarker transform', () => {
  test('ignores non-astro modules and non-stub code', async () => {
    const plugin = createPlugin();

    expect(await plugin.transform(ASTRO6_CLIENT_STUB, '/some/module.ts')).toBeNull();
    expect(await plugin.transform('export default {};', '/some/Component.astro')).toBeNull();
  });

  test('replaces the stub with a marked component factory', async () => {
    const filePath = writeAstroFile('Plain.astro', '<div>Hello</div>');
    const plugin = createPlugin();
    const result = await plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    expect(result?.code).toContain('isAstroComponentFactory = true');
    expect(result?.code).toContain(JSON.stringify(filePath));
  });

  // Server-mode snapshots need every client-imported .astro id, not just story
  // components (docs/specs/decorators.md#static-prerender, Gap B) — vitePluginAstroBuildServer
  // collects them through this callback.
  test('reports every marked module id via onClientAstroModuleId', async () => {
    const filePath = writeAstroFile('Wrapper.astro', '<div><slot /></div>');
    const seenModuleIds: string[] = [];
    const plugin = createPlugin('serve', {
      onClientAstroModuleId: (moduleId) => seenModuleIds.push(moduleId)
    });

    await plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    expect(seenModuleIds).toEqual([filePath]);
  });

  test('does not report modules that are not the Astro browser stub', async () => {
    const filePath = writeAstroFile('Untouched.astro', '<div>Hello</div>');
    const seenModuleIds: string[] = [];
    const plugin = createPlugin('serve', {
      onClientAstroModuleId: (moduleId) => seenModuleIds.push(moduleId)
    });

    await plugin.transform('export default {};', filePath);

    expect(seenModuleIds).toEqual([]);
  });

  test('inlines CSS for own <style> blocks in dev mode (hybrid approach)', async () => {
    const filePath = writeAstroFile(
      'Styled.astro',
      '<div class="a">Hi</div>\n<style>.a { color: red; }</style>'
    );
    const plugin = createPlugin();
    const result = await plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    // Dev mode uses inline CSS instead of sub-module imports to avoid Astro cache issues
    expect(result?.code).toContain('.a { color: red; }');
    expect(result?.code).toContain('data-astro-dev');
  });

  test('unwraps :global() selectors so the CSS is valid in the browser', async () => {
    const filePath = writeAstroFile(
      'Global.astro',
      '<div class="wrap"><slot /></div>\n<style>.wrap > :global(img) { width: 100%; }</style>'
    );
    const plugin = createPlugin();
    const result = await plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    expect(result?.code).toContain('.wrap > img { width: 100%; }');
    expect(result?.code).not.toContain(':global(');
  });

  test('skips preprocessed <style lang="..."> blocks with a console warning in dev mode', async () => {
    const filePath = writeAstroFile(
      'Scss.astro',
      '<div class="a">Hi</div>\n<style lang="scss">.a { .b { color: red; } }</style>'
    );
    const plugin = createPlugin();
    const result = await plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    // The raw SCSS source must not be injected as a stylesheet.
    expect(result?.code).not.toContain('document.createElement');
    expect(result?.code).toContain('console.warn');
    expect(result?.code).toContain('scss');
  });

  test('dedupes injected styles so repeated module evaluation does not pile up', async () => {
    const filePath = writeAstroFile(
      'Dedupe.astro',
      '<div class="a">Hi</div>\n<style>.a { color: red; }</style>'
    );
    const plugin = createPlugin();
    const result = await plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    // The injection snippet bails out if a style with the same marker already exists.
    expect(result?.code).toContain("getAttribute");
    expect(result?.code).toContain('data-astro-dev');
  });

  test('re-imports child .astro components so their scoped styles load in dev mode', async () => {
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
    const result = await plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    expect(result?.code).toContain(`import "./Child.astro";`);
    expect(result?.code).toContain(`import "@components/Other.astro";`);
  });

  test('inlines CSS from the component and its children in build mode', async () => {
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
    const result = await plugin.transform(ASTRO6_CLIENT_STUB, parentPath);

    expect(result?.code).toContain('.parent { padding: 16px; }');
    expect(result?.code).toContain('.child { color: red; }');
  });

  test('unwraps :global() selectors in build mode too', async () => {
    const filePath = writeAstroFile(
      'build/Global.astro',
      '<div class="wrap"><slot /></div>\n<style>.wrap :global(img) { width: 100%; }</style>'
    );
    const plugin = createPlugin('build');
    const result = await plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    expect(result?.code).toContain('.wrap img { width: 100%; }');
    expect(result?.code).not.toContain(':global(');
  });

  test('handles circular child imports in build mode without recursing forever', async () => {
    const aPath = writeAstroFile(
      'cycle/A.astro',
      "---\nimport B from './B.astro';\n---\n<B />\n<style>.a { color: blue; }</style>"
    );

    writeAstroFile(
      'cycle/B.astro',
      "---\nimport A from './A.astro';\n---\n<A />\n<style>.b { color: green; }</style>"
    );

    const plugin = createPlugin('build');
    const result = await plugin.transform(ASTRO6_CLIENT_STUB, aPath);

    expect(result?.code).toContain('.a { color: blue; }');
    expect(result?.code).toContain('.b { color: green; }');
  });
});

describe('extractAstroImportSpecifiers', () => {
  test('finds default, side-effect, and dynamic .astro imports in the frontmatter', async () => {
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

  test('ignores commented-out imports', async () => {
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

  test('returns nothing for components without frontmatter', async () => {
    expect(extractAstroImportSpecifiers('<div>Hello</div>')).toEqual([]);
  });

  test('deduplicates repeated specifiers', async () => {
    const source = [
      '---',
      "import A from './Child.astro';",
      "const B = await import('./Child.astro');",
      '---'
    ].join('\n');

    expect(extractAstroImportSpecifiers(source)).toEqual(['./Child.astro']);
  });
});

describe('component documentation rides along on the stub', () => {
  /** Stands in for the real extractor; this test is about the wiring. */
  function fakeDocgen(info: unknown) {
    return {
      warmUp: async () => {},
      extract: async () => info,
      invalidate: () => {},
      dispose: () => {}
    } as unknown as NonNullable<
      Parameters<typeof vitePluginAstroComponentMarker>[0]
    >['docgen'];
  }

  test('attaches __docgenInfo where the renderer reads it', async () => {
    const filePath = writeAstroFile('docgen/Card.astro', '---\ninterface Props {}\n---\n<div />');
    const plugin = createPlugin('serve', {
      docgen: fakeDocgen({ displayName: 'Card', description: 'A card.', props: {} })
    });

    const result = await plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    expect(result?.code).toContain('__astro_component.__docgenInfo =');
    expect(result?.code).toContain('"description":"A card."');
  });

  test('omits the assignment when there is nothing to document', async () => {
    const filePath = writeAstroFile('docgen/Bare.astro', '<div />');
    const plugin = createPlugin('serve', { docgen: fakeDocgen(null) });

    const result = await plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    expect(result?.code).not.toContain('__docgenInfo');
    expect(result?.code).toContain('isAstroComponentFactory = true');
  });

  test('marks the component even with no docgen configured at all', async () => {
    const filePath = writeAstroFile('docgen/NoDocgen.astro', '---\nconst a = 1;\n---\n<div />');
    const plugin = createPlugin();

    const result = await plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    expect(result?.code).toContain('isAstroComponentFactory = true');
    expect(result?.code).not.toContain('__docgenInfo');
  });

  test('an extractor that throws never breaks the transform', async () => {
    const filePath = writeAstroFile('docgen/Throws.astro', '---\nconst a = 1;\n---\n<div />');
    const plugin = createPlugin('serve', {
      docgen: {
        warmUp: async () => {},
        extract: async () => {
          throw new Error('type checker exploded');
        },
        invalidate: () => {},
        dispose: () => {}
      } as unknown as NonNullable<
        Parameters<typeof vitePluginAstroComponentMarker>[0]
      >['docgen']
    });

    const result = await plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    expect(result?.code).toContain('isAstroComponentFactory = true');
  });
});
