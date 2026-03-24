import { resolve } from 'node:path';
import type { RequestHandler } from 'msw';
import { describe, expect, test } from 'vitest';
import { defineStoryRules, selectStoryRules, type StoryRulesConfig } from './rules.ts';

function createRulesConfig(config: StoryRulesConfig) {
  return {
    default: defineStoryRules(config)
  };
}

describe('story rules', () => {
  test('returns an empty selection when no rules are configured', async () => {
    const selection = await selectStoryRules({
      configModule: undefined,
      mode: 'development',
      story: {
        id: 'components-card--default'
      }
    });

    expect(selection.moduleMocks.size).toBe(0);
    expect(selection.mswHandlers).toEqual([]);
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
      mode: 'development',
      story: {
        id: 'components-card--default'
      }
    });

    expect(selection.moduleMocks.get('~/lib/api')).toBe('~/lib/api.mock');
    expect(selection.mswHandlers).toHaveLength(0);
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
      mode: 'development',
      story: {
        id: 'guides-getting-started--default-state',
        title: 'Guides/Getting Started',
        name: 'Default State'
      }
    });

    expect(selection.moduleMocks.get('~/service')).toBe('~/service.mock');
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
      mode: 'development',
      story: {
        id: '/story/components-card--default'
      }
    });

    expect(selection.moduleMocks.get('~/store')).toBe('~/store.mock');
  });

  test('collects MSW handlers from matching rules', async () => {
    const firstHandler = {} as RequestHandler;
    const secondHandler = {} as RequestHandler;

    const selection = await selectStoryRules({
      configModule: createRulesConfig({
        rules: [
          {
            match: '*',
            use: ({ msw }) => {
              msw.use(firstHandler, secondHandler);
            }
          }
        ]
      }),
      mode: 'production',
      story: {
        id: 'components-card--default'
      }
    });

    expect(selection.mswHandlers).toEqual([firstHandler, secondHandler]);
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
      mode: 'development',
      story: {
        id: 'components-card--default'
      }
    });

    expect(selection.moduleMocks.get('~/lib/api')).toBe(
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
        mode: 'development',
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
        mode: 'development',
        story: {
          id: 'components-card--default'
        }
      })
    ).rejects.toThrow(
      'Story rule mock replacement uses a relative path, but rules config path is unavailable.'
    );
  });
});
