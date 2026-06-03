export function ensureAstroPassthroughImageService() {
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
        return (src as Record<string, unknown>).src as string;
      }

      return typeof src === 'string' ? src : '';
    },
    getHTMLAttributes(options: Record<string, unknown>) {
      const {
        src,
        width,
        height,
        format,
        quality,
        densities,
        widths,
        formats,
        layout,
        priority,
        fit,
        position,
        background,
        ...attrs
      } = options;
      const srcObject =
        src != null && typeof src === 'object' ? (src as Record<string, unknown>) : null;

      return {
        ...attrs,
        width: width ?? srcObject?.width,
        height: height ?? srcObject?.height,
        loading: (attrs.loading as string | undefined) ?? 'lazy',
        decoding: (attrs.decoding as string | undefined) ?? 'async'
      };
    },
    getSrcSet() {
      return [];
    }
  };
}
