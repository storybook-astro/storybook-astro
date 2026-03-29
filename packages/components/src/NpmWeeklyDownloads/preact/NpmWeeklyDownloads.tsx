import type { CSSProperties } from 'react';
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

type NpmDownloadPoint = {
  day: string;
  downloads: number;
};

type ChartPoint = NpmDownloadPoint & {
  x: number;
  y: number;
};

type ChartData = {
  points: ChartPoint[];
  linePath: string;
  maxDownloads: number;
  totalDownloads: number;
  baselineY: number;
};

type NpmWeeklyDownloadsProps = {
  packageName?: string;
  label?: string;
  downloads?: unknown;
};

function normalizeDownloads(dataPoints: unknown): NpmDownloadPoint[] {
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
      } satisfies NpmDownloadPoint;
    })
    .filter((point): point is NpmDownloadPoint => point !== null);
}

function normalizeTotal(value: unknown): number {
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

function createChartData(dataPoints: NpmDownloadPoint[]): ChartData {
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
    } satisfies ChartPoint;
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
  } satisfies ChartData;
}

function createPointStyle(index: number): CSSProperties {
  return {
    animationDelay: `${640 + (index * 45)}ms`
  };
}

export default function NpmWeeklyDownloads({
  packageName = '@storybook-astro/framework',
  label = 'npm weekly downloads',
  downloads = [],
}: NpmWeeklyDownloadsProps) {
  const [displayTotal, setDisplayTotal] = useState<number>(0);
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

    let animationFrameId: number | undefined;
    let startedAt: number | undefined;

    setDisplayTotal(0);

    const animate = (timestamp: number) => {
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
    <section className={styles.card} data-testid="npm-weekly-downloads">
      <span className={styles.label}>{label}</span>
      <div className={styles.row}>
        <strong
          className={styles.value}
          aria-label={`${formatter.format(safeTotal)} weekly npm downloads for ${packageName}`}
          aria-live="polite"
        >
          {formatter.format(displayTotal)}
        </strong>
        <div className={styles.chartShell}>
          <svg
            className={styles.chart}
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
               ? (
                   <path
                     className={styles.line}
                     d={chartData.linePath}
                     pathLength="1"
                     stroke={gradientUrl}
                   />
                 )
               : (
                   <line
                     className={styles.emptyLine}
                     x1={CHART_PADDING.left}
                     y1={chartData.baselineY}
                     x2={SVG_WIDTH - CHART_PADDING.right}
                    y2={chartData.baselineY}
                  />
                )}

            {chartData.points.map((point, index) => (
              <circle
                key={`${point.day}-${point.downloads}`}
                className={styles.point}
                cx={point.x}
                cy={point.y}
                r={8}
                fill={gradientUrl}
                stroke={gradientUrl}
                style={createPointStyle(index)}
              />
            ))}
          </svg>
        </div>
      </div>
      <span className={styles.package}>{packageName}</span>
    </section>
  );
}
