import type { Options } from 'storybook/internal/types';
import { afterEach, describe, expect, test, vi } from 'vitest';
// eslint-disable-next-line camelcase -- the preset keys Storybook core reads.
import { experimental_docgenProvider, experimental_manifests } from './preset.ts';
import type { FrameworkOptions } from './types.ts';

interface Scenario {
  features?: Record<string, unknown>;
  frameworkOptions?: Partial<FrameworkOptions>;
  build?: Options['build'];
}

/** The slice of Storybook's preset `Options` the docgen provider reads. */
function storybookOptions({ features, frameworkOptions, build }: Scenario = {}): Options {
  return {
    configDir: '/project/.storybook',
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

vi.mock('storybook/internal/common', async (importOriginal) => {
  const actual = await importOriginal<{ versions: Record<string, string> }>();

  return {
    ...actual,
    versions: {
      ...actual.versions,
      get storybook() {
        return installed.storybook;
      }
    }
  };
});

const flagOn = { experimentalDocgenServer: true };

afterEach(() => {
  vi.restoreAllMocks();
  installed.storybook = '10.6.0';
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
