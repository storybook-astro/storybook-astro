// A story passes slot content as one nested arg, `args.slots`, and Storybook
// only gives top-level args a control. So each slot the docgen found also gets
// a top-level arg, `slot:<name>`, with a text control (issue #203). The prefix
// can't collide with a prop name. Everything that reads a story's args folds
// these back into `slots` through `splitStoryArgs`.
//
// Kept free of virtual-module imports, so the framework's static prerender and
// testing runtime use the same fold as the canvas.

import type { Args, ArgsEnhancer, ArgTypesEnhancer, Renderer } from 'storybook/internal/types';

const SLOT_ARG_PREFIX = 'slot:';

/** The top-level arg that holds one slot's content. */
export function slotArgName(slot: string): string {
  return `${SLOT_ARG_PREFIX}${slot}`;
}

/**
 * Splits a story's args into component props and slot content. A per-slot arg
 * wins over the same slot in `args.slots`, since it's what the reader just
 * edited in Controls.
 */
export function splitStoryArgs(args: Args): { props: Args; slots: Args } {
  const props: Args = {};
  const slots: Args = isPlainObject(args.slots) ? { ...args.slots } : {};

  for (const [key, value] of Object.entries(args)) {
    if (key === 'slots') {
      continue;
    }

    if (key.startsWith(SLOT_ARG_PREFIX)) {
      if (value !== undefined) {
        slots[key.slice(SLOT_ARG_PREFIX.length)] = value;
      }
      continue;
    }

    props[key] = value;
  }

  return { props, slots };
}

/**
 * An `argTypesEnhancer`: a slot whose story content is a component, an array or
 * anything else that isn't text can't be edited as text, so its row keeps no
 * control.
 *
 * When every slot the story fills has its own row, the inferred `slots` row
 * loses its JSON editor too. Its edits would never show, since each per-slot arg
 * wins over `args.slots`. The row stays in the Docs table.
 */
export const lockNonTextSlotControls: ArgTypesEnhancer<Renderer> = (context) => {
  const initialSlots = context.initialArgs?.slots;
  const argTypes = { ...context.argTypes };

  if (!isPlainObject(initialSlots)) {
    return argTypes;
  }

  for (const [slot, content] of Object.entries(initialSlots)) {
    const key = slotArgName(slot);

    if (argTypes[key] && content !== undefined && typeof content !== 'string') {
      argTypes[key] = { ...argTypes[key], control: { disable: true } };
    }
  }

  if (Object.keys(initialSlots).every((slot) => argTypes[slotArgName(slot)])) {
    argTypes.slots = { ...argTypes.slots, control: { disable: true } };
  }

  return argTypes;
};

/**
 * An `argsEnhancer`: starts each slot's control at the story's own content, so
 * the Controls panel shows what the canvas shows.
 */
export const seedSlotArgs: ArgsEnhancer<Renderer> = (context) => {
  const storySlots = isPlainObject(context.initialArgs?.slots) ? context.initialArgs.slots : {};
  const seeded: Args = {};

  for (const [slot, content] of Object.entries(storySlots)) {
    const key = slotArgName(slot);

    if (context.argTypes[key] && typeof content === 'string' && context.initialArgs?.[key] === undefined) {
      seeded[key] = content;
    }
  }

  return seeded;
};

function isPlainObject(value: unknown): value is Args {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
