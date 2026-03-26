import type { CSSProperties } from 'react';
import { useMemo } from 'preact/hooks';
import styles from '../styles/githubContributors.module.css';

type GithubContributor = {
  id: number;
  login: string;
  avatarUrl: string;
  profileUrl: string;
};

type GithubContributorsProps = {
  repository?: string;
  label?: string;
  contributors?: unknown;
  total?: unknown;
};

function normalizeContributors(value: unknown): GithubContributor[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const id = Number(entry.id);
      const login = typeof entry.login === 'string' ? entry.login : '';
      const avatarUrl = typeof entry.avatarUrl === 'string' ? entry.avatarUrl : '';
      const profileUrl = typeof entry.profileUrl === 'string' ? entry.profileUrl : '';

      if (!Number.isFinite(id) || !login || !avatarUrl) {
        return null;
      }

      return {
        id,
        login,
        avatarUrl,
        profileUrl,
      } satisfies GithubContributor;
    })
    .filter((entry): entry is GithubContributor => entry !== null);
}

function normalizeTotal(value: unknown): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }

  return Math.round(parsedValue);
}

function createAvatarStyle(index: number): CSSProperties {
  return {
    animationDelay: `${index * 50}ms`
  };
}

export default function GithubContributors({
  repository = 'storybook-astro/storybook-astro',
  label = 'contributors',
  contributors = [],
  total = 0,
}: GithubContributorsProps) {
  const formatter = useMemo(() => new Intl.NumberFormat('en-US'), []);
  const visibleContributors = normalizeContributors(contributors).slice(0, 4);
  const safeTotal = Math.max(normalizeTotal(total), visibleContributors.length);
  const remainingContributors = Math.max(safeTotal - visibleContributors.length, 0);
  const contributorsUrl = `https://github.com/${repository}/graphs/contributors`;

  return (
    <section
      className={styles.card}
      data-testid="github-contributors"
    >
      <span className={styles.label}>{label}</span>
      <div className={styles.row}>
        <span className={styles.total} aria-label={`${formatter.format(safeTotal)} contributors`}>
          {formatter.format(safeTotal)}
        </span>

        <div className={styles.avatars}>
          {visibleContributors.map((contributor, index) => (
            <span
              key={contributor.id}
              className={styles.avatarShell}
              style={createAvatarStyle(index)}
            >
              {contributor.profileUrl
                ? (
                    <a
                      className={styles.avatarLink}
                      href={contributor.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${contributor.login} on GitHub`}
                    >
                      <img
                        className={styles.avatar}
                        src={contributor.avatarUrl}
                        alt={contributor.login}
                        loading="lazy"
                      />
                    </a>
                  )
                : (
                    <img
                      className={styles.avatar}
                      src={contributor.avatarUrl}
                      alt={contributor.login}
                      loading="lazy"
                    />
                  )}
            </span>
          ))}

          {remainingContributors > 0 && (
            <span
              className={styles.remaining}
              aria-label={`${formatter.format(remainingContributors)} more contributors`}
            >
              +{formatter.format(remainingContributors)}
            </span>
          )}
        </div>
      </div>
      <a className={styles.repository} href={contributorsUrl} target="_blank" rel="noopener noreferrer">
        {repository}
      </a>
    </section>
  );
}
