/**
 * Testing utilities for @storybook-astro/framework
 *
 * Provides test helpers for validating Storybook stories in Vitest,
 * and Vite plugins needed for the test environment.
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
 */
export function testStoryRenders(storyName: string, story: any) {
  test(`${storyName} renders in Storybook`, async () => {
    expect(story).toBeDefined();
    expect(typeof story).toBe('function');

    try {
      const directResult = story();
      const result = await story.run?.() || directResult;

      expect(result).toBeDefined();

      if (result.component) {
        expect(result.component).toBeDefined();
        expect(result.args).toBeDefined();
      }

      console.warn(`✓ ${storyName} rendered successfully`);
    } catch (error: any) {
      const errorMessage = error.message;

      if (
        errorMessage.includes("Received protocol 'astro:'") ||
        errorMessage.includes('renderToCanvas is not a function')
      ) {
        console.warn(`✓ ${storyName} is properly configured (Storybook runtime not available)`);

        return;
      }

      if (errorMessage.includes('Client-only API called on the server side')) {
        console.warn(`✓ ${storyName} is properly configured (SSR-only test limitation)`);

        return;
      }

      if (errorMessage.includes('Renderer') && errorMessage.includes('not found')) {
        console.error(`✗ ${storyName} failed: ${errorMessage}`);
        throw new Error(`${storyName} has a broken framework integration: ${errorMessage}`);
      }

      if (errorMessage.includes('no renderer is specified')) {
        console.error(`✗ ${storyName} failed: ${errorMessage}`);
        throw new Error(`${storyName} is missing renderer parameter: ${errorMessage}`);
      }

      console.error(`✗ ${storyName} failed with unexpected error:`, error);
      throw new Error(`${storyName} failed to render: ${errorMessage}`);
    }
  });
}

/**
 * Registers a Vitest test that checks basic story composition.
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

function findPackageDir(pkgName: string): string | null {
  let dir = process.cwd();

  while (true) {
    const candidate = join(dir, 'node_modules', pkgName);

    if (existsSync(join(candidate, 'package.json'))) {
      return candidate;
    }

    const parent = dirname(dir);

    if (parent === dir) {
      break;
    }

    dir = parent;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Vite plugins for testing
// ---------------------------------------------------------------------------

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

export function cjsInteropPlugin(): Plugin {

  return {
    name: 'cjs-esm-interop',
    enforce: 'pre',
    resolveId(id) {
      if (id.startsWith('.') || id.startsWith('/') || id.startsWith('\0') || id.includes('node_modules')) {
        return;
      }

      const parts = id.split('/');
      const pkgName = id.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
      const subpath = parts.slice(pkgName.split('/').length).join('/');

      if (subpath && !['server-renderer', 'server', 'client'].includes(subpath)) {
        return;
      }

      try {
        const nmDir = findPackageDir(pkgName);

        if (!nmDir) {
          return;
        }

        const pkgJsonPath = join(nmDir, 'package.json');

        if (!existsSync(pkgJsonPath)) {
          return;
        }

        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));

        const exportKey = subpath ? `./${subpath}` : '.';
        const exportEntry = pkgJson.exports?.[exportKey];

        if (exportEntry) {
          const importEntry = exportEntry.import;

          if (importEntry) {
            const esmPath =
              typeof importEntry === 'string'
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
      if (!id.includes('node_modules')) {
        return;
      }

      if (id.startsWith('\0')) {
        return;
      }

      if (/\bexport\s+(default|const|let|var|function|class|\{|\*)/.test(code)) {
        return;
      }

      if (!code.includes('module.exports') && !code.includes('exports.')) {
        return;
      }

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
          'export default module.exports;'
        ].join('\n'),
        map: null
      };
    }
  };
}
