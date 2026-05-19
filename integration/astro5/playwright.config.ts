import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testIgnore: '**/*-static.spec.ts',
  use: {
    baseURL: 'http://localhost:6007',
  },
  webServer: {
    command: 'yarn storybook',
    url: 'http://localhost:6007',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
