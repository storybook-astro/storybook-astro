import { splitStoryArgs } from '@storybook-astro/renderer/slotArgs';

/**
 * Splits a story's `args` into component props and slot content. Slot content
 * lives under the reserved `slots` key (`args.slots.<name>`), or in a per-slot
 * `slot:<name>` arg from the Controls panel, which wins; everything else is a
 * prop. Returns `{}` for slots when there are none.
 */
export function separateStorySlots(storyArgs: Record<string, unknown>): {
  componentArgs: Record<string, unknown>;
  storySlots: Record<string, unknown>;
} {
  const { props, slots } = splitStoryArgs(storyArgs);

  return { componentArgs: props, storySlots: slots };
}
