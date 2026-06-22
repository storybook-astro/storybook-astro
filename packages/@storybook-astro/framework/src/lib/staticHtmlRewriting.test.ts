import { describe, expect, test } from 'vitest';
import {
  addStaticStylesheets,
  rewriteBuiltModulePaths,
  type StaticCssMap,
  type StaticModuleMap
} from './staticHtmlRewriting.ts';

describe('rewriteBuiltModulePaths', () => {
  test('rewrites raw absolute source paths to their built-asset URL', () => {
    const html = `<astro-island component-url="/abs/src/CodeTabs.jsx" renderer-url="other"></astro-island>`;
    const staticModuleMap: StaticModuleMap = {
      '/abs/src/CodeTabs.jsx': './_astro/component-0-abc.js'
    };

    const result = rewriteBuiltModulePaths(html, staticModuleMap);

    expect(result).toContain('component-url="./_astro/component-0-abc.js"');
    expect(result).not.toContain('/abs/src/CodeTabs.jsx');
  });

  test('rewrites Vite /@fs/-prefixed paths too', () => {
    const html = `<script src="/@fs/abs/src/CodeTabs.jsx"></script>`;
    const staticModuleMap: StaticModuleMap = {
      '/abs/src/CodeTabs.jsx': './_astro/component-0-abc.js'
    };

    const result = rewriteBuiltModulePaths(html, staticModuleMap);

    expect(result).toContain('src="./_astro/component-0-abc.js"');
  });
});

describe('addStaticStylesheets', () => {
  test('prepends one <link> for each CSS file referenced by a built module in the HTML', () => {
    const html = `<astro-island component-url="./_astro/component-0-abc.js"></astro-island>`;
    const staticModuleMap: StaticModuleMap = {
      '/abs/src/CodeTabs.jsx': './_astro/component-0-abc.js'
    };
    const staticCssMap: StaticCssMap = {
      '/abs/src/CodeTabs.jsx': ['./_astro/component-0-xyz.css']
    };

    const result = addStaticStylesheets(html, { staticModuleMap, staticCssMap });

    expect(result.startsWith('<link rel="stylesheet" href="./_astro/component-0-xyz.css">')).toBe(
      true
    );
    expect(result).toContain(html);
  });

  test('matches via the original source path when the HTML still has it', () => {
    const html = `<astro-island component-url="/abs/src/CodeTabs.jsx"></astro-island>`;
    const staticModuleMap: StaticModuleMap = {};
    const staticCssMap: StaticCssMap = {
      '/abs/src/CodeTabs.jsx': ['./_astro/component-0-xyz.css']
    };

    const result = addStaticStylesheets(html, { staticModuleMap, staticCssMap });

    expect(result).toContain('<link rel="stylesheet" href="./_astro/component-0-xyz.css">');
  });

  test('deduplicates shared CSS files across multiple matched modules', () => {
    const html = `<astro-island component-url="./_astro/a.js"></astro-island><astro-island component-url="./_astro/b.js"></astro-island>`;
    const staticModuleMap: StaticModuleMap = {
      '/abs/a.jsx': './_astro/a.js',
      '/abs/b.jsx': './_astro/b.js'
    };
    const staticCssMap: StaticCssMap = {
      '/abs/a.jsx': ['./_astro/shared.css'],
      '/abs/b.jsx': ['./_astro/shared.css']
    };

    const result = addStaticStylesheets(html, { staticModuleMap, staticCssMap });

    const linkMatches = result.match(/<link rel="stylesheet" href="\.\/_astro\/shared\.css">/g) ?? [];

    expect(linkMatches.length).toBe(1);
  });

  test('returns HTML unchanged when no built modules match', () => {
    const html = `<div>no islands here</div>`;
    const staticModuleMap: StaticModuleMap = {
      '/abs/src/CodeTabs.jsx': './_astro/component-0-abc.js'
    };
    const staticCssMap: StaticCssMap = {
      '/abs/src/CodeTabs.jsx': ['./_astro/component-0-xyz.css']
    };

    const result = addStaticStylesheets(html, { staticModuleMap, staticCssMap });

    expect(result).toBe(html);
  });
});
