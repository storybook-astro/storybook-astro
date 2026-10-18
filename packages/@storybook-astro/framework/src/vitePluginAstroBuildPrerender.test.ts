import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, expect } from 'vitest';
import { buildAssetPathMap, rewriteAssetPaths } from './vitePluginAstroBuildPrerender.ts';

// rewriteAssetPaths takes the {exactMap, stemMap} structure buildAssetPathMap
// returns (cast through Map for the call signature). Build it directly here.
function assetMap(exact: Record<string, string>, stem: Record<string, string> = {}) {
  return { exactMap: new Map(Object.entries(exact)), stemMap: new Map(Object.entries(stem)) } as never;
}

const PUBLIC_DIR = '/project/public';
// Only written to when an asset has to be copied, which these first tests never do.
const OUT_DIR = '/project/storybook-static';

test('rewrites a public-dir /@fs/ image URL to its served root path, dropping the query', () => {
  // The exact shape Astro's image service emits during prerender for a public
  // image: an absolute /@fs/ path under public/ with origWidth/Height/Format.
  const html =
    '<img src="/@fs/project/public/images/image-placeholder.png?origWidth=1096&origHeight=480&origFormat=png" alt="x">';

  const result = rewriteAssetPaths(html, assetMap({}), PUBLIC_DIR, OUT_DIR);

  expect(result).toBe('<img src="/images/image-placeholder.png" alt="x">');
});

test('still rewrites bundle-emitted assets via the exact and stem maps', () => {
  const exact = rewriteAssetPaths(
    '<link href="/@fs/project/src/styles/app.css">',
    assetMap({ '/project/src/styles/app.css': '/assets/app-AbC123.css' }),
    PUBLIC_DIR,
    OUT_DIR
  );

  expect(exact).toContain('/assets/app-AbC123.css');

  const stem = rewriteAssetPaths(
    '<img src="/@fs/project/src/img/hero.png?foo=1">',
    assetMap({}, { 'hero.png': '/_astro/hero-CfMmZdup.png' }),
    PUBLIC_DIR,
    OUT_DIR
  );

  expect(stem).toContain('/_astro/hero-CfMmZdup.png');
});

test('points a story-arg image at the asset the build emitted, whatever characters its hash has', () => {
  // Issue #186: Astro emits images without originalFileNames, and this one's
  // hash contains a `-`, so it used to stay a /@fs/ URL while the emitted
  // asset went unused.
  const bundle = {
    '_astro/photo-CG2UH-wI.webp': {
      type: 'asset',
      fileName: '_astro/photo-CG2UH-wI.webp',
      names: ['photo.webp'],
      originalFileNames: [],
      source: new Uint8Array()
    }
  };
  const html =
    '<img src="/@fs/project/src/assets/photo.webp?origWidth=1024&amp;origHeight=1024&amp;origFormat=webp" alt="Photo">';

  const result = rewriteAssetPaths(html, buildAssetPathMap(bundle as never), PUBLIC_DIR, OUT_DIR);

  expect(result).toBe('<img src="/_astro/photo-CG2UH-wI.webp" alt="Photo">');
});

test('copies an image only the server-side render imported into _astro/ and points at the copy', async () => {
  // A component that imports its own image for <Image> (or as `?url`) never
  // puts it in Storybook's client build, so there is no emitted asset to map to.
  const projectDir = await mkdtemp(join(tmpdir(), 'storybook-astro-prerender-test-'));
  const outDir = join(projectDir, 'storybook-static');
  const logoPath = join(projectDir, 'src', 'components', 'logo.png');
  const logoBytes = Buffer.from('not really a png, but the bytes are what gets hashed');

  try {
    await mkdir(join(projectDir, 'src', 'components'), { recursive: true });
    await writeFile(logoPath, logoBytes);

    const html = [
      `<img src="/@fs${logoPath}?origWidth=64&amp;origHeight=64&amp;origFormat=png" alt="Image">`,
      `<img src="/@fs${logoPath}" alt="URL import">`
    ].join('');

    const result = rewriteAssetPaths(html, assetMap({}), join(projectDir, 'public'), outDir);
    const [copiedFile, ...otherFiles] = await readdir(join(outDir, '_astro'));

    expect(otherFiles).toEqual([]);
    expect(copiedFile).toMatch(/^logo-[0-9a-f]{8}\.png$/);
    expect(result).toBe(
      `<img src="/_astro/${copiedFile}" alt="Image"><img src="/_astro/${copiedFile}" alt="URL import">`
    );
    expect(await readFile(join(outDir, '_astro', copiedFile))).toEqual(logoBytes);
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test('leaves an unmatched /@fs/ path that does not exist on disk untouched', () => {
  const html = '<img src="/@fs/elsewhere/unknown.png">';

  expect(rewriteAssetPaths(html, assetMap({}), PUBLIC_DIR, OUT_DIR)).toBe(html);
});

test('copies the referenced image when two different emitted images share its file name', async () => {
  // Matching by name alone would point both references at whichever
  // `logo.png` happened to be emitted last.
  const projectDir = await mkdtemp(join(tmpdir(), 'storybook-astro-prerender-test-'));
  const outDir = join(projectDir, 'storybook-static');
  const brandLogoPath = join(projectDir, 'src', 'brand', 'logo.png');
  const bundle = {
    '_astro/logo-AAAAAAAA.png': {
      type: 'asset',
      fileName: '_astro/logo-AAAAAAAA.png',
      names: ['logo.png'],
      originalFileNames: [],
      source: new Uint8Array()
    },
    '_astro/logo-BBBBBBBB.png': {
      type: 'asset',
      fileName: '_astro/logo-BBBBBBBB.png',
      names: ['logo.png'],
      originalFileNames: [],
      source: new Uint8Array()
    }
  };

  try {
    await mkdir(join(projectDir, 'src', 'brand'), { recursive: true });
    await writeFile(brandLogoPath, 'brand logo bytes');

    const result = rewriteAssetPaths(
      `<img src="/@fs${brandLogoPath}">`,
      buildAssetPathMap(bundle as never),
      join(projectDir, 'public'),
      outDir
    );
    const [copiedFile] = await readdir(join(outDir, '_astro'));

    expect(result).toBe(`<img src="/_astro/${copiedFile}">`);
    expect(await readFile(join(outDir, '_astro', copiedFile), 'utf-8')).toBe('brand logo bytes');
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test('never publishes component source behind an unmatched /@fs/ URL', async () => {
  // A missed island rewrite must stay visibly broken, not ship its source code.
  const projectDir = await mkdtemp(join(tmpdir(), 'storybook-astro-prerender-test-'));
  const outDir = join(projectDir, 'storybook-static');
  const componentPath = join(projectDir, 'src', 'Counter.tsx');

  try {
    await mkdir(join(projectDir, 'src'), { recursive: true });
    await writeFile(componentPath, 'export default function Counter() {}');

    const html = `<astro-island component-url="/@fs${componentPath}"></astro-island>`;

    expect(rewriteAssetPaths(html, assetMap({}), join(projectDir, 'public'), outDir)).toBe(html);
    await expect(readdir(join(outDir, '_astro'))).rejects.toThrow();
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});
