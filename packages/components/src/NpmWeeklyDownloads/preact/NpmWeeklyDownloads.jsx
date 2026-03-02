import { useEffect, useId, useMemo, useState } from 'preact/hooks';
import styles from '../styles/npmWeeklyDownloads.module.css';

const SVG_WIDTH = 620;
const SVG_HEIGHT = 88;
const CHART_PADDING = {
  top: 8,
  right: 4,
  bottom: 8,
  left: 4,
};
const COUNT_ANIMATION_DURATION_MS = 1500;

function normalizeDownloads(dataPoints) {
  if (!Array.isArray(dataPoints)) {
    return [];
  }

  return dataPoints
    .map((point) => {
      if (!point || typeof point !== 'object') {
        return null;
      }

      const day = typeof point.day === 'string' ? point.day : '';
      const downloads = Number(point.downloads);

      if (!day || !Number.isFinite(downloads) || downloads < 0) {
        return null;
      }

      return {
        day,
        downloads: Math.round(downloads),
      };
    })
    .filter((point) => point !== null);
}

function normalizeTotal(value) {
  const parsedValue = Number(value);

  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    return 0;
  }

  return Math.round(parsedValue);
}

function prefersReducedMotion() {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

function easeOutQuart(progress) {
  return 1 - (1 - progress) ** 4;
}

function createChartData(dataPoints) {
  if (dataPoints.length === 0) {
    return {
      points: [],
      linePath: '',
      maxDownloads: 0,
      totalDownloads: 0,
      baselineY: CHART_PADDING.top + SVG_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom,
    };
  }

  const chartWidth = SVG_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
  const chartHeight = SVG_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
  const maxDownloads = Math.max(...dataPoints.map((point) => point.downloads), 1);
  const stepX = dataPoints.length > 1 ? chartWidth / (dataPoints.length - 1) : chartWidth;
  const baselineY = CHART_PADDING.top + chartHeight;

  const points = dataPoints.map((point, index) => {
    const x = CHART_PADDING.left + (stepX * index);
    const ratio = point.downloads / maxDownloads;
    const y = CHART_PADDING.top + (chartHeight * (1 - ratio));

    return {
      ...point,
      x,
      y,
    };
  });

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  return {
    points,
    linePath,
    maxDownloads,
    totalDownloads: dataPoints.reduce((sum, point) => sum + point.downloads, 0),
    baselineY,
  };
}

export default function NpmWeeklyDownloads({
  packageName = '@storybook-astro/framework',
  label = 'npm weekly downloads',
  downloads = [],
}) {
  const [displayTotal, setDisplayTotal] = useState(0);
  const formatter = useMemo(() => new Intl.NumberFormat('en-US'), []);
  const gradientId = useId().replaceAll(':', '');
  const gradientUrl = `url(#${gradientId})`;
  const normalizedDownloads = useMemo(() => normalizeDownloads(downloads), [downloads]);
  const chartData = useMemo(() => createChartData(normalizedDownloads), [normalizedDownloads]);
  const safeTotal = normalizeTotal(chartData.totalDownloads);

  useEffect(() => {
    const targetTotal = normalizeTotal(chartData.totalDownloads);

    if (targetTotal === 0 || prefersReducedMotion()) {
      setDisplayTotal(targetTotal);

      return;
    }

    let animationFrameId;
    let startedAt;

    setDisplayTotal(0);

    const animate = (timestamp) => {
      if (startedAt === undefined) {
        startedAt = timestamp;
      }

      const elapsed = timestamp - startedAt;
      const progress = Math.min(elapsed / COUNT_ANIMATION_DURATION_MS, 1);
      const easedProgress = easeOutQuart(progress);

      setDisplayTotal(Math.round(targetTotal * easedProgress));

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
  }, [chartData.totalDownloads]);

  return (
    <section class={styles.card} data-testid="npm-weekly-downloads">
      <span class={styles.label}>{label}</span>
      <div class={styles.row}>
        <strong
          class={styles.value}
          aria-label={`${formatter.format(safeTotal)} weekly npm downloads for ${packageName}`}
          aria-live="polite"
        >
          {formatter.format(displayTotal)}
        </strong>
        <div class={styles.chartShell}>
          <svg
            class={styles.chart}
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            role="img"
            aria-label={`Weekly npm downloads for ${packageName}`}
          >
            <defs>
              <linearGradient
                id={gradientId}
                gradientUnits="userSpaceOnUse"
                x1={CHART_PADDING.left}
                y1="0"
                x2={SVG_WIDTH - CHART_PADDING.right}
                y2="0"
              >
                <stop offset="0%" stopColor="#7c3aed" />
                <stop offset="52%" stopColor="#6366f1" />
                <stop offset="100%" stopColor="#f472b6" />
              </linearGradient>
            </defs>

            {chartData.linePath
              ? <path class={styles.line} d={chartData.linePath} pathLength="1" style={{ stroke: gradientUrl }} />
              : (
                  <line
                    class={styles.emptyLine}
                    x1={CHART_PADDING.left}
                    y1={chartData.baselineY}
                    x2={SVG_WIDTH - CHART_PADDING.right}
                    y2={chartData.baselineY}
                  />
                )}

            {chartData.points.map((point, index) => (
              <circle
                key={`${point.day}-${point.downloads}`}
                class={styles.point}
                cx={point.x}
                cy={point.y}
                r={8}
                style={{ '--dot-index': String(index), fill: gradientUrl, stroke: gradientUrl }}
              />
            ))}
          </svg>
        </div>
      </div>
      <span class={styles.package}>{packageName}</span>
    </section>
  );
}
