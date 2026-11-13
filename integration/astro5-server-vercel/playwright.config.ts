/**
 * Builds Storybook and the render app for Vercel, starts the local
 * preview (`yarn serve`), then runs the server-mode suite shared by every
 * astro{N}-server-{platform} app against it. Set STORYBOOK_URL to run it
 * against a deployment instead.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 6151;
const deployment = process.env.STORYBOOK_URL;

export default defineConfig({
  testDir: './tests',
  // A deployment's first render can include a serverless cold start.
  expect: { timeout: deployment ? 15_000 : 5_000 },
  use: {
    baseURL: deployment ?? `http://127.0.0.1:${PORT}`,
  },
  webServer: deployment
    ? undefined
    : {
        command: `yarn build && yarn serve`,
        url: `http://127.0.0.1:${PORT}/api`,
        reuseExistingServer: !process.env.CI,
        timeout: 300 * 1000,
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
