// @vitest-environment happy-dom
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { ArgTypesEnhancer, Renderer } from 'storybook/internal/types';
import { lockNonTextSlotControls, slotArgName } from './slotArgs.ts';

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

  test('turns off the slot rows the preview adds with the Docgen Server on, as on the legacy path', () => {
    // The preview has no `slot-<name>` argTypes on this path until
    // `lockNonTextSlotControls` adds them, so the static-mode loop must run after it.
    vi.stubGlobal('FEATURES', { docgenServer: true });
    expect(argTypesEnhancers.indexOf(lockNonTextSlotControls)).toBe(argTypesEnhancers.length - 2);

    const story = {
      component: Card,
      parameters: { renderer: 'astro' },
      initialArgs: { slots: { default: '<p>A</p>', footer: () => {} } }
    };
    const withSlotRows = lockNonTextSlotControls({ ...story, argTypes: {} } as never);
    const argTypes = disablePrerenderedControls({ ...story, argTypes: withSlotRows } as never);

    expect(argTypes[slotArgName('default')]).toEqual({
      name: 'default',
      table: { category: 'slots' },
      control: false
    });
    expect(argTypes[slotArgName('footer')]).toEqual({
      name: 'footer',
      table: { category: 'slots' },
      control: false
    });
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

  test('turns off the controls Storybook would infer from args that have no row (issue #375)', () => {
    const argTypes = disablePrerenderedControls({
      component: Card,
      argTypes: { title: { name: 'title', control: { type: 'text' } } },
      initialArgs: { title: 'Hi', class: 'wide', slots: { default: Card } }
    } as never);

    expect(argTypes.class).toEqual({ control: false });
    expect(argTypes.slots).toEqual({ control: false });
    expect(argTypes.title).toEqual({ name: 'title', control: false });
  });
});
