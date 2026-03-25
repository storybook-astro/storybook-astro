import {
  definePreview as definePreviewBase,
  type InferTypes,
  type Preview as CsfPreview,
  type PreviewAddon,
  type ProjectAnnotations,
} from "storybook/internal/csf";

import type { AstroRenderer } from "./portable-stories.ts";

export function __definePreview<Addons extends PreviewAddon<never>[] = []>(
  input: ProjectAnnotations<AstroRenderer> & { addons?: Addons }
): CsfPreview<AstroRenderer & InferTypes<Addons>> {
  const preview = definePreviewBase<AstroRenderer, Addons>(
    input as ProjectAnnotations<AstroRenderer> & { addons?: Addons }
  ) as unknown as CsfPreview<AstroRenderer & InferTypes<Addons>>;

  const defineMeta = preview.meta.bind(preview);
  (preview as any).meta = (_input: any) => {
    const meta = defineMeta(_input as any);
    const defineStory = meta.story.bind(meta);
    (meta as any).story = (__input: any) => {
      const story = defineStory(__input);
      (story as any).Component = (story as any).__compose();
      return story;
    };
    return meta;
  };

  return preview;
}
