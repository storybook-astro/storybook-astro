// A story passes slot content as one nested arg, `args.slots`, and Storybook
// only gives top-level args a control. So each slot the docgen found also gets
// a top-level arg, `slot-<name>`, with a text control (issue #203). The prefix
// is very unlikely to collide with a prop name, and it keeps the key within
// the characters Storybook writes to the URL (#306), so a plain-text edit
// (ASCII letters, digits, spaces, `_`, `-`) survives a reload or a shared
// link. Storybook also checks the value, so an edit with HTML, punctuation or
// any other character, such as an accented letter, is still left out of the URL. Everything that reads a story's args folds
// these back into `slots` through `splitStoryArgs`.
//
// Kept free of virtual-module imports, so the framework's static prerender and
// testing runtime use the same fold as the canvas.

import type { Args, ArgsEnhancer, ArgTypesEnhancer, Renderer } from 'storybook/internal/types';

const SLOT_ARG_PREFIX = 'slot-';

/** The top-level arg that holds one slot's content. */
export function slotArgName(slot: string): string {
  return `${SLOT_ARG_PREFIX}${slot}`;
}

/**
 * Splits a story's args into component props and slot content. A per-slot arg
 * the reader edited in Controls wins over the same slot in `args.slots`.
 *
 * Pass `initialArgs` when `args` may have changed since the story loaded. A
 * per-slot arg still equal to its initial value is only the seeded copy of the
 * story's content, so `args.slots` wins instead, and a play function's
 * `updateArgs({ slots })`, a `slots.*` URL arg or the `slots` JSON editor still
 * show. A per-slot arg for a slot whose story content isn't text, such as a
 * component, is ignored too: its control is locked, but a stray value (an old
 * URL, say) must not replace the component with a string (#267). Without
 * `initialArgs`, every per-slot arg counts as an edit.
 */
export function splitStoryArgs(args: Args, initialArgs?: Args): { props: Args; slots: Args } {
  const props: Args = {};
  const slots: Args = isPlainObject(args.slots) ? { ...args.slots } : {};
  const storySlots = isPlainObject(initialArgs?.slots) ? initialArgs.slots : {};

  for (const [key, value] of Object.entries(args)) {
    if (key === 'slots') {
      continue;
    }

    if (key.startsWith(SLOT_ARG_PREFIX)) {
      const slot = key.slice(SLOT_ARG_PREFIX.length);
      const wasEdited = !initialArgs || value !== initialArgs[key];

      if (value !== undefined && wasEdited && !holdsNonText(storySlots, slot)) {
        slots[slot] = value;
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
 * When the story fills at least one slot and every slot it fills has its own
 * text control, the inferred `slots` row loses its JSON editor too: the
 * per-slot controls cover every slot, and a slot edited there would override
 * the JSON. A slot without a text control, or `slots: {}`, keeps the JSON
 * editor, since it's the only way to edit that content. The row stays in the
 * Docs table. With the Docgen Server on, the JSON editor stays: a slot's row
 * comes from the docgen payload, and the preview can't tell whether the payload
 * has one, so a slot may have no other control.
 */
export const lockNonTextSlotControls: ArgTypesEnhancer<Renderer> = (context) => {
  const initialSlots = context.initialArgs?.slots;
  const argTypes = { ...context.argTypes };

  if (!isPlainObject(initialSlots)) {
    return argTypes;
  }

  const slotNames = Object.keys(initialSlots);
  const slotRowsComeFromPayload = isDocgenServerOn() && isAstroStory(context);

  for (const slot of slotNames) {
    const key = slotArgName(slot);

    if ((argTypes[key] || slotRowsComeFromPayload) && holdsNonText(initialSlots, slot)) {
      argTypes[key] = { ...argTypes[key], control: { disable: true } };
    }
  }

  const everySlotHasTextControl = slotNames.every(
    (slot) => argTypes[slotArgName(slot)] && !holdsNonText(initialSlots, slot)
  );

  if (slotNames.length > 0 && everySlotHasTextControl) {
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
  const slotRowsComeFromPayload = isDocgenServerOn() && isAstroStory(context);

  for (const [slot, content] of Object.entries(storySlots)) {
    const key = slotArgName(slot);

    if (
      (context.argTypes[key] || slotRowsComeFromPayload) &&
      typeof content === 'string' &&
      context.initialArgs?.[key] === undefined
    ) {
      seeded[key] = content;
    }
  }

  return seeded;
};

/**
 * With the Docgen Server on, the preview never sees the component's docgen: its
 * `slot-<name>` rows reach the manager from the docgen payload, which merges
 * them under the argTypes the preview prepared (#267). So the preview can't
 * tell which slots have a row, and seeds and locks every slot the story fills.
 * Storybook 10 reads `experimentalDocgenServer`; Storybook 11 renamed it to
 * `docgenServer`.
 */
export function isDocgenServerOn(): boolean {
  const features = (globalThis as { FEATURES?: Record<string, unknown> }).FEATURES;

  return Boolean(features?.experimentalDocgenServer || features?.docgenServer);
}

function holdsNonText(slots: Args, slot: string): boolean {
  return slots[slot] !== undefined && typeof slots[slot] !== 'string';
}

/**
 * Only an Astro story folds per-slot args back into `slots`. A story delegated
 * to a framework renderer would get the seeded arg as an unknown prop.
 * `parameters.renderer` defaults to `'astro'`, so only another value delegates.
 */
function isAstroStory(context: { component?: unknown; parameters?: { renderer?: unknown } }): boolean {
  const component = context.component as { isAstroComponentFactory?: boolean } | undefined;
  const renderer = context.parameters?.renderer;

  return Boolean(component?.isAstroComponentFactory) && (!renderer || renderer === 'astro');
}

export function isPlainObject(value: unknown): value is Args {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
