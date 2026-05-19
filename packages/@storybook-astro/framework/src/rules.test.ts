import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import {
  defineStoryRules,
  selectStoryRules,
  withStoryRuleCleanups,
  type StoryRulesConfig
} from './rules.ts';

function createRulesConfig(config: StoryRulesConfig) {
  return {
    default: defineStoryRules(config)
  };
}

function getMockReplacement(selection: Awaited<ReturnType<typeof selectStoryRules>>, specifier: string) {
  return selection.moduleMocks.get(specifier)?.replacement;
}

describe('story rules', () => {
  test('returns an empty selection when no rules are configured', async () => {
    const selection = await selectStoryRules({
      configModule: undefined,
      story: {
        id: 'components-card--default'
      }
    });

    expect(selection.moduleMocks.size).toBe(0);
    expect(selection.cleanups).toEqual([]);
  });

  test('matches rules against story id and applies module mocks', async () => {
    const selection = await selectStoryRules({
      configModule: createRulesConfig({
        rules: [
          {
            match: 'components-card--*',
            use: ({ mock }) => {
              mock('~/lib/api', '~/lib/api.mock');
            }
          }
        ]
      }),
      story: {
        id: 'components-card--default'
      }
    });

    expect(getMockReplacement(selection, '~/lib/api')).toBe('~/lib/api.mock');
    expect(selection.cleanups).toHaveLength(0);
  });

  test('matches rules against title and story name paths', async () => {
    const selection = await selectStoryRules({
      configModule: createRulesConfig({
        rules: [
          {
            match: 'guides/getting-started/default-state',
            use: ({ mock }) => {
              mock('~/service', '~/service.mock');
            }
          }
        ]
      }),
      story: {
        id: 'guides-getting-started--default-state',
        title: 'Guides/Getting Started',
        name: 'Default State'
      }
    });

    expect(getMockReplacement(selection, '~/service')).toBe('~/service.mock');
  });

  test('matches rules against /story/<id> style story identifiers', async () => {
    const selection = await selectStoryRules({
      configModule: createRulesConfig({
        rules: [
          {
            match: '/story/components-card--default',
            use: ({ mock }) => {
              mock('~/store', '~/store.mock');
            }
          }
        ]
      }),
      story: {
        id: '/story/components-card--default'
      }
    });

    expect(getMockReplacement(selection, '~/store')).toBe('~/store.mock');
  });

  test('supports inline factory module mocks', async () => {
    const selection = await selectStoryRules({
      configModule: createRulesConfig({
        rules: [
          {
            match: '*',
            use: ({ mock }) => {
              mock('~/lib/api', () => ({
                fetchUser: async () => ({ id: 1, name: 'Storybook User' })
              }));
            }
          }
        ]
      }),
      story: {
        id: 'components-card--default'
      }
    });

    expect(getMockReplacement(selection, '~/lib/api')).toMatch(
      /^virtual:storybook-astro-inline-module:/
    );
  });

  test('collects cleanup functions from matching rules', async () => {
    const cleanup = () => undefined;

    const selection = await selectStoryRules({
      configModule: createRulesConfig({
        rules: [
          {
            match: '*',
            use: () => {
              return cleanup;
            }
          }
        ]
      }),
      story: {
        id: 'components-card--default'
      }
    });

    expect(selection.cleanups).toEqual([cleanup]);
  });

  test('runs cleanups after successful execution in reverse order', async () => {
    const sequence: string[] = [];

    await withStoryRuleCleanups(
      [
        () => {
          sequence.push('cleanup:first');
        },
        async () => {
          sequence.push('cleanup:second');
        }
      ],
      async () => {
        sequence.push('render');
      }
    );

    expect(sequence).toEqual(['render', 'cleanup:second', 'cleanup:first']);
  });

  test('runs cleanups when execution throws', async () => {
    const sequence: string[] = [];

    await expect(
      withStoryRuleCleanups(
        [
          () => {
            sequence.push('cleanup');
          }
        ],
        async () => {
          sequence.push('render');
          throw new Error('render failed');
        }
      )
    ).rejects.toThrow('render failed');

    expect(sequence).toEqual(['render', 'cleanup']);
  });

  test('throws when use returns a non-function value', async () => {
    await expect(
      selectStoryRules({
        configModule: createRulesConfig({
          rules: [
            {
              match: '*',
              use: () => 'nope' as never
            }
          ]
        }),
        story: {
          id: 'components-card--default'
        }
      })
    ).rejects.toThrow('Story rule "use" must return either nothing or a cleanup function.');
  });

  test('aggregates cleanup failures', async () => {
    await expect(
      withStoryRuleCleanups(
        [
          () => {
            throw new Error('first cleanup failed');
          },
          () => {
            throw new Error('second cleanup failed');
          }
        ],
        async () => undefined
      )
    ).rejects.toMatchObject({
      message: 'Story rule cleanup failed.'
    });
  });

  test('resolves relative mock replacements from config file location', async () => {
    const configFilePath = '/repo/.storybook/story-rules.ts';

    const selection = await selectStoryRules({
      configModule: createRulesConfig({
        rules: [
          {
            match: '*',
            use: ({ mock }) => {
              mock('~/lib/api', './mocks/api.ts');
            }
          }
        ]
      }),
      configFilePath,
      story: {
        id: 'components-card--default'
      }
    });

    expect(getMockReplacement(selection, '~/lib/api')).toBe(
      resolve('/repo/.storybook', './mocks/api.ts').replaceAll('\\', '/')
    );
  });

  test('throws when a rule match pattern is empty', async () => {
    await expect(
      selectStoryRules({
        configModule: createRulesConfig({
          rules: [
            {
              match: '   ',
              use: () => undefined
            }
          ]
        }),
        story: {
          id: 'components-card--default'
        }
      })
    ).rejects.toThrow('Story rule "match" cannot be empty.');
  });

  test('throws when a mock replacement is relative but config path is missing', async () => {
    await expect(
      selectStoryRules({
        configModule: createRulesConfig({
          rules: [
            {
              match: '*',
              use: ({ mock }) => {
                mock('~/lib/api', './mocks/api.ts');
              }
            }
          ]
        }),
        story: {
          id: 'components-card--default'
        }
      })
    ).rejects.toThrow(
      'Story rule mock replacement uses a relative path, but rules config path is unavailable.'
    );
  });

  test('throws when a mock factory returns a non-object value', async () => {
    await expect(
      selectStoryRules({
        configModule: createRulesConfig({
          rules: [
            {
              match: '*',
              use: ({ mock }) => {
                mock('~/lib/api', () => 'bad' as never);
              }
            }
          ]
        }),
        story: {
          id: 'components-card--default'
        }
      })
    ).rejects.toThrow('Story rule mock factory must return an object of module exports.');
  });
});
