// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ArgTypesEnhancer, Renderer } from 'storybook/internal/types';
import { slotArgName } from './slotArgs.ts';

vi.mock('astro:scripts/page.js', () => ({}));
vi.mock('virtual:storybook-astro-renderer', () => ({ isStaticMode: true, init: undefined }));
vi.mock('virtual:storybook-renderer-fallback', () => ({}));

const { argTypesEnhancers } = await import('./entry-preview.ts');
const disablePrerenderedControls = argTypesEnhancers.at(-1) as ArgTypesEnhancer<Renderer>;

const Card = Object.assign(() => {}, { isAstroComponentFactory: true });

describe('a pre-rendered Astro story in a static build', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('turns off the control of a slot the story fills with text, with the Docgen Server on', () => {
    // The preview has no `slot-default` argType on this path: the row comes
    // from the docgen payload, and the seeded arg would keep a live control.
    vi.stubGlobal('FEATURES', { docgenServer: true });

    const argTypes = disablePrerenderedControls({
      component: Card,
      argTypes: {},
      initialArgs: { slots: { default: '<p>A</p>' } }
    } as never);

    expect(argTypes[slotArgName('default')]).toEqual({ control: false });
  });

  test('adds no row for a slot the docgen didn\'t find, without the Docgen Server', () => {
    vi.stubGlobal('FEATURES', {});

    const argTypes = disablePrerenderedControls({
      component: Card,
      argTypes: { title: { name: 'title', control: { type: 'text' } } },
      initialArgs: { slots: { aside: '<p>A</p>' } }
    } as never);

    expect(argTypes[slotArgName('aside')]).toBeUndefined();
    expect(argTypes.title.control).toBe(false);
  });
});
