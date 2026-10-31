import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import {
  extractAstroImportSpecifiers,
  extractStylesheetImportSpecifiers,
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

  test.each(['serve', 'build'] as const)(
    'leaves raw <style> source out of the stub (%s)',
    async (command) => {
      // Scoped CSS ships with the server-rendered HTML instead (issue #189).
      const filePath = writeAstroFile(
        `${command}/Styled.astro`,
        '<div class="a">Hi</div>\n<style>.a { color: red; }</style>'
      );
      const plugin = createPlugin(command);
      const result = await plugin.transform(ASTRO6_CLIENT_STUB, filePath);

      expect(result?.code).not.toContain('color: red');
      expect(result?.code).not.toContain('document.createElement');
    }
  );

  const parentSource = [
    '---',
    "import Child from './Child.astro';",
    "import Aliased from '@components/Other.astro';",
    '---',
    '<div class="parent"><Child /><Aliased /></div>'
  ].join('\n');

  test('re-imports child .astro components in dev mode so editing a child reruns the story', async () => {
    const filePath = writeAstroFile('Parent.astro', parentSource);
    const plugin = createPlugin();
    const result = await plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    expect(result?.code).toContain(`import "./Child.astro";`);
    expect(result?.code).toContain(`import "@components/Other.astro";`);
  });

  // Without this, editing a frontmatter stylesheet leaves the story's shipped
  // copy stale until a reload (issue #229). `?raw` keeps the CSS from being
  // injected a second time, and unlike `?url` Vite accepts it for CSS Modules.
  test('re-imports frontmatter stylesheets as raw text in dev mode so editing one reruns the story', async () => {
    const filePath = writeAstroFile(
      'StyledParent.astro',
      ['---', "import './card.css';", "import styles from './card.module.css';", '---', '<div />'].join('\n')
    );
    const plugin = createPlugin();
    const result = await plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    expect(result?.code).toContain(`import "./card.css?raw";`);
    expect(result?.code).toContain(`import "./card.module.css?raw";`);
    expect(result?.code).not.toContain(`import "./card.css";`);
  });

  test('does not re-import child components in build mode', async () => {
    const filePath = writeAstroFile('build/Parent.astro', parentSource);
    const plugin = createPlugin('build');
    const result = await plugin.transform(ASTRO6_CLIENT_STUB, filePath);

    expect(result?.code).not.toContain('Child.astro');
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

describe('extractStylesheetImportSpecifiers', () => {
  test('finds plain, CSS Module, and preprocessor stylesheet imports', () => {
    const source = [
      '---',
      "import './card.css';",
      "import styles from './x.module.css';",
      "import './y.scss';",
      "import Child from './Child.astro';",
      '---',
      '<div />'
    ].join('\n');

    expect(extractStylesheetImportSpecifiers(source)).toEqual([
      './card.css',
      './x.module.css',
      './y.scss'
    ]);
  });

  test('skips commented-out imports and imports with a query', () => {
    const source = [
      '---',
      "// import './old.css';",
      "/* import './older.css'; */",
      "import cssUrl from './linked.css?url';",
      "import raw from './raw.css?raw';",
      "import './current.css';",
      '---',
      '<div />'
    ].join('\n');

    expect(extractStylesheetImportSpecifiers(source)).toEqual(['./current.css']);
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
