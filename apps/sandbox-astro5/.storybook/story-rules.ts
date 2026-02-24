import { defineStoryRules } from '@storybook-astro/framework';
import { http, HttpResponse } from '@storybook-astro/framework/msw-helpers';

const githubRepoPattern = /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+$/;
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

export default defineStoryRules({
  rules: [
    {
      match: 'astro/github-stars/*',
      use: ({ story, msw }) => {
        const pathKey = resolveStoryPathKey(story.keys, 'astro/github-stars/');
        const stars = githubStarsByPath[pathKey] ?? githubStarsByPath['/default'];

        msw.use(
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
      },
    },
    {
      match: 'astro/npm-weekly-downloads/*',
      use: ({ story, msw }) => {
        const pathKey = resolveStoryPathKey(story.keys, 'astro/npm-weekly-downloads/');
        const weeklyDownloads = npmDownloadsByPath[pathKey] ?? npmDownloadsByPath['/default'];

        msw.use(
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

function toDayOffset(baseDay: string, offset: number): string {
  const date = new Date(`${baseDay}T00:00:00Z`);

  date.setUTCDate(date.getUTCDate() + offset);

  return date.toISOString().slice(0, 10);
}
