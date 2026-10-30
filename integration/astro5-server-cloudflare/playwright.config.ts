/**
 * Builds Storybook and the render app for Cloudflare Workers, starts the local
 * preview (`yarn serve`), then runs the server-mode suite shared by every
 * astro{N}-server-{platform} app against it.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 6153;

export default defineConfig({
  testDir: './tests',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  webServer: {
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
