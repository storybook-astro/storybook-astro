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

export type GithubRepositoryStats = {
  stargazersCount: number;
};
