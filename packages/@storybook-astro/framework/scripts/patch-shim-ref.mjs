// Prepend the shim reference directive to dist/index.d.ts after tsup finishes.
// This makes `/// <reference types="@storybook-astro/framework/shim" />` apply
// automatically when consumers import from @storybook-astro/framework, giving
// them typed *.astro imports without any manual env.d.ts changes.
import { readFileSync, writeFileSync } from 'node:fs';

const path = 'dist/index.d.ts';
const header = '/// <reference types="@storybook-astro/framework/shim" />\n';
const content = readFileSync(path, 'utf8');

if (!content.startsWith(header)) {
  writeFileSync(path, header + content);
}
