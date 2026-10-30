/**
 * Builds Storybook and the Worker, starts it locally with `wrangler dev`
 * (workerd serves the static UI and the render API at /api), then runs the
 * Playwright suite against it. The build runs inside webServer startup, so
 * the timeout is generous.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 6021;

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  webServer: {
    command: `yarn build && yarn serve`,
    url: `http://127.0.0.1:${PORT}`,
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
