/**
 * The image service Storybook renders Astro components with: `<Image>` and
 * `getImage()` return the image's own Vite URL (`/@fs/…` in dev, rewritten to
 * the emitted asset in static builds) instead of an `/_image?href=…`
 * optimization endpoint that Storybook has no server for.
 *
 * Shipped as its own entry (`@storybook-astro/framework/image-service`) so it
 * can be handed to Astro's `image.service.entrypoint`, which Astro 7.4+ loads
 * through `virtual:image-service`. See `astroImageService.ts` for how it is
 * installed on older versions.
 */
const storybookImageService = {
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
      // ImageMetadata — its `src` is the Vite URL of the imported file.
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

export default storybookImageService;
