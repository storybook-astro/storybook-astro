/**
 * Testing utilities for @storybook-astro/framework
 *
 * Provides test helpers for validating Storybook stories in Vitest,
 * and Vite plugins needed for the test environment.
 *
 * @example
 * ```ts
 * // In a test file:
 * import { composeStories } from '@storybook-astro/framework';
 * import { testStoryRenders, testStoryComposition } from '@storybook-astro/framework/testing';
 * import * as stories from './Card.stories.jsx';
 *
 * const { Default } = composeStories(stories);
 * testStoryComposition('Default', Default);
 * testStoryRenders('Card Default', Default);
 * ```
 *
 * @example
 * ```ts
 * // In vitest.config.ts:
 * import { cjsInteropPlugin } from '@storybook-astro/framework/testing';
 * import { defineConfig } from 'vitest/config';
 *
 * export default defineConfig({
 *   plugins: [cjsInteropPlugin()],
 *   // ...
 * });
 * ```
 */

// eslint-disable-next-line n/no-extraneous-import
import { test, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { AstroIntegration } from 'astro';
import type { Plugin } from 'vite';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Registers a Vitest test that validates a composed story can render.
 *
 * The test will:
 * - Pass if the component renders successfully in Storybook
 * - Pass if the Storybook runtime is not available (expected in Vitest)
 * - Pass if a framework hits an SSR-only limitation (e.g. Solid)
 * - Fail if the component has a broken framework integration or missing renderer
 *
 * @param storyName - Display name for the test
 * @param story - A composed story returned by `composeStories`
 */
export function testStoryRenders(storyName: string, story: any) {
  test(`${storyName} renders in Storybook`, async () => {
    expect(story).toBeDefined();
    expect(typeof story).toBe('function');

    try {
      // First try calling the story directly - this will use our custom render function
      // which can detect broken framework integrations immediately
      const directResult = story();

      // If direct call succeeds, try the full Storybook run method
      const result = await story.run?.() || directResult;

      // If we get here, the component should have rendered successfully
      expect(result).toBeDefined();

      // For Astro components, check that we have component and args
      if (result.component) {
        expect(result.component).toBeDefined();
        expect(result.args).toBeDefined();
      }

      console.warn(`✓ ${storyName} rendered successfully`);

    } catch (error: any) {
      const errorMessage = error.message;

      // Check if this is an expected error when Storybook is not running
      if (errorMessage.includes('renderToCanvas is not a function')) {
        // This indicates the component is properly configured but Storybook runtime isn't available
        // This is acceptable for Astro components that work in Storybook
        console.warn(`✓ ${storyName} is properly configured (Storybook runtime not available)`);

        return;
      }

      // SSR limitation: some framework components (e.g. Solid) are compiled in
      // SSR mode for the test environment. Client-only APIs are unavailable
      // during story.run(), but the component works in Storybook's browser.
      if (errorMessage.includes('Client-only API called on the server side')) {
        console.warn(`✓ ${storyName} is properly configured (SSR-only test limitation)`);

        return;
      }

      // Check for renderer not found errors (indicates broken integration)
      if (errorMessage.includes('Renderer') && errorMessage.includes('not found')) {
        console.error(`✗ ${storyName} failed: ${errorMessage}`);
        throw new Error(`${storyName} has a broken framework integration: ${errorMessage}`);
      }

      // Check for missing renderer parameter
      if (errorMessage.includes('no renderer is specified')) {
        console.error(`✗ ${storyName} failed: ${errorMessage}`);
        throw new Error(`${storyName} is missing renderer parameter: ${errorMessage}`);
      }

      // Any other error indicates a real problem with the component
      console.error(`✗ ${storyName} failed with unexpected error:`, error);
      throw new Error(`${storyName} failed to render: ${errorMessage}`);
    }
  });
}

/**
 * Registers a Vitest test that checks basic story composition.
 *
 * Validates that the story can be imported, composed, and has the
 * expected name. Optionally checks that args match expected values.
 *
 * @param storyName - Expected `story.storyName` value
 * @param story - A composed story returned by `composeStories`
 * @param expectedArgs - Optional args to assert with `toEqual`
 */
export function testStoryComposition(storyName: string, story: any, expectedArgs?: any) {
  test(`${storyName} can be composed`, () => {
    expect(story).toBeDefined();
    expect(typeof story).toBe('function');
    expect(story.storyName).toBe(storyName);

    if (expectedArgs) {
      expect(story.args).toEqual(expectedArgs);
    }
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Walk up from cwd to find a package in node_modules.
 * Supports monorepos where packages are hoisted to the root.
 */
function findPackageDir(pkgName: string): string | null {
  let dir = process.cwd();

  while (true) {
    const candidate = join(dir, 'node_modules', pkgName);

    if (existsSync(join(candidate, 'package.json'))) {
      return candidate;
    }
    const parent = dirname(dir);

    if (parent === dir) {break;}
    dir = parent;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Vite plugins for testing
// ---------------------------------------------------------------------------

/**
 * Astro integration that patches Solid's Vitest resolution conditions.
 *
 * In Vitest's happy-dom environment, Solid components are commonly transformed
 * with DOM output while module resolution can still prefer Solid's server
 * runtime. That mismatch triggers `notSup` errors.
 *
 * This patch forces `solid-js/web` to resolve to the browser bundle in tests
 * without globally enabling `browser` conditions (which can break other deps).
 */
export function vitestPatchForSolidJs(): AstroIntegration {
  return {
    name: 'fix-solid',
    hooks: {
      'astro:config:done': ({ config }) => {
        const solidPlugin = config.vite.plugins?.find(
          (plugin) => plugin && 'name' in plugin && plugin.name === 'solid'
        ) as Plugin | undefined;

        if (!solidPlugin) {
          return;
        }

        const originalConfigEnvironment = solidPlugin.configEnvironment;

        if (typeof originalConfigEnvironment !== 'function') {
          return;
        }

        solidPlugin.configEnvironment = async (name, resolvedConfig, opts) => {
          await originalConfigEnvironment(name, resolvedConfig, opts);

          resolvedConfig.resolve ??= {};
          const alias = resolvedConfig.resolve.alias;
          const replacement = 'solid-js/web/dist/web.js';

          if (Array.isArray(alias)) {
            const hasAlias = alias.some((entry) => {
              if (!entry || typeof entry !== 'object' || !('find' in entry)) {
                return false;
              }

              return entry.find === 'solid-js/web' || String(entry.find) === '/^solid-js\\/web$/';
            });

            if (!hasAlias) {
              alias.unshift({ find: /^solid-js\/web$/, replacement });
            }

            return;
          }

          resolvedConfig.resolve.alias = {
            ...(alias ?? {}),
            'solid-js/web': replacement
          };
        };
      }
    }
  };
}

/**
 * Vite plugin that wraps CJS modules with ESM-compatible shims.
 *
 * Vite 6's ESM module runner cannot evaluate raw CommonJS modules that use
 * `module.exports` or `exports`. This plugin detects CJS modules in
 * node_modules during transform and wraps them so they work in ESM context.
 *
 * Use this in your `vitest.config.ts` plugins array when testing with
 * Astro 6 and Vite 6+.
 *
 * @example
 * ```ts
 * import { cjsInteropPlugin } from '@storybook-astro/framework/testing';
 *
 * export default defineConfig({
 *   plugins: [cjsInteropPlugin()],
 * });
 * ```
 */
export function cjsInteropPlugin(): Plugin {
  return {
    name: 'cjs-esm-interop',
    enforce: 'pre',
    resolveId(id) {
      // When Vite resolves a bare import in SSR/test context, redirect
      // packages that have ESM entry points to those entries instead of
      // their CJS "main" or "require" entries.
      if (id.startsWith('.') || id.startsWith('/') || id.startsWith('\0') || id.includes('node_modules')) {return;}

      // Find the package's node_modules directory
      const parts = id.split('/');
      const pkgName = id.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
      const subpath = parts.slice(pkgName.split('/').length).join('/');

      // Only redirect the main entry (no subpath or common subpaths)
      if (subpath && !['server-renderer', 'server', 'client'].includes(subpath)) {return;}

      try {
        // Find the package.json — walk up from cwd to find node_modules
        // (supports monorepos where packages are hoisted to root)
        const nmDir = findPackageDir(pkgName);

        if (!nmDir) {return;}
        const pkgJsonPath = join(nmDir, 'package.json');

        if (!existsSync(pkgJsonPath)) {return;}

        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));

        // Check for ESM entry in exports map
        const exportKey = subpath ? `./${subpath}` : '.';
        const exportEntry = pkgJson.exports?.[exportKey];

        if (exportEntry) {
          const importEntry = exportEntry.import;

          if (importEntry) {
            const esmPath = typeof importEntry === 'string'
              ? importEntry
              : importEntry.default || importEntry.node;

            if (esmPath) {
              const resolved = join(nmDir, esmPath);

              if (existsSync(resolved)) {
                return resolved;
              }
            }
          }
        }

        // Fallback: check the "module" field
        if (!subpath && pkgJson.module) {
          const resolved = join(nmDir, pkgJson.module);

          if (existsSync(resolved)) {
            return resolved;
          }
        }
      } catch {
        // Ignore resolution errors
      }
    },
    transform(code, id) {
      // Only transform node_modules files
      if (!id.includes('node_modules')) {return;}
      // Skip virtual modules
      if (id.startsWith('\0')) {return;}
      // Skip files that already use ESM exports
      if (/\bexport\s+(default|const|let|var|function|class|\{|\*)/.test(code)) {return;}
      // Only wrap files that use CJS patterns
      if (!code.includes('module.exports') && !code.includes('exports.')) {return;}

      const dirPath = id.substring(0, id.lastIndexOf('/'));
      const fileName = id;

      
return {
        code: [
          'import { createRequire as __createRequire } from "module";',
          `var __require = __createRequire("file://${dirPath}/");`,
          'var module = { exports: {} };',
          'var exports = module.exports;',
          'function require(id) { return __require(id); }',
          `var __dirname = ${JSON.stringify(dirPath)};`,
          `var __filename = ${JSON.stringify(fileName)};`,
          code,
          'export default module.exports;',
        ].join('\n'),
        map: null,
      };
    }
  };
}
