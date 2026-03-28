#!/usr/bin/env node
/**
 * Validates that every `import` path listed in publishConfig.exports
 * exists on disk in the dist/ directory.
 *
 * Run after `yarn build:packages` to catch missing dist files before
 * publishing or smoke-testing from a tarball.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const packages = [
  resolve(repoRoot, 'packages/@storybook-astro/renderer'),
  resolve(repoRoot, 'packages/@storybook-astro/framework'),
];

let errors = [];
let checked = 0;

for (const pkgDir of packages) {
  const pkgJson = JSON.parse(readFileSync(resolve(pkgDir, 'package.json'), 'utf8'));
  const publishExports = pkgJson.publishConfig?.exports ?? {};
  const name = pkgJson.name;

  for (const [exportKey, exportValue] of Object.entries(publishExports)) {
    if (exportKey === './package.json') continue;

    // Collect all the file paths from this export entry.
    // Values can be a string or { types, import } object.
    const paths =
      typeof exportValue === 'string'
        ? [exportValue]
        : Object.entries(exportValue)
            .filter(([condition]) => condition !== 'types') // types may point to src/
            .map(([, p]) => p)
            .filter(Boolean);

    for (const filePath of paths) {
      if (filePath.startsWith('./src/')) continue; // src/ is fine for dev-only resolution
      if (filePath === './package.json') continue;

      const absPath = resolve(pkgDir, filePath);
      checked++;

      if (!existsSync(absPath)) {
        errors.push(`  ✗ ${name} "${exportKey}" → ${filePath}  (not found)`);
      }
    }
  }
}

if (errors.length > 0) {
  console.error(`\nDist validation failed — ${errors.length} missing file(s):\n`);
  for (const e of errors) console.error(e);
  console.error('\nRun `yarn build:packages` and check your tsup config.\n');
  process.exit(1);
}

console.log(`✓ dist validation passed (${checked} paths checked across ${packages.length} packages)`);
