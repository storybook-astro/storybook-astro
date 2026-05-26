/**
 * Builds Storybook, serves the static output on a dedicated port, and runs
 * the Playwright suite against it. Testing the built artifact (rather than
 * the dev server) catches static-only bugs like /@fs/ image paths that
 * aren't rewritten or slot HTML that gets escaped during prerendering.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 6008;

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `yarn build --quiet && npx http-server storybook-static -p ${PORT} -s -c-1`,
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
