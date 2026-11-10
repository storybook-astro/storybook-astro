import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IndexEntry } from 'storybook/internal/types';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildStoryDocsPayload } from './story-docs-payload.ts';

// Inside the package, matching the existing .vitest-*-fixture-* convention.
const packageDir = fileURLToPath(new URL('../..', import.meta.url));
const workingDir = mkdtempSync(join(packageDir, '.vitest-story-docs-fixture-'));

const write = (name: string, lines: string[]) =>
  writeFileSync(join(workingDir, name), lines.join('\n'));

beforeAll(() => {
  write('Button.astro', ['---', 'const { variant } = Astro.props;', '---', '<button><slot /></button>']);

  write('Button.stories.jsx', [
    "import Button from './Button.astro';",
    '',
    "const shared = { size: 'lg' };",
    '',
    'export default {',
    "  title: 'Astro/Button',",
    '  component: Button,',
    "  args: { variant: 'solid' }",
    '};',
    '',
    'export const Default = {',
    "  parameters: { docs: { description: { story: 'Default solid button.' } } },",
    "  args: { slots: { default: 'Click me' } }",
    '};',
    '',
    '/** Outline variant at large size. */',
    'export const Outline = {',
    "  args: { ...shared, variant: 'outline', items: [1, 2], slots: { default: 'Read the docs' } }",
    '};',
    '',
    'export const Labelled = {',
    "  name: 'With a label',",
    "  args: { 'slot-default': 'Labelled', onClick: () => {} }",
    '};'
  ]);

  write('Unreadable.stories.jsx', [
    "import Button from './Button.astro';",
    "import { theme } from './theme.js';",
    '',
    'export default {',
    "  title: 'Astro/Unreadable',",
    '  component: Button',
    '};',
    '',
    'export const FromCall = { args: { variant: theme() } };',
    '',
    "export const Delegated = { parameters: { renderer: 'react' }, args: { variant: 'solid' } };"
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

const build = (importPath: string, title: string) =>
  buildStoryDocsPayload({ entry: storyEntry(importPath, title) }, { workingDir });

describe('an Astro stories file', () => {
  test('gives each story the Astro snippet Show code prints for it', async () => {
    const payload = await build('Button.stories.jsx', 'Astro/Button');

    expect(payload).toMatchObject({ id: 'astro-button', name: 'Button', path: './Button.stories.jsx' });
    // Self-contained: core would put an `import` outside the frontmatter.
    expect(payload).not.toHaveProperty('import');
    expect(Object.keys(payload!.stories)).toEqual([
      'astro-button--default',
      'astro-button--outline',
      'astro-button--labelled'
    ]);

    expect(payload!.stories['astro-button--default']).toEqual({
      id: 'astro-button--default',
      name: 'Default',
      description: 'Default solid button.',
      snippet: [
        '---',
        "import Button from './Button.astro';",
        '---',
        '<Button variant="solid">',
        '  Click me',
        '</Button>'
      ].join('\n')
    });
  });

  test('merges meta args, follows spreads and hoists object props as Show code does', async () => {
    const payload = await build('Button.stories.jsx', 'Astro/Button');
    const outline = payload!.stories['astro-button--outline'];

    expect(outline.description).toBe('Outline variant at large size.');
    expect(outline.snippet).toBe(
      [
        '---',
        "import Button from './Button.astro';",
        '',
        'const items = [',
        '  1,',
        '  2',
        '];',
        '---',
        '<Button items={items} size="lg" variant="outline">',
        '  Read the docs',
        '</Button>'
      ].join('\n')
    );
  });

  test('keeps a story name, reads a per-slot arg and leaves out functions', async () => {
    const payload = await build('Button.stories.jsx', 'Astro/Button');

    expect(payload!.stories['astro-button--labelled']).toMatchObject({
      name: 'With a label',
      snippet: expect.stringContaining('<Button variant="solid">\n  Labelled\n</Button>')
    });
  });

  test('warns instead of guessing when an arg cannot be read statically', async () => {
    const payload = await build('Unreadable.stories.jsx', 'Astro/Unreadable');
    const story = payload!.stories['astro-unreadable--from-call'];

    expect(story.snippet).toBeUndefined();
    expect(story.warning).toContain('theme()');
  });

  test('has no Astro snippet for a story delegated to a framework renderer', async () => {
    const payload = await build('Unreadable.stories.jsx', 'Astro/Unreadable');
    const story = payload!.stories['astro-unreadable--delegated'];

    expect(story.snippet).toBeUndefined();
    expect(story.warning).toContain('react');
  });
});

describe('a stories file this provider leaves to the next one', () => {
  test('documents a component that is not .astro', async () => {
    expect(await build('Widget.stories.jsx', 'React/Widget')).toBeUndefined();
  });

  test('no longer exists', async () => {
    expect(await build('Gone.stories.jsx', 'Astro/Gone')).toBeUndefined();
  });
});
