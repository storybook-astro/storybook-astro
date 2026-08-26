import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import typescript from 'typescript';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { extractAstroDocgen } from './extract.ts';
import { createAstroTsProject, type AstroTsProject } from './tsProject.ts';

// The fixture must live inside the package rather than the OS tmpdir, so
// TypeScript can resolve `astro/types` by walking up to the workspace's
// node_modules — the inherited-props cases below depend on it.
const packageDir = fileURLToPath(new URL('../..', import.meta.url));
const projectRoot = mkdtempSync(join(packageDir, '.vitest-docgen-fixture-'));
let project: AstroTsProject;

beforeAll(() => {
  project = createAstroTsProject(
    typescript,
    {
      target: typescript.ScriptTarget.Latest,
      module: typescript.ModuleKind.ESNext,
      moduleResolution: typescript.ModuleResolutionKind.Bundler,
      skipLibCheck: true
    },
    projectRoot
  );
});

afterAll(() => {
  project.dispose();
  rmSync(projectRoot, { recursive: true, force: true });
});

let componentCount = 0;

/** Extracts from real `.astro` source, as the Vite plugin will. */
function docgenFor(astroSource: string, name = `Component${(componentCount += 1)}`) {
  const astroFilePath = join(projectRoot, `${name}.astro`);

  return extractAstroDocgen(typescript, project, astroFilePath, astroSource, {});
}

function astro(frontmatter: string, template = '<div />') {
  return `---\n${frontmatter}\n---\n${template}`;
}

describe('a plain component', () => {
  const docgen = () =>
    docgenFor(
      astro(
        [
          '/**',
          ' * A simple content card.',
          ' */',
          'interface Props {',
          '  /** Card heading text. */',
          '  title?: string;',
          '  /** Applies a highlighted style. */',
          '  highlight?: boolean;',
          '  /** Required, so no default. */',
          '  id: string;',
          '}',
          '',
          "const { title = 'Default title', highlight = false, id } = Astro.props;"
        ].join('\n')
      ),
      'Card'
    );

  test('takes its display name from the file', () => {
    expect(docgen()?.displayName).toBe('Card');
  });

  test('reads the component description', () => {
    expect(docgen()?.description).toBe('A simple content card.');
  });

  test('reads per-prop descriptions from JSDoc', () => {
    expect(docgen()?.props.title.description).toBe('Card heading text.');
  });

  test('reads defaults from the Astro.props destructuring', () => {
    const props = docgen()!.props;

    expect(props.title.defaultValue).toEqual({ value: 'Default title' });
    expect(props.highlight.defaultValue).toEqual({ value: false });
  });

  test('a prop with a default is not required', () => {
    expect(docgen()?.props.title.required).toBe(false);
  });

  test('a non-optional prop with no default is required', () => {
    expect(docgen()?.props.id.required).toBe(true);
  });

  test('strips the redundant undefined from optional prop types', () => {
    expect(docgen()?.props.title.type.name).toBe('string');
  });
});

describe('literal unions drive select controls', () => {
  test('constituents are surfaced as enum options', () => {
    const docgen = docgenFor(
      astro(
        [
          "type Framework = 'react' | 'vue' | 'svelte';",
          'interface Props { framework?: Framework }',
          "const { framework = 'react' } = Astro.props;"
        ].join('\n')
      )
    );

    expect(docgen?.props.framework.type.name).toBe('enum');
    expect(docgen?.props.framework.type.value?.map((each) => each.value)).toEqual([
      '"react"',
      '"vue"',
      '"svelte"'
    ]);
  });
});

describe('a Props imported from a sibling module', () => {
  test('resolves, because the virtual file sits beside the component', () => {
    writeFileSync(
      join(projectRoot, 'shared-props.ts'),
      'export interface CardProps {\n  /** From a sibling file. */\n  heading?: string;\n}\n'
    );

    const docgen = docgenFor(
      astro(
        [
          "import type { CardProps } from './shared-props.ts';",
          'interface Props extends CardProps {}',
          'const { heading } = Astro.props;'
        ].join('\n')
      )
    );

    expect(docgen?.props.heading?.description).toBe('From a sibling file.');
  });
});

describe('the component from issue #110', () => {
  // `interface Props<Tag> extends Polymorphic<…>` is a hard TS2312: TypeScript
  // drops the whole base type, leaving only the inline members.
  const source = astro(
    [
      "import type { HTMLTag, Polymorphic } from 'astro/types';",
      '',
      '/**',
      ' * @component Button',
      ' * @description Semantic button for actions and navigation.',
      ' * @usage Some markdown that should not land in the description.',
      ' */',
      "type ButtonVariants = { variant?: 'solid' | 'outline' };",
      '',
      "interface Props<Tag extends HTMLTag = 'button' | 'a'>",
      '  extends Polymorphic<{ as: Tag } & ButtonVariants> {',
      '  /** Disables interaction. */',
      '  disabled?: boolean;',
      '}',
      '',
      "const { as: Tag = 'button', variant = 'solid', disabled = false, href, class: className } =",
      '  Astro.props as Props;'
    ].join('\n'),
    '<Tag />'
  );

  test('recovers inherited props the heritage clause would have dropped', () => {
    const props = docgenFor(source, 'Button')!.props;

    expect(Object.keys(props)).toContain('variant');
    expect(Object.keys(props)).toContain('as');
  });

  test('keeps destructured props whose types come from node_modules', () => {
    const props = docgenFor(source, 'Button')!.props;

    // `href` and `class` are declared in astro-jsx.d.ts, not the component.
    expect(Object.keys(props)).toContain('href');
    expect(Object.keys(props)).toContain('class');
  });

  test('a prop shared by every constituent keeps its full type', () => {
    // `as` must offer both tags. Probing only the constituents in turn would
    // narrow it to whichever was read first.
    const { as: polymorphicTag } = docgenFor(source, 'Button')!.props;

    expect(polymorphicTag.type.value?.map((each) => each.value).sort()).toEqual([
      '"a"',
      '"button"'
    ]);
  });

  test('filters the inherited DOM attribute flood down to a readable table', () => {
    const props = docgenFor(source, 'Button')!.props;

    expect(Object.keys(props).length).toBeLessThan(20);
    expect(props.disabled.description).toBe('Disables interaction.');
  });

  test('uses @description for the description and keeps other tags out of it', () => {
    const docgen = docgenFor(source, 'Button')!;

    expect(docgen.description).toBe('Semantic button for actions and navigation.');
    expect(docgen.description).not.toContain('markdown');
    expect(docgen.tags?.usage).toContain('markdown');
  });
});

describe('components do not leak props into each other', () => {
  // Frontmatter with no import or export is a global script, so `Props` is a
  // *global* declaration — and every component shares one TypeScript program.
  // Two plain components would otherwise collide and the first would win.
  const plain = (prop: string, doc: string) =>
    astro(
      [
        'interface Props {',
        `  /** ${doc} */`,
        `  ${prop}?: string;`,
        '}',
        `const { ${prop} } = Astro.props;`
      ].join('\n')
    );

  test('two components with no imports each keep their own props', () => {
    const first = docgenFor(plain('alpha', 'Belongs to Alpha.'), 'Alpha');
    const second = docgenFor(plain('beta', 'Belongs to Beta.'), 'Beta');

    expect(Object.keys(first!.props)).toEqual(['alpha']);
    expect(Object.keys(second!.props)).toEqual(['beta']);
    expect(second!.props.beta.description).toBe('Belongs to Beta.');
  });

  test('a component with imports does not absorb a plain one', () => {
    docgenFor(plain('gamma', 'Belongs to Gamma.'), 'Gamma');

    const withImport = docgenFor(
      astro(
        [
          "import type { HTMLTag } from 'astro/types';",
          'interface Props {',
          '  /** Belongs to Delta. */',
          '  delta?: HTMLTag;',
          '}',
          'const { delta } = Astro.props;'
        ].join('\n')
      ),
      'Delta'
    );

    expect(Object.keys(withImport!.props)).toEqual(['delta']);
  });
});

describe('description precedence', () => {
  test('a leading block still counts when an import follows it', () => {
    // Astro frontmatter puts imports first, so a component description written
    // at the top of the file lands on one. PageCard.astro is shaped this way.
    const docgen = docgenFor(
      astro(
        [
          '/** Renders a page card. */',
          "import type { HTMLTag } from 'astro/types';",
          'interface Props { a?: HTMLTag }',
          'const { a } = Astro.props;'
        ].join('\n')
      )
    );

    expect(docgen?.description).toBe('Renders a page card.');
  });

  test('a JSDoc buried mid-file is not mistaken for the description', () => {
    const docgen = docgenFor(
      astro(
        [
          "import type { HTMLTag } from 'astro/types';",
          '/** A helper, not the component. */',
          'const helper = 1;',
          'interface Props { a?: HTMLTag }',
          'const { a } = Astro.props;'
        ].join('\n')
      )
    );

    expect(docgen?.description).toBe('');
  });

  test('falls back to the JSDoc on the Props declaration', () => {
    const docgen = docgenFor(
      astro(
        [
          '/** Public props for the widget. */',
          'interface Props { a?: string }',
          'const { a } = Astro.props;'
        ].join('\n')
      )
    );

    expect(docgen?.description).toBe('Public props for the widget.');
  });
});

describe('components with nothing to extract still behave', () => {
  test('no frontmatter yields no docgen at all', () => {
    expect(docgenFor('<p>markup only</p>')).toBeNull();
  });

  test('no Props still yields the description, which is the point for slot-only components', () => {
    const docgen = docgenFor(
      astro(['/**', ' * Wraps its children.', ' */', 'const a = 1;'].join('\n'), '<slot />')
    );

    expect(docgen?.description).toBe('Wraps its children.');
    expect(docgen?.props).toEqual({});
  });

  test('a type error does not stop extraction of the props that do resolve', () => {
    const docgen = docgenFor(
      astro(
        [
          "import { missing } from './does-not-exist.ts';",
          'interface Props {',
          '  /** Still readable. */',
          '  title?: string;',
          '}',
          'const { title } = Astro.props;'
        ].join('\n')
      )
    );

    expect(docgen?.props.title.description).toBe('Still readable.');
  });
});
