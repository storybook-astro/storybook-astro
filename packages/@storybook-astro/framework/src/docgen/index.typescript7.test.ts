import { describe, expect, test, vi } from 'vitest';
import { createAstroDocgen } from './index.ts';

// TypeScript 7 (the native port) installs as `typescript`, but its default
// export is only the version — no compiler API (issue #197). Its own file
// because mocking `typescript` would take extraction away from the other suites.
vi.mock('typescript', () => ({ default: { version: '7.0.2', versionMajorMinor: '7.0' } }));

describe('with TypeScript 7 installed', () => {
  test('docgen skips with a warning instead of crashing Storybook', async () => {
    const warnings: string[] = [];
    const docgen = createAstroDocgen({
      projectRoot: process.cwd(),
      warn: (message) => warnings.push(message)
    });

    await expect(docgen.warmUp()).resolves.toBeUndefined();
    await expect(docgen.extract('/project/Card.astro', '---\n---\n<h1 />')).resolves.toBeNull();

    expect(warnings).toEqual([
      expect.stringContaining('TypeScript 7.0.2 does not include the compiler API')
    ]);
  });
});
