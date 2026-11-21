import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Every consumer installs the renderer's dependencies. Its published .d.ts files
// don't reference Node's types, so @types/node is only needed for the renderer's
// own build and installing it would put a second @types/node major next to the
// project's own (#333).
test('the renderer does not install type packages into consumer projects', () => {
  const typePackages = Object.keys(manifest.dependencies ?? {}).filter((name) =>
    name.startsWith('@types/')
  );

  expect(typePackages).toEqual([]);
});
