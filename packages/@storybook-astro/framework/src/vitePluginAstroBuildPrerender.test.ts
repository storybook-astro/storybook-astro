import { test, expect } from 'vitest';
import { rewriteAssetPaths } from './vitePluginAstroBuildPrerender.ts';

// rewriteAssetPaths takes the {exactMap, stemMap} structure buildAssetPathMap
// returns (cast through Map for the call signature). Build it directly here.
function assetMap(exact: Record<string, string>, stem: Record<string, string> = {}) {
  return { exactMap: new Map(Object.entries(exact)), stemMap: new Map(Object.entries(stem)) } as never;
}

const PUBLIC_DIR = '/project/public';

test('rewrites a public-dir /@fs/ image URL to its served root path, dropping the query', () => {
  // The exact shape Astro's image service emits during prerender for a public
  // image: an absolute /@fs/ path under public/ with origWidth/Height/Format.
  const html =
    '<img src="/@fs/project/public/images/image-placeholder.png?origWidth=1096&origHeight=480&origFormat=png" alt="x">';

  const result = rewriteAssetPaths(html, assetMap({}), PUBLIC_DIR);

  expect(result).toBe('<img src="/images/image-placeholder.png" alt="x">');
});

test('still rewrites bundle-emitted assets via the exact and stem maps', () => {
  const exact = rewriteAssetPaths(
    '<link href="/@fs/project/src/styles/app.css">',
    assetMap({ '/project/src/styles/app.css': '/assets/app-AbC123.css' }),
    PUBLIC_DIR
  );

  expect(exact).toContain('/assets/app-AbC123.css');

  const stem = rewriteAssetPaths(
    '<img src="/@fs/project/src/img/hero.png?foo=1">',
    assetMap({}, { 'hero.png': '/_astro/hero-CfMmZdup.png' }),
    PUBLIC_DIR
  );

  expect(stem).toContain('/_astro/hero-CfMmZdup.png');
});

test('leaves an unmatched /@fs/ path (outside public, not a bundle asset) untouched', () => {
  const html = '<img src="/@fs/elsewhere/unknown.png">';

  expect(rewriteAssetPaths(html, assetMap({}), PUBLIC_DIR)).toBe(html);
});
