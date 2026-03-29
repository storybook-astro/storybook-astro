export type NpmDownloadPoint = {
  day: string;
  downloads: number;
};

export type GithubContributor = {
  id: number;
  login: string;
  avatarUrl: string;
  profileUrl: string;
};

export type GithubContributorsStat = {
  total: number;
  contributors: GithubContributor[];
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
  const headers = createGithubHeaders();

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

export async function fetchGithubContributors(
  repository: string,
  visibleContributors = 4
): Promise<GithubContributorsStat> {
  const headers = createGithubHeaders();
  const safeVisibleContributors = normalizeVisibleContributors(visibleContributors);
  const topContributorsUrl = `https://api.github.com/repos/${repository}/contributors?per_page=${safeVisibleContributors}`;
  const countUrl = `https://api.github.com/repos/${repository}/contributors?per_page=1`;

  try {
    const [topContributorsResponse, countResponse] = await Promise.all([
      fetch(topContributorsUrl, { headers }),
      fetch(countUrl, { headers }),
    ]);

    const contributors = await normalizeContributorEntries(topContributorsResponse);
    const totalFromCountResponse = await resolveContributorsCount(countResponse);
    const total = Math.max(totalFromCountResponse, contributors.length);

    return {
      total,
      contributors,
    };
  } catch {
    return {
      total: 0,
      contributors: [],
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

function createGithubHeaders(): Record<string, string> {
  const token = import.meta.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function normalizeVisibleContributors(value: unknown): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return 4;
  }

  return Math.min(Math.max(Math.round(parsedValue), 1), 8);
}

async function normalizeContributorEntries(response: Response): Promise<GithubContributor[]> {
  if (!response.ok) {
    return [];
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    return [];
  }

  if (!Array.isArray(payload)) {
    return [];
  }

  return payload
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const id = Number(entry.id);
      const login = typeof entry.login === 'string' ? entry.login : '';
      const avatarUrl = typeof entry.avatar_url === 'string' ? entry.avatar_url : '';
      const profileUrl = typeof entry.html_url === 'string' ? entry.html_url : '';

      if (!Number.isFinite(id) || !login || !avatarUrl || !profileUrl) {
        return null;
      }

      return {
        id,
        login,
        avatarUrl,
        profileUrl,
      };
    })
    .filter((entry): entry is GithubContributor => entry !== null);
}

async function resolveContributorsCount(response: Response): Promise<number> {
  if (!response.ok) {
    return 0;
  }

  const linkHeader = response.headers.get('link');

  if (linkHeader) {
    const lastPageMatch = linkHeader.match(/[?&]page=(\d+)>;\s*rel="last"/);

    if (lastPageMatch) {
      return normalizeCount(Number(lastPageMatch[1]));
    }
  }

  let payload;

  try {
    payload = await response.json();
  } catch {
    return 0;
  }

  if (!Array.isArray(payload)) {
    return 0;
  }

  return payload.length > 0 ? 1 : 0;
}

function normalizeCount(value: unknown): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }

  return Math.round(parsedValue);
}
