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

  write('Options.stories.jsx', [
    "import Button from './Button.astro';",
    '',
    'export default {',
    "  title: 'Astro/Options',",
    '  component: Button,',
    "  args: { 'slot-default': 'Fallback' }",
    '};',
    '',
    "export const SlotsArg = { args: { slots: { default: 'Real content' } } };",
    '',
    'export const InlineObjects = {',
    "  parameters: { docs: { source: { objectProps: 'inline' } } },",
    '  args: { items: [1, 2] }',
    '};',
    '',
    '/** From the JSDoc. */',
    'export const BothDescriptions = {',
    "  parameters: { docs: { description: { story: 'From the parameter.' } } }",
    '};',
    '',
    'export const HandWritten = {',
    "  parameters: { docs: { source: { code: '<Button>Hand-written</Button>' } } }",
    '};',
    '',
    'export const CsfSource = {',
    "  parameters: { docs: { source: { type: 'code' } } }",
    '};'
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

  test('keeps a story name and leaves out functions', async () => {
    const payload = await build('Button.stories.jsx', 'Astro/Button');

    // An unedited `slot-<name>` arg defers to `args.slots`, as in Show code
    // and the canvas, so a story that sets only the per-slot arg fills no slot.
    expect(payload!.stories['astro-button--labelled']).toMatchObject({
      name: 'With a label',
      snippet: expect.stringContaining('<Button variant="solid" />')
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

describe('the options Show code reads', () => {
  test('args.slots wins over a meta slot-<name> arg nobody edited', async () => {
    const payload = await build('Options.stories.jsx', 'Astro/Options');
    const snippet = payload!.stories['astro-options--slots-arg'].snippet;

    expect(snippet).toContain('Real content');
    expect(snippet).not.toContain('Fallback');
  });

  test('a story that sets objectProps: inline gets its object props inline', async () => {
    const payload = await build('Options.stories.jsx', 'Astro/Options');
    const snippet = payload!.stories['astro-options--inline-objects'].snippet;

    expect(snippet).toContain('items={[');
    expect(snippet).not.toContain('const items');
  });

  test('parameters.docs.description.story wins over the JSDoc, as on the Docs page', async () => {
    const payload = await build('Options.stories.jsx', 'Astro/Options');

    expect(payload!.stories['astro-options--both-descriptions'].description).toBe('From the parameter.');
  });

  test('a hand-written docs.source.code is the snippet', async () => {
    const payload = await build('Options.stories.jsx', 'Astro/Options');

    expect(payload!.stories['astro-options--hand-written']).toMatchObject({
      snippet: '<Button>Hand-written</Button>'
    });
    expect(payload!.stories['astro-options--hand-written'].warning).toBeUndefined();
  });

  test("docs.source.type: 'code' without code gets no snippet and no warning", async () => {
    const payload = await build('Options.stories.jsx', 'Astro/Options');
    const story = payload!.stories['astro-options--csf-source'];

    expect(story.snippet).toBeUndefined();
    expect(story.warning).toBeUndefined();
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
