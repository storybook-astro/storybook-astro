/**
 * Install a passthrough image service on `globalThis.astroAsset.imageService`.
 *
 * AstroContainer has no image service configuration API, and the default
 * `getConfiguredImageService()` tries to dynamically import "virtual:image-service"
 * which fails in astro6/Vite 7's module runner. Even when it succeeds (astro5),
 * the noop service still routes through /_image?href=... URLs that the Storybook
 * dev server cannot serve.
 *
 * Pre-populating `globalThis.astroAsset.imageService` bypasses the dynamic import
 * entirely — `getConfiguredImageService()` checks this global first and returns
 * it without going through the broken virtual module. Our service returns the
 * direct /@fs/... Vite URL from the ImageMetadata object, which Vite can serve
 * as a static asset in the browser; in static (build-time prerender) mode the
 * URL ends up being rewritten to a content-hashed Rollup asset.
 *
 * This must be called on the same Node process that hosts AstroContainer,
 * before `container.renderToString()` is invoked.
 */
export function installPassthroughImageService() {
  if (!globalThis.astroAsset) {
    (globalThis as Record<string, unknown>).astroAsset = {};
  }

  (globalThis.astroAsset as Record<string, unknown>).imageService = {
    propertiesToHash: ['src'],
    validateOptions(options: Record<string, unknown>) {
      return options;
    },
    getURL(options: { src: unknown }) {
      const src = options.src;

      if (
        src != null &&
        typeof src === 'object' &&
        'src' in src &&
        typeof (src as Record<string, unknown>).src === 'string'
      ) {
        // ImageMetadata object — return the /@fs/... Vite URL directly
        return (src as Record<string, unknown>).src as string;
      }

      return typeof src === 'string' ? src : '';
    },
    getHTMLAttributes(options: Record<string, unknown>) {
      const {
        src,
        width,
        height,
        format: _format,
        quality: _quality,
        densities: _densities,
        widths: _widths,
        formats: _formats,
        layout: _layout,
        priority: _priority,
        fit: _fit,
        position: _position,
        background: _background,
        ...attrs
      } = options;
      const srcObj = src != null && typeof src === 'object' ? (src as Record<string, unknown>) : null;

      return {
        ...attrs,
        width: width ?? srcObj?.width,
        height: height ?? srcObj?.height,
        loading: (attrs.loading as string | undefined) ?? 'lazy',
        decoding: (attrs.decoding as string | undefined) ?? 'async'
      };
    },
    getSrcSet() {
      return [];
    }
  };
}
