import type { PluginOption } from 'vite';
import { ASTRO_COMPONENT_MARKER } from '@storybook-astro/renderer/types';

/**
 * Vite plugin that marks the client-side transform of a bare `.svg` import so
 * it can be reconstructed into an Astro `SvgComponent` (issue #154), not just
 * treated as an image.
 *
 * Astro's own asset plugin transforms a bare `.svg` import differently per
 * Vite environment: in a server/SSR environment it becomes a real component
 * (`createSvgComponent(...)`); in the browser it becomes plain `ImageMetadata`
 * (`export default {src, width, height, format}`). A story file's
 * `import Icon from './icon.svg'` is always bundled for the browser, so an arg
 * built from it is only ever the metadata shape — passing it to a component
 * prop typed `SvgComponent` and rendering `<Icon />` server-side fails,
 * because `Icon` arrives as data, not a callable.
 *
 * This plugin patches that browser-side metadata object with the same
 * `{__astroComponent, moduleId}` marker `vitePluginAstroComponentMarker` adds
 * to `.astro` client stubs. The renderer's `serializeAstroComponentMarkers`
 * already passes unrecognized object keys through untouched, and the
 * framework's `reconstructProps` already resolves any marker-shaped value back
 * to a real component via `loadComponent` before an Astro component's props
 * reach the parent template — so no server-side code needs to change. The
 * marker fields simply ride alongside `src`/`width`/`height`/`format`, which
 * non-Astro consumers (React/Vue stories, Storybook's Controls addon) keep
 * reading as plain metadata, since they never resolve markers.
 */
export function vitePluginAstroSvgComponentMarker(): PluginOption {
  return {
    name: 'storybook-astro-svg-component-marker',
    enforce: 'post',

    transform(code: string, id: string) {
      if (!id.endsWith('.svg')) {return null;}

      const metadata = parseBrowserImageMetadata(code);

      // Raster formats have no server-side "component" form to reconstruct —
      // only .svg can become an SvgComponent, so only it needs the marker.
      if (!metadata || metadata.format !== 'svg') {return null;}

      const marked = { ...metadata, [ASTRO_COMPONENT_MARKER]: true, moduleId: id };

      return {
        code: `export default ${JSON.stringify(marked)};\n`,
        map: null,
      };
    },
  };
}

/**
 * Recognizes Astro's browser-side asset transform: `export default {...}`,
 * where the object is exactly the `JSON.stringify`-d `ImageMetadata`. The
 * server-side transform of the same file is different code entirely (an
 * import plus a `createSvgComponent(...)` call for `.svg`, or a getter-backed
 * proxy for other formats), so it never matches this shape and passes through
 * untouched.
 */
function parseBrowserImageMetadata(code: string): Record<string, unknown> | null {
  const match = code.match(/^export default (\{[\s\S]*\});?\s*$/);

  if (!match) {return null;}

  try {
    const value: unknown = JSON.parse(match[1]);

    return isImageMetadataShape(value) ? value : null;
  } catch {
    return null;
  }
}

function isImageMetadataShape(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && typeof (value as Record<string, unknown>).src === 'string';
}
