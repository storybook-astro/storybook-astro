import { describe, expect, test } from 'vitest';
import { resolveStoryTree } from './storyTree.ts';

// What a render page imports: the components of one story file, by module id.
const Card = Object.assign(() => '', { isAstroComponentFactory: true });
const Badge = Object.assign(() => '', { isAstroComponentFactory: true });
const Wrapper = Object.assign(() => '', { isAstroComponentFactory: true });
const components = { '/src/Card.astro': Card, '/src/Badge.astro': Badge, '/src/Wrapper.astro': Wrapper };

/** The marker the preview sends for an Astro component. */
function marker(moduleId: string) {
  return { __astroComponent: true, moduleId };
}

describe('resolveStoryTree', () => {
  test('a story renders its component with its args and slots', async () => {
    const tree = await resolveStoryTree(
      { component: '/src/Card.astro', args: { title: 'Hello' }, slots: { default: '<p>Body</p>' } },
      components
    );

    expect(tree).toEqual({ Component: Card, props: { title: 'Hello' }, slots: { default: '<p>Body</p>' } });
  });

  test('a component passed as a slot stays a component, so Astro renders its styles and islands', async () => {
    const tree = await resolveStoryTree(
      {
        component: '/src/Card.astro',
        slots: {
          default: ['<p>Before</p>', { component: marker('/src/Badge.astro'), props: { label: 'New' } }]
        }
      },
      components
    );

    expect(tree).toEqual({
      Component: Card,
      props: {},
      slots: { default: ['<p>Before</p>', { Component: Badge, props: { label: 'New' }, slots: {} }] }
    });
  });

  test('a component passed as an arg arrives as the component itself', async () => {
    const tree = await resolveStoryTree(
      { component: '/src/Card.astro', args: { icon: marker('/src/Badge.astro') } },
      components
    );

    expect(tree).toMatchObject({ props: { icon: Badge } });
  });

  test('decorators wrap the story, which keeps its own args', async () => {
    const tree = await resolveStoryTree(
      {
        component: '/src/Card.astro',
        args: { title: 'Hello' },
        node: {
          component: marker('/src/Wrapper.astro'),
          props: { theme: 'dark' },
          slots: { default: marker('/src/Card.astro') }
        }
      },
      components
    );

    expect(tree).toEqual({
      Component: Wrapper,
      props: { theme: 'dark' },
      slots: { default: { Component: Card, props: { title: 'Hello' }, slots: {} } }
    });
  });

  test('string slots are sanitized', async () => {
    const tree = await resolveStoryTree(
      { component: '/src/Card.astro', slots: { default: '<p>Safe</p><script>alert(1)</script>' } },
      components
    );

    expect(tree).toMatchObject({ slots: { default: '<p>Safe</p>' } });
  });

  test('a component outside the story file\'s render page fails with how to include it', async () => {
    await expect(
      resolveStoryTree({ component: '/src/Elsewhere.astro' }, components)
    ).rejects.toThrow('Import it in the story file (or .storybook/preview)');
  });
});
