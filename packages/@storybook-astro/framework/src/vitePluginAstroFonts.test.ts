import { describe, expect, test } from 'vitest';
import {
  buildFamilyCss,
  vitePluginAstroFonts,
  type FontFaceData,
  type StorybookFontFamily,
  type StorybookFontProvider
} from './vitePluginAstroFonts.ts';

function makeProvider(faces: FontFaceData[]): StorybookFontProvider {
  return {
    name: 'test',
    resolveFont: () => ({ fonts: faces })
  };
}

describe('buildFamilyCss', () => {
  test('emits @font-face block with src url and font-display: swap by default', () => {
    const family: StorybookFontFamily = {
      name: 'Inter',
      cssVariable: '--font-inter',
      provider: makeProvider([])
    };
    const css = buildFamilyCss(family, [
      { src: [{ url: 'https://example.com/inter-400.woff2', format: 'woff2' }], weight: 400, style: 'normal' }
    ]);

    expect(css).toContain('@font-face');
    expect(css).toContain('font-family: "Inter"');
    expect(css).toContain('src: url("https://example.com/inter-400.woff2") format("woff2");');
    expect(css).toContain('font-display: swap');
    expect(css).toContain('font-weight: 400');
    expect(css).toContain('font-style: normal');
  });

  test('emits CSS variable rule binding cssVariable to family name and fallbacks', () => {
    const family: StorybookFontFamily = {
      name: 'Inter',
      cssVariable: '--font-inter',
      provider: makeProvider([]),
      fallbacks: ['system-ui', 'sans-serif']
    };
    const css = buildFamilyCss(family, []);

    expect(css).toContain(':root { --font-inter: "Inter", system-ui, sans-serif; }');
  });

  test('handles local() source entries from local font providers', () => {
    const family: StorybookFontFamily = {
      name: 'CustomFont',
      cssVariable: '--font-custom',
      provider: makeProvider([])
    };
    const css = buildFamilyCss(family, [
      { src: [{ name: 'CustomFont Regular' }, { url: '/fonts/custom.woff2', format: 'woff2' }] }
    ]);

    expect(css).toContain('local("CustomFont Regular")');
    expect(css).toContain('url("/fonts/custom.woff2") format("woff2")');
  });

  test('emits variable-font weight range when provider returns a tuple', () => {
    const family: StorybookFontFamily = {
      name: 'Inter',
      cssVariable: '--font-inter',
      provider: makeProvider([])
    };
    const css = buildFamilyCss(family, [{ src: [{ url: '/x.woff2' }], weight: [100, 900] }]);

    expect(css).toContain('font-weight: 100 900');
  });
});

describe('vitePluginAstroFonts virtual modules', () => {
  test('resolveId maps both virtual ids and the bare astro/assets/fonts/runtime import', async () => {
    const plugin = vitePluginAstroFonts();
    const resolveId = plugin.resolveId as (this: unknown, id: string) => string | undefined;

    expect(resolveId.call({}, 'virtual:astro:assets/fonts/internal')).toBe(
      '\0virtual:astro:assets/fonts/internal'
    );
    expect(resolveId.call({}, 'virtual:astro:assets/fonts/runtime')).toBe(
      '\0virtual:astro:assets/fonts/runtime'
    );
    expect(resolveId.call({}, 'astro/assets/fonts/runtime')).toBe('\0storybook:astro-fonts-runtime');
    expect(resolveId.call({}, 'astro/assets/fonts/runtime.js')).toBe('\0storybook:astro-fonts-runtime');
    expect(resolveId.call({}, 'some-other-id')).toBeUndefined();
  });

  test('internal virtual module exports a Map populated from the resolved families', async () => {
    const family: StorybookFontFamily = {
      name: 'Inter',
      cssVariable: '--font-inter',
      provider: makeProvider([
        { src: [{ url: 'https://example.com/inter.woff2', format: 'woff2' }], weight: 400 }
      ])
    };
    const plugin = vitePluginAstroFonts({ fonts: [family] });

    const buildStart = plugin.buildStart as (this: unknown) => Promise<void>;
    const load = plugin.load as (this: unknown, id: string) => Promise<{ code: string } | undefined>;

    await buildStart.call({});
    const result = await load.call({ load: async () => null }, '\0virtual:astro:assets/fonts/internal');

    expect(result?.code).toContain('componentDataByCssVariable = new Map(');
    expect(result?.code).toContain('--font-inter');
    expect(result?.code).toContain('@font-face');
    expect(result?.code).toContain('fontDataByCssVariable = ');
    expect(result?.code).toContain('https://example.com/inter.woff2');
  });

  test('emits empty maps when no families are configured (no-op behavior preserved)', async () => {
    const plugin = vitePluginAstroFonts();

    const buildStart = plugin.buildStart as (this: unknown) => Promise<void>;
    const load = plugin.load as (this: unknown, id: string) => Promise<{ code: string } | undefined>;

    await buildStart.call({});
    const result = await load.call({ load: async () => null }, '\0virtual:astro:assets/fonts/internal');

    expect(result?.code).toContain('componentDataByCssVariable = new Map([])');
    expect(result?.code).toContain('fontDataByCssVariable = {}');
  });

  test('continues processing remaining families if one provider throws', async () => {
    const failing: StorybookFontFamily = {
      name: 'Broken',
      cssVariable: '--font-broken',
      provider: {
        name: 'broken',
        resolveFont: () => {
          throw new Error('boom');
        }
      }
    };
    const working: StorybookFontFamily = {
      name: 'Inter',
      cssVariable: '--font-inter',
      provider: makeProvider([{ src: [{ url: '/inter.woff2' }], weight: 400 }])
    };
    const plugin = vitePluginAstroFonts({ fonts: [failing, working] });

    const buildStart = plugin.buildStart as (this: unknown) => Promise<void>;
    const load = plugin.load as (this: unknown, id: string) => Promise<{ code: string } | undefined>;

    await buildStart.call({});
    const result = await load.call({ load: async () => null }, '\0virtual:astro:assets/fonts/internal');

    expect(result?.code).toContain('--font-inter');
    expect(result?.code).not.toContain('--font-broken');
  });
});
