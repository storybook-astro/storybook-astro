import type { IndexEntry, Options, StoryDocsPayload } from 'storybook/internal/types';
import { afterEach, describe, expect, test, vi } from 'vitest';
/* eslint-disable camelcase -- the preset keys Storybook core reads. */
import {
  experimental_docgenProvider,
  experimental_manifests,
  experimental_storyDocsProvider,
  features as applyFeatures,
  isDocgenProviderEnabled
} from './preset.ts';
/* eslint-enable camelcase */
import type { FrameworkOptions } from './types.ts';
import type * as StoryDocsPayloadModule from './docgen/story-docs-payload.ts';

interface Scenario {
  configDir?: string;
  features?: Record<string, unknown>;
  frameworkOptions?: Partial<FrameworkOptions>;
  build?: Options['build'];
}

/** The slice of Storybook's preset `Options` the docgen provider reads. */
function storybookOptions({
  configDir = '/project/.storybook',
  features,
  frameworkOptions,
  build
}: Scenario = {}): Options {
  return {
    configDir,
    build,
    presets: {
      apply: async (key: string) =>
        key === 'features' ? (features ?? {}) : (frameworkOptions ?? {})
    }
  } as unknown as Options;
}

// The Storybook version the preset sees. Storybook 11 renamed the flag, so the
// version decides which name turns the Docgen Server on.
const installed = vi.hoisted(() => ({ storybook: '10.6.0' }));

// What Storybook 11's docgen helpers report. They aren't in Storybook 10, so
// they're only exported while the version above is 11 or newer.
const storybook11 = vi.hoisted(() => ({
  typescriptReady: true,
  typescriptChecks: 0,
  typescriptResolvedTo: undefined as string | undefined
}));

// The project's main config, as `loadMainConfig` returns it, and how often
// it's been loaded.
const mainConfig = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
  loads: 0
}));

const isStorybook11 = () => Number.parseInt(installed.storybook, 10) >= 11;

vi.mock('storybook/internal/common', async (importOriginal) => {
  const actual = await importOriginal<{ versions: Record<string, string> }>();

  return {
    ...actual,
    versions: {
      ...actual.versions,
      get storybook() {
        return installed.storybook;
      }
    },
    get isTypeScriptReadyForDocgen() {
      return isStorybook11()
        ? async (resolve: (specifier: string) => string) => {
            storybook11.typescriptChecks += 1;
            storybook11.typescriptResolvedTo = resolve('typescript/package.json');

            return storybook11.typescriptReady;
          }
        : undefined;
    },
    loadMainConfig: async () => {
      mainConfig.loads += 1;

      return mainConfig.value;
    }
  };
});

// Lets a test make the story docs builder throw, as an unexpected stories
// file shape could.
const storyDocsBuilder = vi.hoisted(() => ({
  error: undefined as Error | undefined,
  loadError: undefined as Error | undefined
}));

vi.mock('./docgen/story-docs-payload.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof StoryDocsPayloadModule>();

  return {
    ...actual,
    // A getter, so reading the export fails as a module that can't link would.
    get buildStoryDocsPayload() {
      if (storyDocsBuilder.loadError) {
        throw storyDocsBuilder.loadError;
      }

      return (...args: Parameters<typeof actual.buildStoryDocsPayload>) => {
        if (storyDocsBuilder.error) {
          throw storyDocsBuilder.error;
        }

        return actual.buildStoryDocsPayload(...args);
      };
    }
  };
});

const flagOn = { experimentalDocgenServer: true };

afterEach(() => {
  vi.restoreAllMocks();
  installed.storybook = '10.6.0';
  storybook11.typescriptReady = true;
  storybook11.typescriptChecks = 0;
  mainConfig.value = {};
  mainConfig.loads = 0;
  storybook11.typescriptResolvedTo = undefined;
  storyDocsBuilder.error = undefined;
  storyDocsBuilder.loadError = undefined;
});

describe('contributing the Docgen Server descriptor', () => {
  test('points core at the worker entry, rooted at the project', async () => {
    const [descriptor] = await experimental_docgenProvider([], storybookOptions({ features: flagOn }));

    expect(descriptor.moduleSpecifier).toMatch(/docgen[/\\]docgen-worker\.js$/);
    // Absolute, because core imports it across a worker boundary.
    expect(descriptor.moduleSpecifier.startsWith('/')).toBe(true);
    expect(descriptor.options).toEqual({ projectRoot: '/project', tsconfigPath: undefined });
  });

  test('appends to what other presets already registered', async () => {
    const earlier = { moduleSpecifier: '/somewhere/other-worker.js' };
    const descriptors = await experimental_docgenProvider(
      [earlier],
      storybookOptions({ features: flagOn })
    );

    expect(descriptors).toHaveLength(2);
    expect(descriptors[0]).toBe(earlier);
  });

  test('honors resolveFrom and a custom tsconfig', async () => {
    const [descriptor] = await experimental_docgenProvider(
      [],
      storybookOptions({
        features: flagOn,
        frameworkOptions: { resolveFrom: '/apps/site', docgen: { tsconfigPath: '/apps/site/tsconfig.json' } }
      })
    );

    expect(descriptor.options).toEqual({
      projectRoot: '/apps/site',
      tsconfigPath: '/apps/site/tsconfig.json'
    });
  });
});

describe('when the Docgen Server should not run', () => {
  test('the feature flag is off', async () => {
    expect(await experimental_docgenProvider([], storybookOptions())).toEqual([]);
  });

  test('the user turned docgen off entirely', async () => {
    const descriptors = await experimental_docgenProvider(
      [],
      storybookOptions({ features: flagOn, frameworkOptions: { docgen: false } })
    );

    expect(descriptors).toEqual([]);
  });

  test('Storybook is building for tests', async () => {
    const descriptors = await experimental_docgenProvider(
      [],
      storybookOptions({ features: flagOn, build: { test: { disableDocgen: true } } })
    );

    expect(descriptors).toEqual([]);
  });
});

describe('a prop filter cannot cross the worker boundary', () => {
  test('is reported, and extraction still moves to the worker', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const descriptors = await experimental_docgenProvider(
      [],
      storybookOptions({ features: flagOn, frameworkOptions: { docgen: { propFilter: () => true } } })
    );

    expect(descriptors).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('propFilter'));
  });
});

describe('the flag name follows the installed Storybook', () => {
  test('Storybook 11 reads features.docgenServer', async () => {
    installed.storybook = '11.0.0-alpha.8';

    const descriptors = await experimental_docgenProvider(
      [],
      storybookOptions({ features: { docgenServer: true } })
    );

    expect(descriptors).toHaveLength(1);
  });

  test('Storybook 11 ignores the old experimentalDocgenServer name, and says so', async () => {
    installed.storybook = '11.0.0';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const descriptors = await experimental_docgenProvider([], storybookOptions({ features: flagOn }));

    // Core no longer starts the service for the old name, so the builder
    // path has to keep extracting or every props table would be empty.
    expect(descriptors).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('reads `features.docgenServer`'));
  });

  test('Storybook 10 ignores the new docgenServer name, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const descriptors = await experimental_docgenProvider(
      [],
      storybookOptions({ features: { docgenServer: true } })
    );

    expect(descriptors).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('reads `features.experimentalDocgenServer`')
    );
  });
});

describe('declaring the docgen engine for the components manifest (issue #183)', () => {
  test('names the Astro engine when the Docgen Server is on', async () => {
    const manifests = await experimental_manifests({}, storybookOptions({ features: flagOn }));

    expect(manifests.components).toEqual({
      v: 0,
      components: {},
      meta: { docgen: 'astro-docgen', durationMs: 0 }
    });
  });

  test('keeps manifests other presets contributed', async () => {
    const docs = { v: 0, docs: {} };
    const manifests = await experimental_manifests({ docs }, storybookOptions({ features: flagOn }));

    expect(manifests.docs).toBe(docs);
  });

  test('leaves the manifests alone when the Docgen Server is off', async () => {
    const existing = { docs: { v: 0, docs: {} } };

    expect(await experimental_manifests(existing, storybookOptions())).toBe(existing);
  });
});

describe('the Docgen Server is on by default on Storybook 11 (issue #214)', () => {
  test('when the project has TypeScript with the compiler API', async () => {
    installed.storybook = '11.0.0';

    expect(await isDocgenProviderEnabled(false, storybookOptions())).toBe(true);
    // Looked up from the framework, which declares the `typescript` peer.
    expect(storybook11.typescriptResolvedTo).toMatch(/[/\\]typescript[/\\]package\.json$/);
  });

  test('but not without a usable TypeScript, so the builder keeps extracting', async () => {
    installed.storybook = '11.0.0';
    storybook11.typescriptReady = false;

    expect(await isDocgenProviderEnabled(false, storybookOptions())).toBe(false);
  });

  test('but not when the project sets a prop filter, which the worker cannot run', async () => {
    installed.storybook = '11.0.0';

    const enabled = await isDocgenProviderEnabled(
      false,
      storybookOptions({ frameworkOptions: { docgen: { propFilter: () => true } } })
    );

    expect(enabled).toBe(false);
  });

  test('but not when the project turned docgen off', async () => {
    installed.storybook = '11.0.0';

    const enabled = await isDocgenProviderEnabled(
      false,
      storybookOptions({ frameworkOptions: { docgen: false } })
    );

    expect(enabled).toBe(false);
  });

  test('but not in a test build, which skips docgen, so TypeScript is never checked', async () => {
    installed.storybook = '11.0.0';

    const enabled = await isDocgenProviderEnabled(
      false,
      storybookOptions({ build: { test: { disableDocgen: true } } })
    );

    expect(enabled).toBe(false);
    expect(storybook11.typescriptChecks).toBe(0);
  });

  test('and stays off on a Storybook without the TypeScript check', async () => {
    expect(await isDocgenProviderEnabled(false, storybookOptions())).toBe(false);
  });
});

// The preset reads each project's main config once, so every scenario that
// reads it gets a project of its own.
let projectCount = 0;

function freshProject() {
  projectCount += 1;

  return storybookOptions({ configDir: `/project-${projectCount}/.storybook` });
}

describe('the components manifest follows the Docgen Server on Storybook 11 (issue #214)', () => {
  test('is turned on when the Docgen Server is on', async () => {
    installed.storybook = '11.0.0';

    const resolved = await applyFeatures({ docgenServer: true, controls: true }, freshProject());

    expect(resolved).toEqual({ docgenServer: true, controls: true, componentsManifest: true });
  });

  test('is left alone when the Docgen Server is off', async () => {
    installed.storybook = '11.0.0';
    const existing = { docgenServer: false, componentsManifest: false };

    expect(await applyFeatures(existing, freshProject())).toBe(existing);
  });

  test('is left alone when the main config turns the Docgen Server off', async () => {
    // Core merges the main config after this preset, so the default still
    // reads true here.
    installed.storybook = '11.0.0';
    mainConfig.value = { features: { docgenServer: false } };
    const existing = { docgenServer: true, componentsManifest: false };

    expect(await applyFeatures(existing, freshProject())).toBe(existing);
  });

  test('is turned on when the main config turns the Docgen Server on over a false default', async () => {
    // A prop filter or a missing TypeScript makes the default false, but an
    // explicit `docgenServer: true` still starts the Docgen Server.
    installed.storybook = '11.0.0';
    mainConfig.value = { features: { docgenServer: true } };

    const resolved = await applyFeatures({ docgenServer: false }, freshProject());

    expect(resolved).toEqual({ docgenServer: false, componentsManifest: true });
  });

  test('reads the main config once per project, however often features are applied', async () => {
    installed.storybook = '11.0.0';
    const project = freshProject();

    await applyFeatures({ docgenServer: true }, project);
    await applyFeatures({ docgenServer: true }, project);
    await applyFeatures({ docgenServer: true }, project);

    expect(mainConfig.loads).toBe(1);
  });

  test('is left alone in a test build, which turns the Docgen Server off later', async () => {
    installed.storybook = '11.0.0';
    const existing = { docgenServer: true, componentsManifest: false };

    const resolved = await applyFeatures(
      existing,
      storybookOptions({ build: { test: { disableDocgen: true } } })
    );

    expect(resolved).toBe(existing);
  });

  test('is left alone on Storybook 10, even with the Docgen Server on', async () => {
    const existing = { experimentalDocgenServer: true, docgenServer: true, componentsManifest: false };

    expect(await applyFeatures(existing, storybookOptions())).toBe(existing);
  });
});

describe('providing story docs for AI agents (issue #354)', () => {
  const reactEntry = {
    type: 'story',
    subtype: 'story',
    id: 'react-widget--default',
    name: 'Default',
    title: 'React/Widget',
    importPath: './src/Widget.stories.jsx'
  } as IndexEntry;

  test('passes a stories file it does not document to the next provider', async () => {
    const theirs: StoryDocsPayload = {
      id: 'react-widget',
      name: 'Widget',
      path: './src/Widget.stories.jsx',
      stories: {}
    };
    const next = vi.fn(async () => theirs);
    const provider = await experimental_storyDocsProvider(next);

    expect(await provider({ entry: reactEntry })).toBe(theirs);
    expect(next).toHaveBeenCalledWith({ entry: reactEntry });
  });

  test('passes the request on to the next provider when building the story docs throws', async () => {
    storyDocsBuilder.error = new Error('Unexpected stories file');

    const theirs: StoryDocsPayload = {
      id: 'react-widget',
      name: 'Widget',
      path: './src/Widget.stories.jsx',
      stories: {}
    };
    const next = vi.fn(async () => theirs);
    const provider = await experimental_storyDocsProvider(next);

    expect(await provider({ entry: reactEntry })).toBe(theirs);
  });

  test('passes the request on to the next provider when the story docs module fails to load', async () => {
    storyDocsBuilder.loadError = new SyntaxError("The requested module does not provide an export named 'loadCsf'");

    const theirs: StoryDocsPayload = {
      id: 'react-widget',
      name: 'Widget',
      path: './src/Widget.stories.jsx',
      stories: {}
    };
    const next = vi.fn(async () => theirs);
    const provider = await experimental_storyDocsProvider(next);

    expect(await provider({ entry: reactEntry })).toBe(theirs);
  });
});
