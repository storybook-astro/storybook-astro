import { readFileSync } from 'node:fs';
import type { Integration } from './base.ts';
import type { Options as ViteSolidPluginOptions } from 'vite-plugin-solid';
import { importModule, resolveFromCandidates } from './moduleResolver.ts';

export type Options = Pick<ViteSolidPluginOptions, 'include' | 'exclude'>;

// Where storybook-solidjs-vite keeps its Solid 1 preview entry. 10.0.x
// exports `renderer/entry-preview`; 10.1–10.5 export no browser entry at all;
// 10.6 split it into `renderer/solid-legacy` (Solid 1) and
// `renderer/solid-next` (Solid 2). `@astrojs/solid-js` renders Solid 1, so
// only the Solid 1 entry matters here.
const ENTRY_PREVIEW_EXPORTS = ['./renderer/entry-preview', './renderer/solid-legacy'];

export class SolidIntegration implements Integration {
  readonly name = 'solid';
  readonly dependencies = ['@astrojs/solid-js', 'storybook-solidjs-vite', 'solid-js'];
  readonly options: Options;
  readonly renderer = {
    server: {
      name: '@astrojs/solid-js',
      entrypoint: '@astrojs/solid-js/server.js'
    },
    client: {
      name: '@astrojs/solid-js',
      entrypoint: '@astrojs/solid-js/client.js'
    }
  };

  #storybookEntryPreview: string | undefined;

  constructor(options: Options = {}) {
    this.options = options;
  }

  get storybookEntryPreview() {
    this.#storybookEntryPreview ??= findStorybookEntryPreview(process.cwd());

    return this.#storybookEntryPreview;
  }

  resolveClient(moduleName: string): string | undefined {
    if (moduleName.startsWith('@astrojs/solid-js/client')) {
      return `/@id/${moduleName}`;
    }
  }

  async loadIntegration(resolveFrom = process.cwd()) {
    const framework = await importModule<{
      default: (options: Options) => Awaited<ReturnType<Integration['loadIntegration']>>;
    }>('@astrojs/solid-js', resolveFrom);

    return framework.default(this.options);
  }
}

function findStorybookEntryPreview(resolveFrom: string) {
  let manifestPath: string;

  try {
    manifestPath = resolveFromCandidates('storybook-solidjs-vite/package.json', resolveFrom);
  } catch {
    throw new Error(
      '[storybook-astro] The Solid integration needs storybook-solidjs-vite. Install it with `npm install -D storybook-solidjs-vite`.'
    );
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
    version: string;
    exports?: Record<string, unknown>;
  };
  const entry = ENTRY_PREVIEW_EXPORTS.find((subpath) => subpath in (manifest.exports ?? {}));

  if (!entry) {
    throw new Error(
      `[storybook-astro] storybook-solidjs-vite ${manifest.version} has no Solid preview entry the Solid integration can load. Install 10.0.x or 10.6 and later.`
    );
  }

  return `storybook-solidjs-vite${entry.slice(1)}`;
}
