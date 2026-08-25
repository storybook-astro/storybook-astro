// Verifies every reference to a repo doc resolves — including the ones in source
// comments, which ordinary markdown link checkers never look at. Source files cite
// design records by anchor (docs/specs/decorators.md#server-snapshot), so a renamed
// heading or a moved file is a silent break until something like this catches it.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';

const DOC_REF = /\b((?:docs|apps\/website\/src\/content\/docs)\/[A-Za-z0-9._/-]*\.md)(#[A-Za-z0-9-]+)?/g;
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2', '.lock']);

// Changelogs cite docs as they existed at release time, so a since-renamed file is
// correct history rather than a break. `.yarn/` is a vendored binary.
const skipFile = (file) =>
  file.startsWith('.yarn/') ||
  /(^|\/)CHANGELOG\.md$/i.test(file) ||
  file.endsWith('/reference/changelog.md');

/** GitHub's heading -> anchor slug: lowercase, drop punctuation, spaces to hyphens. */
const slug = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

const anchorCache = new Map();

function anchorsFor(file) {
  if (!anchorCache.has(file)) {
    const found = new Set();

    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const heading = /^#{1,6}\s+(.*)$/.exec(line);

      if (heading) {
        found.add(slug(heading[1]));
      }
    }

    anchorCache.set(file, found);
  }

  return anchorCache.get(file);
}

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
const problems = [];

for (const file of tracked) {
  const ext = file.slice(file.lastIndexOf('.'));

  if (SKIP_EXT.has(ext) || skipFile(file) || !existsSync(file) || statSync(file).isDirectory()) {
    continue;
  }

  let text;

  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue; // binary
  }

  for (const [, target, hash] of text.matchAll(DOC_REF)) {
    if (!existsSync(target)) {
      problems.push(`${file}: missing file -> ${target}`);
    } else if (hash && !anchorsFor(target).has(hash.slice(1))) {
      problems.push(`${file}: missing anchor -> ${target}${hash}`);
    }
  }
}

if (problems.length) {
  console.error(`Broken doc references (${problems.length}):`);

  for (const problem of problems) {
    console.error(`  ${problem}`);
  }

  process.exitCode = 1;
}
