// Points every Storybook package the workspace depends on at its `next`
// prerelease (issue #213), or at the versions pinned in
// storybook-next-versions.json for the Storybook 11 job in build.yml (#205).
//
// Writes root `resolutions` rather than upgrading one app: the framework and
// renderer import `storybook/internal/*` from wherever they resolve it, so a
// single upgraded app would still run against the hoisted stable copy. Run
// `yarn install` afterwards.
//
// Usage:
//   node scripts/use-storybook-next.mjs           # newest `next` of each package
//   node scripts/use-storybook-next.mjs --pinned  # the versions in storybook-next-versions.json
//
// The pinned versions keep the PR job from turning red when Storybook
// publishes a prerelease; the scheduled storybook@next job still tracks the
// newest one. When it passes on a newer prerelease, update the pins.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// storybook-solidjs-vite and @chromatic-com/storybook are maintained outside
// Storybook core but publish their Storybook 11 builds under `next` too.
const STORYBOOK_PACKAGE =
  /^(storybook|@storybook\/.+|storybook-solidjs-vite|@chromatic-com\/storybook)$/;

const root = fileURLToPath(new URL('..', import.meta.url));
const rootManifestPath = join(root, 'package.json');
const rootManifest = JSON.parse(readFileSync(rootManifestPath, 'utf-8'));
const pinned = process.argv.includes('--pinned')
  ? JSON.parse(readFileSync(join(root, 'scripts/storybook-next-versions.json'), 'utf-8'))
  : undefined;

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
  const version = pinned ? pinnedVersion(name) : newestNext(name);

  resolutions[name] = version;
  console.warn(`${name} → ${version}`);
}

writeFileSync(rootManifestPath, `${JSON.stringify({ ...rootManifest, resolutions }, null, 2)}\n`);

function newestNext(name) {
  return execFileSync('npm', ['view', `${name}@next`, 'version'], { encoding: 'utf-8' })
    .trim()
    .split('\n')
    .at(-1);
}

// `storybook` in the pin file covers every `@storybook/*` package too, since
// core publishes them all at one version.
function pinnedVersion(name) {
  const key = name.startsWith('@storybook/') ? 'storybook' : name;

  if (!pinned[key]) {
    throw new Error(`scripts/storybook-next-versions.json has no version for ${key}`);
  }

  return pinned[key];
}
