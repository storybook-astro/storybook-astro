// @ts-expect-error - Storybook internal modules have complex module resolution
import { definePreview as definePreviewBase, type PreviewAddon, type InferTypes, type Preview } from 'storybook/internal/csf';
// @ts-expect-error - Storybook internal modules have complex module resolution
import type { ProjectAnnotations } from 'storybook/internal/types';

import type { AstroRenderer } from './types.ts';

export function definePreview<Addons extends PreviewAddon<never>[] = []>(
  input: ProjectAnnotations<AstroRenderer> & { addons?: Addons }
): Preview<AstroRenderer & InferTypes<Addons>> {
  return definePreviewBase<AstroRenderer, Addons>(input);
}
