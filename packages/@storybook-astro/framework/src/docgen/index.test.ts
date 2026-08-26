import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, test } from 'vitest';
import { createAstroDocgen } from './index.ts';

// Inside the package so `astro/types` resolves by walking up, matching the
// existing .vitest-*-fixture-* convention.
const packageDir = fileURLToPath(new URL('../..', import.meta.url));
const projectRoot = mkdtempSync(join(packageDir, '.vitest-docgen-fixture-'));

afterAll(() => rmSync(projectRoot, { recursive: true, force: true }));

const CARD = [
  '---',
  '/** A card. */',
  'interface Props {',
  '  /** Heading. */',
  '  title?: string;',
  '}',
  "const { title = 'Hello' } = Astro.props;",
  '---',
  '<h1>{title}</h1>'
].join('\n');

function createDocgen(overrides: Partial<Parameters<typeof createAstroDocgen>[0]> = {}) {
  const warnings: string[] = [];
  const docgen = createAstroDocgen({
    projectRoot,
    warn: (message) => warnings.push(message),
    ...overrides
  });

  return { docgen, warnings };
}

describe('extraction through the runtime', () => {
  test('reads a component end to end', async () => {
    const { docgen } = createDocgen();
    const result = await docgen.extract(join(projectRoot, 'Card.astro'), CARD);

    expect(result?.displayName).toBe('Card');
    expect(result?.description).toBe('A card.');
    expect(result?.props.title.defaultValue).toEqual({ value: 'Hello' });

    docgen.dispose();
  });

  test('a component with no frontmatter yields nothing', async () => {
    const { docgen } = createDocgen();

    expect(await docgen.extract(join(projectRoot, 'Plain.astro'), '<p>hi</p>')).toBeNull();

    docgen.dispose();
  });
});

describe('results are cached by content', () => {
  test('the same source is not re-extracted', async () => {
    const { docgen } = createDocgen();
    const path = join(projectRoot, 'Cached.astro');

    const first = await docgen.extract(path, CARD);
    const second = await docgen.extract(path, CARD);

    expect(second).toBe(first);

    docgen.dispose();
  });

  test('edited source is re-extracted', async () => {
    const { docgen } = createDocgen();
    const path = join(projectRoot, 'Edited.astro');

    await docgen.extract(path, CARD);
    const edited = await docgen.extract(path, CARD.replace('Heading.', 'Changed.'));

    expect(edited?.props.title.description).toBe('Changed.');

    docgen.dispose();
  });

  test('a component with nothing to extract is not retried on every tick', async () => {
    const { docgen } = createDocgen();
    const path = join(projectRoot, 'Empty.astro');

    const first = await docgen.extract(path, '<p>hi</p>');
    const second = await docgen.extract(path, '<p>hi</p>');

    expect(first).toBeNull();
    expect(second).toBeNull();

    docgen.dispose();
  });
});

describe('the project tsconfig is honoured', () => {
  test('path aliases declared by the project resolve', async () => {
    writeFileSync(
      join(projectRoot, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: { '@shared/*': ['./shared/*'] },
          moduleResolution: 'Bundler',
          module: 'ESNext',
          target: 'ESNext'
        }
      })
    );
    writeFileSync(
      join(projectRoot, 'shared-types.ts'),
      'export interface Shared {\n  /** Via a path alias. */\n  aliased?: string;\n}\n'
    );

    const { docgen } = createDocgen();
    const source = [
      '---',
      "import type { Shared } from '@shared/../shared-types.ts';",
      'interface Props extends Shared {}',
      'const { aliased } = Astro.props;',
      '---',
      '<div />'
    ].join('\n');

    const result = await docgen.extract(join(projectRoot, 'Aliased.astro'), source);

    expect(result?.props.aliased?.description).toBe('Via a path alias.');

    docgen.dispose();
  });
});

describe('failures never take rendering down', () => {
  test('an unreadable tsconfig warns once and still extracts', async () => {
    const badRoot = mkdtempSync(join(packageDir, '.vitest-docgen-fixture-'));

    writeFileSync(
      join(badRoot, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { target: 'not-a-real-target' } })
    );

    const { docgen, warnings } = createDocgen({ projectRoot: badRoot });
    const result = await docgen.extract(join(badRoot, 'Card.astro'), CARD);

    expect(result?.props.title).toBeDefined();
    expect(warnings.some((message) => message.includes('tsconfig.json'))).toBe(true);

    docgen.dispose();
    rmSync(badRoot, { recursive: true, force: true });
  });

  test('warming up before any extraction is safe', async () => {
    const { docgen } = createDocgen();

    await expect(docgen.warmUp()).resolves.toBeUndefined();

    docgen.dispose();
  });
});

describe('what reaches the browser bundle', () => {
  test('declaring paths are project-relative, not absolute machine paths', async () => {
    writeFileSync(
      join(projectRoot, 'trim-types.ts'),
      'export interface Trimmed {\n  /** Declared elsewhere. */\n  elsewhere?: string;\n}\n'
    );

    const { docgen } = createDocgen();
    const source = [
      '---',
      "import type { Trimmed } from './trim-types.ts';",
      'interface Props extends Trimmed {}',
      'const { elsewhere } = Astro.props;',
      '---',
      '<div />'
    ].join('\n');

    const result = await docgen.extract(join(projectRoot, 'Trim.astro'), source);
    const parentFile = result?.props.elsewhere?.parent?.fileName ?? '';

    // A published static Storybook is public; whoever built it shouldn't be
    // shipping their home directory in it.
    expect(parentFile).toBe('trim-types.ts');
    expect(JSON.stringify(result)).not.toContain(projectRoot);

    docgen.dispose();
  });

  test('a type from a sibling package stays relative rather than absolute', async () => {
    // The monorepo case: the app root is integration/astroN while the component
    // and its types live in packages/components, so the declaring file is above
    // the root. Climbing out with `../` beats shipping a home directory.
    const nestedRoot = join(projectRoot, 'app');

    mkdirSync(nestedRoot, { recursive: true });
    writeFileSync(
      join(projectRoot, 'outside-types.ts'),
      'export interface Outside {\n  /** Declared above the app root. */\n  outer?: string;\n}\n'
    );

    const { docgen } = createDocgen({ projectRoot: nestedRoot });
    const source = [
      '---',
      "import type { Outside } from '../outside-types.ts';",
      'interface Props extends Outside {}',
      'const { outer } = Astro.props;',
      '---',
      '<div />'
    ].join('\n');

    const result = await docgen.extract(join(nestedRoot, 'Nested.astro'), source);

    expect(result?.props.outer?.parent?.fileName).toBe('../outside-types.ts');
    expect(JSON.stringify(result)).not.toContain(packageDir);

    docgen.dispose();
  });

  test('server-only declaration data is not shipped', async () => {
    const { docgen } = createDocgen();
    const result = await docgen.extract(join(projectRoot, 'NoDecls.astro'), CARD);

    expect(result?.props.title).toBeDefined();
    expect(JSON.stringify(result)).not.toContain('declarations');

    docgen.dispose();
  });

  test('an optional literal union still becomes a select control under strict', async () => {
    writeFileSync(
      join(projectRoot, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: true, moduleResolution: 'Bundler' } })
    );

    const { docgen } = createDocgen();
    const source = [
      '---',
      "type Tone = 'solid' | 'outline';",
      'interface Props {',
      '  /** Visual treatment. */',
      '  tone?: Tone;',
      '}',
      "const { tone = 'solid' } = Astro.props;",
      '---',
      '<div />'
    ].join('\n');

    const result = await docgen.extract(join(projectRoot, 'Strict.astro'), source);

    // Under `strict` an optional prop's type includes `undefined`, which would
    // otherwise disqualify most real unions from becoming a select.
    expect(result?.props.tone.type.name).toBe('enum');
    expect(result?.props.tone.type.value?.map((each) => each.value)).toEqual([
      '"solid"',
      '"outline"'
    ]);

    docgen.dispose();
  });
});
