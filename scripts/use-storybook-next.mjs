// Points every Storybook package the workspace depends on at its `next`
// prerelease, for the scheduled storybook@next canary (issue #213).
//
// Writes root `resolutions` rather than upgrading one app: the framework and
// renderer import `storybook/internal/*` from wherever they resolve it, so a
// single upgraded app would still run against the hoisted stable copy. Run
// `yarn install` afterwards.
//
// Usage: node scripts/use-storybook-next.mjs

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// storybook-solidjs-vite is community-maintained but publishes its Storybook 11
// builds under `next` too (issue #208).
const STORYBOOK_PACKAGE = /^(storybook|@storybook\/.+|storybook-solidjs-vite)$/;

const root = fileURLToPath(new URL('..', import.meta.url));
const rootManifestPath = join(root, 'package.json');
const rootManifest = JSON.parse(readFileSync(rootManifestPath, 'utf-8'));

// Workspace patterns here are plain directories or `dir/*`.
const workspaceDirs = rootManifest.workspaces.flatMap((pattern) =>
  pattern.endsWith('/*')
    ? readdirSync(join(root, pattern.slice(0, -2))).map((name) => join(pattern.slice(0, -2), name))
    : [pattern]
);
const manifestPaths = workspaceDirs
  .map((dir) => join(dir, 'package.json'))
  .filter((manifestPath) => existsSync(join(root, manifestPath)));

const packageNames = new Set();

for (const manifestPath of manifestPaths) {
  const manifest = JSON.parse(readFileSync(join(root, manifestPath), 'utf-8'));

  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (STORYBOOK_PACKAGE.test(name)) {
        packageNames.add(name);
      }
    }
  }
}

const resolutions = { ...rootManifest.resolutions };

for (const name of [...packageNames].sort()) {
  const version = execFileSync('npm', ['view', `${name}@next`, 'version'], { encoding: 'utf-8' })
    .trim()
    .split('\n')
    .at(-1);

  resolutions[name] = version;
  console.warn(`${name} → ${version}`);
}

writeFileSync(rootManifestPath, `${JSON.stringify({ ...rootManifest, resolutions }, null, 2)}\n`);
