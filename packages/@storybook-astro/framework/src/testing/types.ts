export type StoryMeta = {
  component: unknown;
  args?: Record<string, unknown>;
};

export type ComposedStory = {
  (...args: unknown[]): unknown;
  args?: Record<string, unknown>;
  component?: unknown;
  run?: () => unknown | Promise<unknown>;
  storyName?: string;
  __storybookAstroMeta?: StoryMeta;
  __storybookAstroStoryExport?: { args?: Record<string, unknown> };
};
