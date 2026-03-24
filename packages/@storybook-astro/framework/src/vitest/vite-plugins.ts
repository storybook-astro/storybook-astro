import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AstroIntegration } from 'astro';
import type { Plugin } from 'vite';

type ResolveConfig = { resolve?: { alias?: Record<string, string> | Array<{ find: string | RegExp; replacement: string }> } };

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

        // Use bracket notation to avoid type assignment issues
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (solidPlugin as any).configEnvironment = async (name: unknown, resolvedConfig: unknown, opts: unknown): Promise<void> => {
          await (originalConfigEnvironment as (name: unknown, config: unknown, opts: unknown) => Promise<void>)(name, resolvedConfig, opts);

          const config = resolvedConfig as ResolveConfig;

          config.resolve ??= {};
          const alias = config.resolve.alias;
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

          config.resolve!.alias = {
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
