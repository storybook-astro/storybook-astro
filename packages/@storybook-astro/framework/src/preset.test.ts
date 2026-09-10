import type { Options } from 'storybook/internal/types';
import { afterEach, describe, expect, test, vi } from 'vitest';
// eslint-disable-next-line camelcase -- the preset key Storybook core reads.
import { experimental_docgenProvider } from './preset.ts';
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

const flagOn = { experimentalDocgenServer: true };

afterEach(() => vi.restoreAllMocks());

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
