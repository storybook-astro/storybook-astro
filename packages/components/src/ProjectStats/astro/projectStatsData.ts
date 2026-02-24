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
}) {
  const [stars, downloads] = await Promise.all([
    fetchGithubStars(options.repository, options.fallbackStars ?? 0),
    fetchNpmWeeklyDownloads(options.packageName),
  ]);

  return {
    stars,
    downloads,
  };
}

export async function fetchGithubStars(repository: string, fallbackStars = 0): Promise<number> {
  const token = import.meta.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${repository}`, {
      headers,
    });

    if (!response.ok) {
      return normalizeCount(fallbackStars);
    }

    const payload = await response.json();

    return normalizeCount(payload?.stargazers_count);
  } catch {
    return normalizeCount(fallbackStars);
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

    return payload.downloads
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
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
