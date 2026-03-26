import { useEffect, useMemo, useState } from 'preact/hooks';
import styles from '../styles/githubStars.module.css';

const COUNT_ANIMATION_DURATION_MS = 1000;

type GithubStarsProps = {
  stars?: unknown;
  repository?: string;
  label?: string;
};

function normalizeStars(value: unknown): number {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }

  return Math.round(parsedValue);
}

function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function easeOutQuart(progress: number): number {
  return 1 - (1 - progress) ** 4;
}

export default function GithubStars({
  stars = 0,
  repository = 'storybook-astro/storybook-astro',
  label = 'GitHub stars',
}: GithubStarsProps) {
  const [displayStars, setDisplayStars] = useState<number>(0);
  const safeStars = normalizeStars(stars);
  const formatter = useMemo(() => new Intl.NumberFormat('en-US'), []);

  useEffect(() => {
    const targetStars = normalizeStars(stars);

    if (targetStars === 0 || prefersReducedMotion()) {
      setDisplayStars(targetStars);

      return;
    }

    let animationFrameId: number | undefined;
    let startedAt: number | undefined;

    setDisplayStars(0);

    const animate = (timestamp: number) => {
      if (startedAt === undefined) {
        startedAt = timestamp;
      }

      const elapsed = timestamp - startedAt;
      const progress = Math.min(elapsed / COUNT_ANIMATION_DURATION_MS, 1);
      const easedProgress = easeOutQuart(progress);

      setDisplayStars(Math.round(targetStars * easedProgress));

      if (progress < 1) {
        animationFrameId = globalThis.requestAnimationFrame(animate);
      }
    };

    animationFrameId = globalThis.requestAnimationFrame(animate);

    return () => {
      if (animationFrameId !== undefined) {
        globalThis.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [stars]);

  return (
    <a
      className={styles.card}
      href={`https://github.com/${repository}`}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="github-stars"
    >
      <span className={styles.label}>{label}</span>
      <div className={styles.valueRow}>
        <span className={styles.starShell} aria-hidden="true">
          <svg className={styles.star} viewBox="0 0 24 24">
            <path d="M12 2.25L14.89 8.2L21.45 9.17L16.73 13.83L17.85 20.4L12 17.28L6.15 20.4L7.27 13.83L2.55 9.17L9.11 8.2L12 2.25Z" />
          </svg>
        </span>
        <span
          className={styles.value}
          aria-label={`${formatter.format(safeStars)} GitHub stars`}
          aria-live="polite"
        >
          {formatter.format(displayStars)}
        </span>
      </div>
      <span className={styles.repository}>{repository}</span>
    </a>
  );
}
