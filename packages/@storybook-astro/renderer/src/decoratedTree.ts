// Kept free of virtual-module imports (like decorators.ts and preview-defaults.ts)
// so this one predicate can be unit-tested directly — render.tsx itself can't be
// imported in isolation (it pulls in browser-only virtual modules at module
// scope), so a helper worth testing on its own lives here instead.
import { isAstroComponentSlot } from './astroComponentMarker.ts';
import type { AstroComponentSlot, SlotValue } from './types.ts';

/**
 * True for a decorator-composed tree (Decorator Support, Step 3): `storyFn()`
 * returned a wrapper descriptor or an array (the split form of a string
 * decorator — see `decorators.ts`), rather than the bare Astro factory an
 * undecorated story returns. `render.tsx` uses this to decide whether to send
 * the tree to the server as `node`, alongside the undecorated
 * `component`/`args`/`slots` it always sends.
 */
export function isDecoratedTree(element: unknown): element is AstroComponentSlot | SlotValue[] {
  return isAstroComponentSlot(element) || Array.isArray(element);
}
