/**
 * Builds Storybook, builds the render server, and boots `preview-storybook.mjs`
 * (which serves storybook-static AND mounts the render server at
 * /api/storybook-astro), then runs the Playwright suite against that single
 * process. The build runs inside webServer startup, so the timeout is generous.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 6017;

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: `yarn build --quiet && node ./preview-storybook.mjs`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 240 * 1000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
