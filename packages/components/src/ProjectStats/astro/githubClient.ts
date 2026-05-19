import { Octokit } from '@octokit/rest';
import type {
  GithubContributor,
  GithubContributorsStat,
  GithubRepositoryStats
} from '../../githubTypes.ts';

type GithubRepositoryInput = {
  owner: string;
  repo: string;
};


export async function fetchGithubRepositoryStats(
  repository: string
): Promise<GithubRepositoryStats | undefined> {
  console.log("I AM INSIDE ORIGINAL MODULE!");
  const octokit = createOctokit();
  const { owner, repo } = parseGithubRepository(repository);

  try {
    const response = await octokit.rest.repos.get({ owner, repo });

    return {
      stargazersCount: normalizeCount(response.data.stargazers_count)
    };
  } catch {
    return undefined;
  }
}

export async function fetchGithubContributorsStat(
  repository: string,
  visibleContributors = 4
): Promise<GithubContributorsStat> {
  const octokit = createOctokit();
  const { owner, repo } = parseGithubRepository(repository);
  const safeVisibleContributors = normalizeVisibleContributors(visibleContributors);

  try {
    const [topContributorsResponse, countResponse] = await Promise.all([
      octokit.rest.repos.listContributors({
        owner,
        repo,
        ...createPerPageOptions(safeVisibleContributors)
      }),
      octokit.rest.repos.listContributors({
        owner,
        repo,
        ...createPerPageOptions(1)
      })
    ]);

    const contributors = normalizeContributorEntries(topContributorsResponse.data).slice(
      0,
      safeVisibleContributors
    );
    const totalFromCountResponse = resolveContributorsCount(
      countResponse.headers.link,
      countResponse.data
    );
    const total = Math.max(totalFromCountResponse, contributors.length);

    return {
      total,
      contributors
    };
  } catch {
    return {
      total: 0,
      contributors: []
    };
  }
}

function createOctokit() {
  const token = import.meta.env.GITHUB_TOKEN;

  return new Octokit({
    auth: token || undefined
  });
}

function parseGithubRepository(repository: string): GithubRepositoryInput {
  const [owner = '', repo = ''] = repository.split('/');

  return {
    owner,
    repo
  };
}

function normalizeContributorEntries(entries: unknown[]): GithubContributor[] {
  return entries
    .map((entry) => {
      if (!isRecord(entry)) {
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
        profileUrl
      } satisfies GithubContributor;
    })
    .filter((entry): entry is GithubContributor => entry !== null);
}

function resolveContributorsCount(linkHeader: string | undefined, payload: unknown[]): number {
  if (linkHeader) {
    const lastPageMatch = linkHeader.match(/[?&]page=(\d+)>;\s*rel="last"/);

    if (lastPageMatch) {
      return normalizeCount(Number(lastPageMatch[1]));
    }
  }

  return payload.length > 0 ? 1 : 0;
}

function createPerPageOptions(perPage: number) {
  return {
    ['per_page']: perPage
  };
}

function normalizeVisibleContributors(value: unknown): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue)) {
    return 4;
  }

  return Math.min(Math.max(Math.round(parsedValue), 1), 8);
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
