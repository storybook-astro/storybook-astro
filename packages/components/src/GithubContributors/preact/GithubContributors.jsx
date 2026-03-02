import { useMemo } from 'preact/hooks';
import styles from '../styles/githubContributors.module.css';

function normalizeContributors(value) {
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
      };
    })
    .filter((entry) => entry !== null);
}

function normalizeTotal(value) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }

  return Math.round(parsedValue);
}

export default function GithubContributors({
  repository = 'storybook-astro/storybook-astro',
  label = 'contributors',
  contributors = [],
  total = 0,
}) {
  const formatter = useMemo(() => new Intl.NumberFormat('en-US'), []);
  const visibleContributors = normalizeContributors(contributors).slice(0, 4);
  const safeTotal = Math.max(normalizeTotal(total), visibleContributors.length);
  const remainingContributors = Math.max(safeTotal - visibleContributors.length, 0);
  const contributorsUrl = `https://github.com/${repository}/graphs/contributors`;

  return (
    <section
      class={styles.card}
      data-testid="github-contributors"
    >
      <span class={styles.label}>{label}</span>
      <div class={styles.row}>
        <span class={styles.total} aria-label={`${formatter.format(safeTotal)} contributors`}>
          {formatter.format(safeTotal)}
        </span>

        <div class={styles.avatars}>
          {visibleContributors.map((contributor, index) => (
            <span key={contributor.id} class={styles.avatarShell} style={{ '--avatar-index': String(index) }}>
              {contributor.profileUrl
                ? (
                    <a
                      class={styles.avatarLink}
                      href={contributor.profileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${contributor.login} on GitHub`}
                    >
                      <img class={styles.avatar} src={contributor.avatarUrl} alt={contributor.login} loading="lazy" />
                    </a>
                  )
                : <img class={styles.avatar} src={contributor.avatarUrl} alt={contributor.login} loading="lazy" />}
            </span>
          ))}

          {remainingContributors > 0 && (
            <span class={styles.remaining} aria-label={`${formatter.format(remainingContributors)} more contributors`}>
              +{formatter.format(remainingContributors)}
            </span>
          )}
        </div>
      </div>
      <a class={styles.repository} href={contributorsUrl} target="_blank" rel="noopener noreferrer">
        {repository}
      </a>
    </section>
  );
}
