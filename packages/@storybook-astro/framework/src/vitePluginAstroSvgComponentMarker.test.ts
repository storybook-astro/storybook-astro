import { describe, expect, test } from 'vitest';
import { ASTRO_COMPONENT_MARKER } from '@storybook-astro/renderer/types';
import { vitePluginAstroSvgComponentMarker } from './vitePluginAstroSvgComponentMarker.ts';

type TransformablePlugin = {
  transform: (code: string, id: string) => { code: string } | null;
};

function createPlugin() {
  return vitePluginAstroSvgComponentMarker() as unknown as TransformablePlugin;
}

const SVG_METADATA_CODE = JSON.stringify({
  src: '/@fs/project/src/assets/icon.svg?origWidth=20&origHeight=20&origFormat=svg',
  width: 20,
  height: 20,
  format: 'svg',
});

describe('vitePluginAstroSvgComponentMarker transform', () => {
  test('ignores non-svg modules', () => {
    const plugin = createPlugin();

    expect(plugin.transform(`export default ${SVG_METADATA_CODE}`, '/some/module.ts')).toBeNull();
  });

  test('ignores svg code that is not the browser metadata shape', () => {
    const plugin = createPlugin();
    const realComponentCode = `import { createSvgComponent } from 'astro/assets/runtime';
export default createSvgComponent({"meta":{}})`;

    expect(plugin.transform(realComponentCode, '/project/src/assets/icon.svg')).toBeNull();
  });

  test('ignores raster image metadata (no server-side component form to reconstruct)', () => {
    const plugin = createPlugin();
    const pngMetadata = JSON.stringify({ src: '/@fs/project/src/logo.png', width: 64, height: 64, format: 'png' });

    expect(plugin.transform(`export default ${pngMetadata}`, '/project/src/logo.png')).toBeNull();
  });

  test('marks svg browser metadata with the astro component marker and moduleId', () => {
    const plugin = createPlugin();
    const filePath = '/project/src/assets/icon.svg';
    const result = plugin.transform(`export default ${SVG_METADATA_CODE}`, filePath);

    expect(result).not.toBeNull();

    const exported = JSON.parse(result!.code.replace(/^export default /, '').replace(/;\s*$/, ''));

    expect(exported[ASTRO_COMPONENT_MARKER]).toBe(true);
    expect(exported.moduleId).toBe(filePath);
    // The original metadata still rides along, so non-Astro consumers (React
    // stories, Storybook's Controls addon) keep reading it as plain image data.
    expect(exported.src).toContain('icon.svg');
    expect(exported.width).toBe(20);
    expect(exported.height).toBe(20);
    expect(exported.format).toBe('svg');
  });
});
