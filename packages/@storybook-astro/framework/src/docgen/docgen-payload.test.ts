import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IndexEntry } from 'storybook/internal/types';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildDocgenPayload, type DocgenSource } from './docgen-payload.ts';
import { createAstroDocgen } from './index.ts';
import type { AstroDocgenInfo } from './types.ts';

// Inside the package so `astro/types` resolves by walking up, matching the
// existing .vitest-*-fixture-* convention.
const packageDir = fileURLToPath(new URL('../..', import.meta.url));
const workingDir = mkdtempSync(join(packageDir, '.vitest-payload-fixture-'));

const write = (name: string, lines: string[]) =>
  writeFileSync(join(workingDir, name), lines.join('\n'));

beforeAll(() => {
  write('Card.astro', [
    '---',
    '/**',
    ' * A card that holds a heading.',
    ' * @deprecated use Panel instead',
    ' */',
    'interface Props {',
    '  /** Heading text. */',
    '  title?: string;',
    '}',
    "const { title = 'Hello' } = Astro.props;",
    '---',
    '<h1>{title}</h1>'
  ]);

  write('Card.stories.jsx', [
    "import Card from './Card.astro';",
    '',
    'export default {',
    "  title: 'Astro/Card',",
    '  component: Card',
    '};',
    '',
    'export const Default = {};'
  ]);

  write('Renamed.stories.jsx', [
    "import TheCard from './Card.astro';",
    '',
    '/** The story file has the last word on the description. */',
    'export default {',
    "  title: 'Astro/Renamed',",
    '  component: TheCard',
    '};',
    '',
    'export const Default = {};'
  ]);

  write('Widget.tsx', ['export const Widget = () => null;']);

  write('Widget.stories.jsx', [
    "import { Widget } from './Widget.tsx';",
    '',
    'export default {',
    "  title: 'React/Widget',",
    '  component: Widget',
    '};',
    '',
    'export const Default = {};'
  ]);

  write('Nameless.stories.jsx', [
    'export default {',
    "  title: 'Astro/Nameless'",
    '};',
    '',
    'export const Default = { render: () => null };'
  ]);

  write('Broken.stories.jsx', ['export default { title: "Astro/Broken", component: ((( };']);
});

afterAll(() => rmSync(workingDir, { recursive: true, force: true }));

function storyEntry(importPath: string, title: string): IndexEntry {
  return {
    type: 'story',
    subtype: 'story',
    id: `${title.toLowerCase().replace(/\W+/g, '-')}--default`,
    name: 'Default',
    title,
    importPath: `./${importPath}`
  } as IndexEntry;
}

/** A stand-in extractor, so the branchy cases don't each warm a TypeScript program. */
function stubSource(info: Partial<AstroDocgenInfo> = {}): DocgenSource & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    async extract(path) {
      calls.push(path);

      return {
        displayName: 'Card',
        description: 'A card that holds a heading.',
        props: {},
        ...info
      };
    }
  };
}

const build = (entry: IndexEntry, docgen: DocgenSource) =>
  buildDocgenPayload({ entry }, { docgen, workingDir });

describe('an Astro story', () => {
  test('reads the real component into a payload', async () => {
    const docgen = createAstroDocgen({ projectRoot: workingDir });
    const payload = await build(storyEntry('Card.stories.jsx', 'Astro/Card'), docgen);

    expect(payload).toMatchObject({
      id: 'astro-card',
      name: 'Card',
      path: './Card.stories.jsx',
      description: 'A card that holds a heading.',
      renderer: 'astro'
    });
    expect(payload?.argTypes?.title).toMatchObject({
      name: 'title',
      description: 'Heading text.',
      // Quoted by docs-tools, which is what renders a string default as a string.
      table: { defaultValue: { summary: '"Hello"' } }
    });

    docgen.dispose();
  });

  test('carries the component JSDoc tags through', async () => {
    const docgen = createAstroDocgen({ projectRoot: workingDir });
    const payload = await build(storyEntry('Card.stories.jsx', 'Astro/Card'), docgen);

    expect(payload?.jsDocTags.deprecated).toEqual(['use Panel instead']);

    docgen.dispose();
  });

  test("names the component after the story file's import", async () => {
    const payload = await build(storyEntry('Renamed.stories.jsx', 'Astro/Renamed'), stubSource());

    expect(payload?.name).toBe('TheCard');
  });

  test("the story meta's own docblock wins over the component description", async () => {
    const payload = await build(storyEntry('Renamed.stories.jsx', 'Astro/Renamed'), stubSource());

    expect(payload?.description).toBe('The story file has the last word on the description.');
  });
});

describe('stories that are not ours', () => {
  test('a framework component is left to its own provider', async () => {
    const docgen = stubSource();
    const payload = await build(storyEntry('Widget.stories.jsx', 'React/Widget'), docgen);

    expect(payload).toBeUndefined();
    // Never opened: a .tsx is not something our extractor can read.
    expect(docgen.calls).toEqual([]);
  });

  test('a story with no meta.component is passed downstream', async () => {
    expect(
      await build(storyEntry('Nameless.stories.jsx', 'Astro/Nameless'), stubSource())
    ).toBeUndefined();
  });

  test('an indexed entry whose file is gone is passed downstream', async () => {
    expect(
      await build(storyEntry('Deleted.stories.jsx', 'Astro/Deleted'), stubSource())
    ).toBeUndefined();
  });

  test('a component that yields no docgen is passed downstream', async () => {
    const empty: DocgenSource = { extract: async () => null };

    expect(await build(storyEntry('Card.stories.jsx', 'Astro/Card'), empty)).toBeUndefined();
  });
});

describe('a story file that will not parse', () => {
  test('is reported on the payload rather than swallowed', async () => {
    const payload = await build(storyEntry('Broken.stories.jsx', 'Astro/Broken'), stubSource());

    expect(payload?.error?.name).toBe('Story file could not be parsed');
    expect(payload?.error?.message).toContain('./Broken.stories.jsx');
    // The name still falls back to the title so the docs page has a heading.
    expect(payload?.name).toBe('Broken');
  });
});
