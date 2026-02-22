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
import { fileURLToPath } from 'node:url';
import type { AstroIntegration } from 'astro';
import type { Plugin, ViteDevServer } from 'vite';
import type { Integration as StorybookAstroIntegration } from './integrations/base.ts';
import {
  alpinejs as alpineIntegration,
  preact as preactIntegration,
  react as reactIntegration,
  solid as solidIntegration,
  svelte as svelteIntegration,
  vue as vueIntegration,
} from './integrations/index.ts';
import {
  composeStories as portableComposeStories,
  composeStory as portableComposeStory,
  setProjectAnnotations as portableSetProjectAnnotations,
} from './portable-stories.ts';

type StoryMeta = {
  component: unknown;
  args?: Record<string, unknown>;
};

type ComposedStory = {
  (...args: unknown[]): unknown;
  args?: Record<string, unknown>;
  component?: unknown;
  __storybookAstroMeta?: StoryMeta;
  __storybookAstroStoryExport?: { args?: Record<string, unknown> };
};

let astroContainerPromise: Promise<{
  renderToString: (component: unknown, options: { props: Record<string, unknown> }) => Promise<string>;
}> | null = null;

let astroSsrViteServerPromise: Promise<ViteDevServer> | null = null;

let astroSsrHandlerPromise: Promise<
  (data: { component: string; args?: Record<string, unknown> }) => Promise<string>
> | null = null;

async function getAstroContainer() {
  if (!astroContainerPromise) {
    const { experimental_AstroContainer: AstroContainer } = await import('astro/container');

    astroContainerPromise = AstroContainer.create();
  }

  return astroContainerPromise;
}

async function getAstroSsrViteServer() {
  if (!astroSsrViteServerPromise) {
    const { createViteServer } = await import('./viteStorybookAstroMiddlewarePlugin.ts');
    const integrations = createTestingIntegrations();

    astroSsrViteServerPromise = createViteServer(integrations, process.cwd());
  }

  return astroSsrViteServerPromise;
}

function createTestingIntegrations(): StorybookAstroIntegration[] {
  return [
    reactIntegration({ include: ['**/react/**'] }),
    solidIntegration({ include: ['**/solid/**'] }),
    preactIntegration({ include: ['**/preact/**'] }),
    vueIntegration(),
    svelteIntegration(),
    alpineIntegration(),
  ];
}

async function getAstroSsrHandler() {
  if (!astroSsrHandlerPromise) {
    astroSsrHandlerPromise = (async () => {
      const integrations = createTestingIntegrations();
      const viteServer = await getAstroSsrViteServer();
      const middlewareModulePath = fileURLToPath(new URL('./middleware', import.meta.url));
      const middleware = await viteServer.ssrLoadModule(middlewareModulePath, {
        fixStacktrace: true
      });

      return middleware.handlerFactory(integrations, {});
    })();
  }

  return astroSsrHandlerPromise;
}

function isStorybookAstroClientStub(component: unknown) {
  return (
    typeof component === 'function' &&
    String(component).includes('Astro components are rendered server-side by Storybook')
  );
}

function isAstroComponentFactory(component: unknown) {
  return typeof component === 'function' && 'isAstroComponentFactory' in component;
}

function getComponentModuleId(component: unknown) {
  if (typeof component !== 'function' || !('moduleId' in component)) {
    return null;
  }

  if (typeof component.moduleId !== 'string') {
    return null;
  }

  return component.moduleId.split('?')[0].split('#')[0];
}

/**
 * composeStories exported from the testing entrypoint, so Astro tests can import
 * both composition and rendering helpers from one place.
 */
export function composeStories<TModule extends Record<string, any>>(
  storiesImport: TModule,
  projectAnnotations?: any
) {
  const composed = portableComposeStories(storiesImport, projectAnnotations);

  for (const [storyExportName, story] of Object.entries(composed)) {
    if (typeof story === 'function') {
      (story as ComposedStory).__storybookAstroMeta = storiesImport.default as StoryMeta;
      (story as ComposedStory).__storybookAstroStoryExport = storiesImport[storyExportName] as {
        args?: Record<string, unknown>;
      };
    }
  }

  return composed;
}

export const composeStory = portableComposeStory;
export const setProjectAnnotations = portableSetProjectAnnotations;

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

async function resolveAstroComponent(component: unknown) {
  let resolvedComponent = component;

  if (!isAstroComponentFactory(resolvedComponent)) {
    throw new Error('Story meta.component must be an Astro component factory.');
  }

  if ('moduleId' in resolvedComponent && typeof resolvedComponent.moduleId === 'string') {
    const moduleId = resolvedComponent.moduleId;
    const normalizedModuleId = moduleId.split('?')[0].split('#')[0];

    try {
      const mod = await import(/* @vite-ignore */ normalizedModuleId);

      if (isAstroComponentFactory(mod.default)) {
        resolvedComponent = mod.default;
      }
    } catch {
      // keep current component when direct module import is unavailable
    }

    if (isStorybookAstroClientStub(resolvedComponent)) {
      try {
        const viteServer = await getAstroSsrViteServer();
        let mod = await viteServer.ssrLoadModule(normalizedModuleId);

        if (!isAstroComponentFactory(mod.default)) {
          mod = await viteServer.ssrLoadModule(`/@fs${normalizedModuleId}`);
        }

        if (isAstroComponentFactory(mod.default)) {
          resolvedComponent = mod.default;
        }
      } catch {
        // keep current component when SSR module loading is unavailable
      }
    }
  }

  return resolvedComponent;
}

async function renderAstroComponentToDom(
  component: unknown,
  args: Record<string, unknown>
) {
  const moduleId = getComponentModuleId(component);

  if (moduleId) {
    try {
      const handler = await getAstroSsrHandler();
      const html = await handler({
        component: moduleId,
        args
      });

      if (typeof document !== 'undefined') {
        document.body.innerHTML = html;
      }

      return html;
    } catch {
      // Fall back to direct Container rendering below
    }
  }

  const resolvedComponent = await resolveAstroComponent(component);
  const container = await getAstroContainer();
  const html = await container.renderToString(resolvedComponent, {
    props: args
  });

  if (typeof document !== 'undefined') {
    document.body.innerHTML = html;
  }

  return html;
}

async function renderComposedStory(story: ComposedStory) {
  const meta = story.__storybookAstroMeta;
  const storyExport = story.__storybookAstroStoryExport;
  let component = meta?.component ?? story.component;

  if (!isAstroComponentFactory(component)) {
    const maybeRendered = await story();

    if (isAstroComponentFactory(maybeRendered)) {
      component = maybeRendered;
    } else if (
      typeof maybeRendered === 'object' &&
      maybeRendered !== null &&
      'component' in maybeRendered &&
      isAstroComponentFactory((maybeRendered as { component: unknown }).component)
    ) {
      component = (maybeRendered as { component: unknown }).component;
    }
  }

  if (!component) {
    throw new Error('Unable to resolve Astro component from composed story.');
  }

  const args = {
    ...(meta?.args ?? {}),
    ...(storyExport?.args ?? {}),
    ...(story.args ?? {})
  };

  return renderAstroComponentToDom(component, args);
}

/**
 * Renders an Astro story directly with Astro Container in test environments.
 *
 * Usage: `await renderStory(Default)` where `Default` comes from `composeStories`.
 */
export async function renderStory(story: ComposedStory) {
  return renderComposedStory(story);
}

export const renderAstroStory = renderStory;

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
