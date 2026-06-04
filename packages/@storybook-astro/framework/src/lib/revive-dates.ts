/**
 * Revives Date objects that were lost during JSON serialization.
 *
 * When story args travel over Vite HMR (dev) or HTTP (server mode), Date
 * values are serialized by JSON.stringify into ISO 8601 strings like
 * "2025-04-12T00:00:00.000Z". This function walks the args tree and
 * converts those strings back into Date objects so Astro components
 * receive the types they expect.
 *
 * Only the exact format produced by Date.toJSON() is matched
 * (YYYY-MM-DDTHH:mm:ss.sssZ) to minimize false positives.
 */

// Matches the exact output of Date.toJSON() / JSON.stringify(date).
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function reviveDateStrings(args: Record<string, unknown>): Record<string, unknown> {
  const revived: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    revived[key] = reviveValue(value);
  }

  return revived;
}

function reviveValue(value: unknown): unknown {
  if (typeof value === 'string' && ISO_DATE_PATTERN.test(value)) {
    const date = new Date(value);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map(reviveValue);
  }

  if (isRecord(value)) {
    return reviveDateStrings(value);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
