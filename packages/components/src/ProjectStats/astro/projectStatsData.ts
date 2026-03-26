import {
  fetchGithubContributorsStat,
  fetchGithubRepositoryStats
} from './githubClient.ts';
import type { GithubContributorsStat } from '../../githubTypes.ts';

export type {
  GithubContributor,
  GithubContributorsStat,
  GithubRepositoryStats
} from '../../githubTypes.ts';

export type NpmDownloadPoint = {
  day: string;
  downloads: number;
};

export const DEFAULT_GITHUB_REPOSITORY = 'storybook-astro/storybook-astro';
export const DEFAULT_NPM_PACKAGE = '@storybook-astro/framework';

export async function fetchProjectStats(options: {
  repository: string;
  packageName: string;
  fallbackStars?: number;
  visibleContributors?: number;
}) {
  const [stars, downloads, contributors] = await Promise.all([
    fetchGithubStars(options.repository, options.fallbackStars ?? 0),
    fetchNpmWeeklyDownloads(options.packageName),
    fetchGithubContributors(options.repository, options.visibleContributors ?? 4),
  ]);

  return {
    stars,
    downloads,
    contributors,
  };
}

export async function fetchGithubStars(repository: string, fallbackStars = 0): Promise<number> {
  try {
    const payload = await fetchGithubRepositoryStats(repository);

    console.log(payload,"<-----payload");

    if (!payload) {
      return normalizeCount(fallbackStars);
    }

    return normalizeCount(payload.stargazersCount);
  } catch {
    return normalizeCount(fallbackStars);
  }
}

export async function fetchGithubContributors(
  repository: string,
  visibleContributors = 4
): Promise<GithubContributorsStat> {
  try {
    return await fetchGithubContributorsStat(repository, visibleContributors);
  } catch {
    return {
      total: 0,
      contributors: []
    };
  }
}

export async function fetchNpmWeeklyDownloads(packageName: string): Promise<NpmDownloadPoint[]> {
  const requestUrl = `https://api.npmjs.org/downloads/range/last-week/${encodeURIComponent(packageName)}`;

  try {
    const response = await fetch(requestUrl);

    if (!response.ok) {
      return [];
    }

    const payload = await response.json();

    if (!Array.isArray(payload?.downloads)) {
      return [];
    }

    return (payload.downloads as unknown[])
      .map((entry) => {
        if (!isRecord(entry)) {
          return null;
        }

        const day = typeof entry.day === 'string' ? entry.day : '';
        const downloads = Number(entry.downloads);

        if (!day || !Number.isFinite(downloads) || downloads < 0) {
          return null;
        }

        return {
          day,
          downloads: Math.round(downloads),
        };
      })
      .filter((entry): entry is NpmDownloadPoint => entry !== null);
  } catch {
    return [];
  }
}

export function normalizeGithubRepository(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_GITHUB_REPOSITORY;
  }

  const normalizedValue = value.trim().replace(/^\/+|\/+$/g, '');

  if (!normalizedValue || !normalizedValue.includes('/')) {
    return DEFAULT_GITHUB_REPOSITORY;
  }

  return normalizedValue;
}

export function normalizePackageName(value: unknown): string {
  if (typeof value !== 'string') {
    return DEFAULT_NPM_PACKAGE;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return DEFAULT_NPM_PACKAGE;
  }

  return normalizedValue;
}

function normalizeCount(value: unknown): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }

  return Math.round(parsedValue);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
