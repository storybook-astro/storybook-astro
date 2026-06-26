/**
 * Splits a story's `args` into component props and slot content. Slot content
 * lives under the reserved `slots` key (`args.slots.<name>`); everything else is
 * a prop. Returns `{}` for slots when `args.slots` is absent or not an object.
 */
export function separateStorySlots(storyArgs: Record<string, unknown>): {
  componentArgs: Record<string, unknown>;
  storySlots: Record<string, unknown>;
} {
  const componentArgs = { ...storyArgs };
  const storySlots = componentArgs.slots;

  delete componentArgs.slots;

  if (typeof storySlots !== 'object' || storySlots === null) {
    return { componentArgs, storySlots: {} };
  }

  return { componentArgs, storySlots: storySlots as Record<string, unknown> };
}
