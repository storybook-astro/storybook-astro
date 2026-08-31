import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Options } from 'storybook/internal/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const previewAnnotations = async (input = [], options: Options) => {
  const result: string[] = [];
  // The source decorator is only useful when addon-docs is rendering a "Show
  // code" block or Code Panel, so projects without it don't load the annotation
  // at all (docs/specs/code-panel-source.md#design-decisions, Decision 1).
  const docsEnabled =
    Object.keys((await options.presets.apply('docs', {}, options)) ?? {}).length > 0;

  // Omit file extension — Vite resolves .ts (local dev) or .js (published dist)
  return result
    .concat(input)
    .concat([join(__dirname, 'entry-preview')])
    .concat(docsEnabled ? [join(__dirname, 'entry-preview-docs')] : []);
};
