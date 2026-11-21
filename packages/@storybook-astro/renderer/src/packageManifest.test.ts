import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Only the renderer's build needs @types/node. Every consumer installs the
// renderer's dependencies, so listing it there can put a second @types/node
// major next to the project's own (#333).
test('the renderer does not install @types/node into consumer projects', () => {
  expect(manifest.dependencies?.['@types/node']).toBeUndefined();
});
