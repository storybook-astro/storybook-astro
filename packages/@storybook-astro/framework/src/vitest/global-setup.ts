import {
  TESTING_RENDERER_DAEMON_URL_ENV,
  startTestingRendererDaemon
} from '../testing/renderer-daemon.ts';

/**
 * Patterns for warnings that are always benign in the test context and should
 * be silenced so they don't pollute test output.
 *
 * - "Missing pages directory" — Astro emits this when the project root has no
 *   src/pages directory. Component tests never have pages.
 * - "points to missing source files" — Sourcemap gaps in the `entities` package;
 *   a third-party packaging issue, not actionable.
 */
const SUPPRESSED_WARNING_PATTERNS = [
  'Missing pages directory',
  'points to missing source files',
  'Failed to load source map for'
];

function shouldSuppress(chunk: Buffer | string): boolean {
  const msg = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);

  return SUPPRESSED_WARNING_PATTERNS.some((pattern) => msg.includes(pattern));
}

export default async function globalSetup() {
  // Intercept stderr before starting the daemon so that Astro's own logger
  // (which bypasses Vite's customLogger) doesn't leak benign noise into output.
  const originalWrite = process.stderr.write.bind(process.stderr);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stderr as any).write = function (
    chunk: Buffer | string,
    encodingOrCb?: BufferEncoding | ((err?: Error | null) => void),
    cb?: (err?: Error | null) => void
  ): boolean {
    if (shouldSuppress(chunk)) {
      const done = typeof encodingOrCb === 'function' ? encodingOrCb : cb;

      done?.();

      return true;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (originalWrite as any)(chunk, encodingOrCb, cb);
  };

  const daemon = await startTestingRendererDaemon();

  // Workers discover the shared renderer via env instead of creating their own SSR stack.
  process.env[TESTING_RENDERER_DAEMON_URL_ENV] = daemon.url;

  return async () => {
    await daemon.close();
    delete process.env[TESTING_RENDERER_DAEMON_URL_ENV];
    // Restore stderr so post-teardown output is unaffected.
    process.stderr.write = originalWrite;
  };
}
