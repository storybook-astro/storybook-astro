import { defineStoryRules } from '@storybook-astro/framework';
import { HttpResponse, http } from 'msw';
import { getMswServer } from './msw-server.ts';

const githubRepoPattern = /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+$/;
const githubContributorsPattern = /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/contributors(?:\?.*)?$/;
const npmDownloadsPattern = /^https:\/\/api\.npmjs\.org\/downloads\/range\/last-week\/.+$/;

const githubStarsByPath: Record<string, number | null> = {
  '/default': 2413,
  '/one-k': 1000,
  '/hundred-k': 100000,
  '/almost-ten-million': 9999999,
  '/rate-limited': null,
};

const npmDownloadsByPath: Record<string, number[] | null> = {
  '/default': [482, 501, 533, 560, 602, 645, 688],
  '/skyrocketed': [120, 160, 420, 1800, 12600, 86400, 240000],
  '/zero-downloads': [0, 0, 0, 0, 0, 0, 0],
  '/api-unavailable': null,
};

type ContributorFixture = {
  id: number;
  login: string;
  avatarUrl: string;
  htmlUrl: string;
};

type ContributorsScenario = {
  total: number;
  contributors: ContributorFixture[];
} | null;

const githubContributorsByPath: Record<string, ContributorsScenario> = {
  '/default': {
    total: 19,
    contributors: [
      createContributorFixture(101, 'aetaan', 1),
      createContributorFixture(102, 'ergodic-ink', 2),
      createContributorFixture(103, 'storybook-astro-bot', 3),
      createContributorFixture(104, 'msw-fox', 4),
    ],
  },
  '/small-team': {
    total: 3,
    contributors: [
      createContributorFixture(201, 'one-dev', 5),
      createContributorFixture(202, 'pair-programmer', 6),
      createContributorFixture(203, 'docs-friend', 7),
    ],
  },
  '/huge-community': {
    total: 9842,
    contributors: [
      createContributorFixture(301, 'core-maintainer', 8),
      createContributorFixture(302, 'feature-racer', 9),
      createContributorFixture(303, 'types-guru', 10),
      createContributorFixture(304, 'storybook-wizard', 11),
      createContributorFixture(305, 'extra-visible', 12),
      createContributorFixture(306, 'another-extra', 13),
    ],
  },
  '/api-unavailable': null,
};

export default defineStoryRules({
  rules: [
    {
      match: 'astro/githubstars/*',
      use: ({ story }) => {
        const pathKey = resolveStoryPathKey(story.keys, 'astro/githubstars/');
        const stars = resolveStoryValue(githubStarsByPath, pathKey);
        const server = getMswServer();

        server.use(
          http.get(githubRepoPattern, () => {
            if (stars === null) {
              return HttpResponse.json(
                {
                  message: 'API rate limit exceeded',
                },
                { status: 403 }
              );
            }

            return HttpResponse.json({
              'stargazers_count': stars,
            });
          })
        );

        return () => {
          server.resetHandlers();
        };
      },
    },
    {
      match: 'astro/npmweeklydownloads/*',
      use: ({ story }) => {
        const pathKey = resolveStoryPathKey(story.keys, 'astro/npmweeklydownloads/');
        const weeklyDownloads = resolveStoryValue(npmDownloadsByPath, pathKey);
        const server = getMswServer();

        server.use(
          http.get(npmDownloadsPattern, () => {
            if (weeklyDownloads === null) {
              return HttpResponse.json(
                {
                  error: 'npm metrics are temporarily unavailable',
                },
                { status: 503 }
              );
            }

            return HttpResponse.json({
              package: '@storybook-astro/framework',
              start: '2026-02-16',
              end: '2026-02-22',
              downloads: weeklyDownloads.map((downloads, index) => ({
                day: toDayOffset('2026-02-16', index),
                downloads,
              })),
            });
          })
        );

        return () => {
          server.resetHandlers();
        };
      },
    },
    {
      match: 'astro/githubcontributors/*',
      use: ({ story }) => {
        const pathKey = resolveStoryPathKey(story.keys, 'astro/githubcontributors/');
        const scenario = resolveStoryValue(githubContributorsByPath, pathKey);
        const server = getMswServer();

        server.use(
          http.get(githubContributorsPattern, ({ request }) => {
            if (scenario === null) {
              return HttpResponse.json(
                {
                  message: 'contributors API unavailable',
                },
                { status: 503 }
              );
            }

            const requestUrl = new URL(request.url);
            const perPage = Number(requestUrl.searchParams.get('per_page') ?? '30');

            if (perPage === 1) {
              return createContributorsCountResponse(
                requestUrl,
                scenario.total,
                scenario.contributors,
                HttpResponse
              );
            }

            return HttpResponse.json(
              scenario.contributors
                .slice(0, Math.max(perPage, 1))
                .map(toGithubContributorResponse)
            );
          })
        );

        return () => {
          server.resetHandlers();
        };
      },
    },
  ],
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

function createContributorFixture(id: number, login: string, imageSeed: number): ContributorFixture {
  return {
    id,
    login,
    avatarUrl: `https://avatars.githubusercontent.com/u/${10000 + imageSeed}?v=4`,
    htmlUrl: `https://github.com/${login}`,
  };
}

function createContributorsCountResponse(
  requestUrl: URL,
  total: number,
  contributors: ContributorFixture[],
  httpResponse: {
    json: (body: unknown, init?: unknown) => unknown;
  }
) {
  if (total <= 0) {
    return httpResponse.json([]);
  }

  const firstContributor = contributors[0] ?? createContributorFixture(999999, 'unknown', 99);

  return httpResponse.json(
    [toGithubContributorResponse(firstContributor)],
    {
      headers: {
        link: `<${requestUrl.origin}${requestUrl.pathname}?per_page=1&page=${total}>; rel="last"`,
      },
    }
  );
}

function toGithubContributorResponse(contributor: ContributorFixture) {
  return {
    id: contributor.id,
    login: contributor.login,
    'avatar_url': contributor.avatarUrl,
    'html_url': contributor.htmlUrl,
  };
}
