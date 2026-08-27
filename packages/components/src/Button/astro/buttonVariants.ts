/**
 * Variant map for Button, kept in a sibling module on purpose.
 *
 * Every other component in this repo declares `Props` inline, so nothing
 * covered cross-file type resolution — the case that breaks when the virtual
 * TypeScript file is not placed beside the component
 * (docs/specs/docgen.md#the-virtual-typescript-file).
 */
export type ButtonVariants = {
  /** Visual treatment. */
  variant?: 'solid' | 'soft' | 'outline';
  /** Control size. */
  size?: 'sm' | 'md' | 'lg';
};

export const VARIANT_CLASSES: Record<string, string> = {
  solid: 'button--solid',
  soft: 'button--soft',
  outline: 'button--outline'
};
