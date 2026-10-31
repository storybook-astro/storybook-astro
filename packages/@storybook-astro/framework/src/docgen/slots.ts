import type { AstroDocgenSlot } from './types.ts';
import { findClosingFence } from './virtualFile.ts';

// A comment Astro strips (`{/* … */}`) or keeps (`<!-- … -->`), or a `<slot>`
// element. Matching comments in the same pass means a commented-out `<slot>`
// is consumed as part of its comment and never counts.
const COMMENT_OR_SLOT = /\{\/\*([\s\S]*?)\*\/\}|<!--([\s\S]*?)-->|<slot\b([^>]*)>/g;
const SLOT_DESCRIPTION = /^\s*\*?\s*@slot\b\s*([\s\S]*?)\s*$/;
const NAME_ATTRIBUTE = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|(\{))/;
const SLOTS_API_CALL = /\bAstro\.slots\.(?:render|has)\(\s*(?:'([^']+)'|"([^"]+)"|`([^`$]+)`)/g;

/**
 * Lists the slots an `.astro` component accepts (issue #188): every `<slot>` in
 * its template, plus the names its frontmatter reads through `Astro.slots.render`
 * or `Astro.slots.has`. Slots have no TypeScript declaration, so this reads the
 * source text, in the order slots first appear.
 *
 * A slot's description is a comment starting with `@slot` directly before it,
 * the convention Vue's docgen uses: `{/* @slot The card body *\/}` or
 * `<!-- @slot The card body -->`. A slot whose name is an expression
 * (`name={…}`) can't be known without rendering, so it's skipped.
 */
export function readSlots(astroSource: string): AstroDocgenSlot[] {
  const { frontmatter, template } = splitFrontmatter(astroSource);
  const slots = new Map<string, AstroDocgenSlot>();
  const add = (name: string, description = '') => {
    const existing = slots.get(name);

    if (!existing) {
      slots.set(name, { name, description });
    } else if (!existing.description) {
      existing.description = description;
    }
  };

  let pendingDescription: { text: string; end: number } | undefined;

  for (const match of template.matchAll(COMMENT_OR_SLOT)) {
    const [whole, astroComment, htmlComment, slotAttributes] = match;

    if (slotAttributes === undefined) {
      const text = (astroComment ?? htmlComment).match(SLOT_DESCRIPTION)?.[1];

      pendingDescription = text === undefined ? undefined : { text, end: match.index + whole.length };
      continue;
    }

    const describedHere =
      pendingDescription && !template.slice(pendingDescription.end, match.index).trim();
    const description = describedHere ? pendingDescription!.text : '';

    pendingDescription = undefined;

    const name = NAME_ATTRIBUTE.exec(slotAttributes);

    if (name?.[3]) {
      continue;
    }

    add(name ? (name[1] ?? name[2]) : 'default', description);
  }

  // Frontmatter calls come after the template's slots: a component that renders
  // a slot both ways keeps the template's description and position.
  for (const match of frontmatter.matchAll(SLOTS_API_CALL)) {
    add(match[1] ?? match[2] ?? match[3]);
  }

  return [...slots.values()];
}

function splitFrontmatter(source: string) {
  const closingFence = source.startsWith('---') ? findClosingFence(source) : -1;

  if (closingFence === -1) {
    return { frontmatter: '', template: source };
  }

  return { frontmatter: source.slice(3, closingFence), template: source.slice(closingFence + 3) };
}
