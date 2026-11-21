/* eslint n/no-unsupported-features/node-builtins: ["error", {"ignores": ["Response"]}] -- runs on every server-mode host */
/**
 * Story rules shared by the astro{5,6,7}-server-{platform} apps. Network
 * requests are mocked by wrapping `fetch` for one render (mock-fetch.ts),
 * since MSW's Node interceptors don't run on Cloudflare Workers.
 */
import { defineStoryRules } from '@storybook-astro/framework/node';
import type {
  GithubContributor,
  GithubContributorsStat
} from '@storybook-astro/components/githubTypes.ts';
import { mockFetch } from './mock-fetch.ts';

const npmDownloadsPattern = /^https:\/\/api\.npmjs\.org\/downloads\/range\/last-week\/.+$/;

const githubStarsByPath: Record<string, number | null> = {
  '/default': 2413,
  '/one-k': 1000,
  '/hundred-k': 100000,
  '/almost-ten-million': 9999999,
  '/rate-limited': null
};

const npmDownloadsByPath: Record<string, number[] | null> = {
  '/default': [482, 501, 533, 560, 602, 645, 688],
  '/skyrocketed': [120, 160, 420, 1800, 12600, 86400, 240000],
  '/zero-downloads': [0, 0, 0, 0, 0, 0, 0],
  '/api-unavailable': null
};

const githubContributorsByPath: Record<string, GithubContributorsStat | null> = {
  '/default': {
    total: 19,
    contributors: [
      createContributorFixture(101, 'aetaan', 1),
      createContributorFixture(102, 'ergodic-ink', 2),
      createContributorFixture(103, 'storybook-astro-bot', 3),
      createContributorFixture(104, 'msw-fox', 4)
    ]
  },
  '/small-team': {
    total: 3,
    contributors: [
      createContributorFixture(201, 'one-dev', 5),
      createContributorFixture(202, 'pair-programmer', 6),
      createContributorFixture(203, 'docs-friend', 7)
    ]
  },
  '/huge-community': {
    total: 9842,
    contributors: [
      createContributorFixture(301, 'core-maintainer', 8),
      createContributorFixture(302, 'feature-racer', 9),
      createContributorFixture(303, 'types-guru', 10),
      createContributorFixture(304, 'storybook-wizard', 11),
      createContributorFixture(305, 'extra-visible', 12),
      createContributorFixture(306, 'another-extra', 13)
    ]
  },
  '/api-unavailable': null
};

export default defineStoryRules({
  rules: [
    {
      match: 'astro/githubstars/*',
      use: ({ story, mock }) => {
        const pathKey = resolveStoryPathKey(story.keys, 'astro/githubstars/');
        const stars = resolveStoryValue(githubStarsByPath, pathKey);

        // A replacement-path mock: the server build compiles the file in.
        if (pathKey === '/hundred-k') {
          mock('./githubClient.ts', './mocks/githubClient.hundredK.ts');

          return;
        }

        mock('./githubClient.ts', () => ({
          fetchGithubRepositoryStats: async () => {
            if (stars === null) {
              return undefined;
            }

            return {
              stargazersCount: stars
            };
          }
        }));
      }
    },
    {
      match: 'astro/npmweeklydownloads/*',
      use: ({ story }) => {
        const pathKey = resolveStoryPathKey(story.keys, 'astro/npmweeklydownloads/');
        const weeklyDownloads = resolveStoryValue(npmDownloadsByPath, pathKey);

        return mockFetch((request) => {
          if (!npmDownloadsPattern.test(request.url)) {
            return undefined;
          }

          if (weeklyDownloads === null) {
            return Response.json(
              {
                error: 'npm metrics are temporarily unavailable'
              },
              { status: 503 }
            );
          }

          return Response.json({
            package: '@storybook-astro/framework',
            start: '2026-02-16',
            end: '2026-02-22',
            downloads: weeklyDownloads.map((downloads, index) => ({
              day: toDayOffset('2026-02-16', index),
              downloads
            }))
          });
        });
      }
    },
    {
      match: 'astro/githubcontributors/*',
      use: ({ story, mock }) => {
        const pathKey = resolveStoryPathKey(story.keys, 'astro/githubcontributors/');
        const contributors = resolveStoryValue(githubContributorsByPath, pathKey);

        mock('./githubClient.ts', () => ({
          fetchGithubRepositoryStats: async () => undefined,
          fetchGithubContributorsStat: async (_repository: string, visibleContributors = 4) => {
            if (contributors === null) {
              throw new Error('contributors API unavailable');
            }

            const safeVisibleContributors = normalizeVisibleContributors(visibleContributors);

            return {
              total: contributors.total,
              contributors: contributors.contributors.slice(0, safeVisibleContributors)
            };
          }
        }));
      }
    }
  ]
});

function resolveStoryPathKey(storyKeys: string[], storyPrefix: string): string {
  const matchedPath = storyKeys.find((key) => key.startsWith(storyPrefix));

  if (!matchedPath) {
    return '/default';
  }

  const suffix = matchedPath.slice(storyPrefix.length);

  if (!suffix) {
    return '/default';
  }

  return `/${suffix}`;
}

function resolveStoryValue<T>(valuesByPath: Record<string, T>, pathKey: string): T {
  if (Object.prototype.hasOwnProperty.call(valuesByPath, pathKey)) {
    return valuesByPath[pathKey];
  }

  return valuesByPath['/default'];
}

function toDayOffset(baseDay: string, offset: number): string {
  const date = new Date(`${baseDay}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + offset);

  return date.toISOString().slice(0, 10);
}

function createContributorFixture(id: number, login: string, imageSeed: number): GithubContributor {
  return {
    id,
    login,
    avatarUrl: `https://avatars.githubusercontent.com/u/${10000 + imageSeed}?v=4`,
    profileUrl: `https://github.com/${login}`
  };
}

function normalizeVisibleContributors(value: unknown): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return 4;
  }

  return Math.min(Math.max(Math.round(parsedValue), 1), 8);
}
