import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { AstroInlineConfig, build as astroBuild } from 'astro';
import {
  loadUserAstroViteResolveAlias,
  loadUserAstroVitePlugins,
  mergeFrameworkAndUserIntegrations
} from '../loadUserAstroConfig.ts';
import { FRAMEWORK_RUNTIME_PACKAGES } from '../lib/hydratedComponentBuild.ts';
import { resolveRulesConfigFilePath } from '../rules-options.ts';
import type { FrameworkOptions } from '../types.ts';
import { moduleMockSwitchesPlugin } from '../vite/moduleMockSwitchesPlugin.ts';
import { postcssBrowserFieldPlugin } from '../vite/postcssBrowserFieldPlugin.ts';
import { sanitizeConfigPlugin } from '../vite/sanitizeConfigPlugin.ts';
import { serverAuthPlugin } from '../vite/serverAuthPlugin.ts';
import { storyRulesPlugin } from '../vite/storyRulesPlugin.ts';
import { apiRouteSource, renderPageSource, storyNodeSource } from './files.ts';
import type { RenderPages } from './renderRequest.ts';
import type { StoryAstroImports } from './vitePluginStoryAstroImports.ts';

type ServerFrameworkOptions = Extract<FrameworkOptions, { renderMode: 'server' }>;

/**
 * Where the Storybook build leaves the story → component map and where the
 * render app's sources are generated. `.astro/` is Astro's own generated
 * directory, which Astro projects already ignore in git.
 */
export function serverAppDir(projectDir: string) {
  return resolve(projectDir, '.astro', 'storybook-server');
}

export function storyAstroImportsFile(projectDir: string) {
  return resolve(serverAppDir(projectDir), 'story-astro-imports.json');
}

/**
 * Builds server mode's render app: a small Astro app with one render page per
 * story file and the `/api` routes, built by `astro build` with the adapter's
 * official Astro adapter. The Storybook UI is its public directory, so the
 * host serves both from one deployment.
 */
export async function buildServerApp(options: {
  projectDir: string;
  configDir: string;
  staticDir: string;
  frameworkOptions: ServerFrameworkOptions;
}) {
  const { projectDir, frameworkOptions } = options;
  const resolveFrom = frameworkOptions.resolveFrom ?? projectDir;
  const appDir = serverAppDir(projectDir);
  const srcDir = resolve(appDir, 'src');
  const renderPagesDir = resolve(srcDir, 'pages', 'storybook-astro', 'render');
  const groups = await groupStoriesByFile({ ...options, resolveFrom });
  const renderPages: RenderPages = { stories: {}, components: {} };

  await rm(srcDir, { recursive: true, force: true });
  await mkdir(renderPagesDir, { recursive: true });
  await mkdir(resolve(srcDir, 'pages', 'api'), { recursive: true });
  await writeFile(resolve(srcDir, 'StoryNode.astro'), storyNodeSource());

  for (const [index, group] of groups.entries()) {
    const pagePath = `/storybook-astro/render/${index}`;
    const pageFile = resolve(renderPagesDir, `${index}.astro`);
    const components = Object.fromEntries(
      group.components.map((moduleId) => [moduleId, importSpecifier(pageFile, moduleId)])
    );

    await writeFile(
      pageFile,
      renderPageSource({
        components,
        storyNodeImport: importSpecifier(pageFile, resolve(srcDir, 'StoryNode.astro'))
      })
    );

    for (const storyId of group.storyIds) {
      renderPages.stories[storyId] = pagePath;
    }

    for (const moduleId of group.components) {
      renderPages.components[moduleId] ??= pagePath;
    }
  }

  await writeFile(resolve(srcDir, 'pages', 'api', '[...path].js'), apiRouteSource(renderPages));

  const integrations = await mergeFrameworkAndUserIntegrations(
    await Promise.all(
      (frameworkOptions.integrations ?? []).map((integration) => integration.loadIntegration(resolveFrom))
    ),
    resolveFrom
  );
  const alias = await loadUserAstroViteResolveAlias(resolveFrom);
  const { adapter } = frameworkOptions.server;
  const config: AstroInlineConfig = {
    ...adapter.astroConfig,
    root: projectDir,
    // The render app is generated from Storybook's options, like the dev
    // render server; the user's astro.config contributes the same parts it
    // does there (integrations, Vite plugins, aliases).
    configFile: false,
    srcDir,
    publicDir: options.staticDir,
    outDir: resolve(projectDir, 'storybook-server'),
    output: 'server',
    adapter: await adapter.createAstroAdapter({ projectDir, appDir }),
    integrations,
    devToolbar: { enabled: false },
    // Story args carry images as the Storybook build emitted them; render
    // them as they are, like dev and static builds do, instead of through an
    // `/_image` endpoint that would look for them in the render app's sources.
    image: { service: { entrypoint: '@storybook-astro/framework/image-service' } },
    // The project's Astro may use a different Vite copy than this package's
    // types come from; the config is plain objects either way.
    vite: {
      plugins: [
        ...(await loadUserAstroVitePlugins(resolveFrom)),
        sanitizeConfigPlugin(frameworkOptions.sanitization),
        serverAuthPlugin(frameworkOptions.server),
        storyRulesPlugin(frameworkOptions.storyRules, resolveFrom),
        postcssBrowserFieldPlugin(),
        moduleMockSwitchesPlugin({
          rulesConfigFilePath: resolveRulesConfigFilePath(frameworkOptions.storyRules, resolveFrom),
          registryModule: '@storybook-astro/framework/server-app'
        })
      ],
      resolve: {
        ...(alias ? { alias } : {}),
        // Stories in another workspace package can reach a second copy of a
        // UI framework; islands only work with one (hooks break otherwise).
        dedupe: FRAMEWORK_RUNTIME_PACKAGES
      },
      // The runtime imports the virtual modules above, so Vite must bundle it.
      ssr: { noExternal: ['@storybook-astro/framework'] }
    } as AstroInlineConfig['vite']
  };
  const { build } = await importProjectAstro(projectDir);

  await build(config);
}

type StoryGroup = { storyIds: string[]; components: string[] };

/**
 * One group per story file: its stories, and every `.astro` component the
 * file reaches plus the ones `.storybook/preview` reaches (global decorators).
 */
async function groupStoriesByFile(options: {
  projectDir: string;
  resolveFrom: string;
  configDir: string;
  staticDir: string;
}) {
  const index = JSON.parse(await readFile(resolve(options.staticDir, 'index.json'), 'utf-8')) as {
    entries?: Record<string, { type?: string; id: string; importPath?: string; componentPath?: string }>;
  };
  const astroImports = JSON.parse(
    await readFile(storyAstroImportsFile(options.resolveFrom), 'utf-8')
  ) as StoryAstroImports;
  const previewComponents = Object.entries(astroImports)
    .filter(([moduleId]) => /^preview\.[cm]?[jt]sx?$/.test(relative(options.configDir, moduleId)))
    .flatMap(([, components]) => components);
  const groups = new Map<string, StoryGroup>();

  for (const entry of Object.values(index.entries ?? {})) {
    if (entry.type !== 'story' || !entry.importPath) {
      continue;
    }

    // The module graph holds real paths, so a story file or component reached
    // through a workspace symlink is looked up by its real path too.
    const storyFile = await realpath(resolve(options.projectDir, entry.importPath));
    let group = groups.get(storyFile);

    if (!group) {
      const components = new Set([...(astroImports[storyFile] ?? []), ...previewComponents]);

      if (entry.componentPath?.endsWith('.astro')) {
        components.add(await realpath(resolve(options.projectDir, entry.componentPath)));
      }

      group = { storyIds: [], components: [...components] };
      groups.set(storyFile, group);
    }

    group.storyIds.push(entry.id);
  }

  return [...groups.values()].filter((group) => group.components.length > 0);
}

function importSpecifier(fromFile: string, toFile: string) {
  const specifier = relative(dirname(fromFile), toFile).replace(/\\/g, '/');

  return specifier.startsWith('.') ? specifier : `./${specifier}`;
}

/** The project's own `astro`, so the render app is built by the Astro version it uses. */
async function importProjectAstro(projectDir: string): Promise<{ build: typeof astroBuild }> {
  const require = createRequire(resolve(projectDir, 'package.json'));

  return import(pathToFileURL(require.resolve('astro')).href);
}
