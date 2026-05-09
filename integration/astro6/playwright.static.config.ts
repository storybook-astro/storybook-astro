/**
 * Playwright config for testing the **built** static Storybook output.
 *
 * The default playwright.config.ts tests against the dev server, which uses
 * Vite's middleware renderer. Some bugs only surface in the static build
 * (e.g. /@fs/ image paths that aren't rewritten, or slot HTML that gets
 * escaped during prerendering). This config catches those by:
 *
 *   1. Building Storybook (`yarn build-storybook`)
 *   2. Serving the `storybook-static/` directory on a dedicated port
 *   3. Running the same test suite against it
 *
 * Usage:
 *   yarn test:static          (package.json script)
 *   npx playwright test --config playwright.static.config.ts
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 6008;

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `yarn build-storybook --quiet && npx http-server storybook-static -p ${PORT} -s -c-1`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180 * 1000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
