import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost/git/public',
    channel: 'chrome',
    headless: true,
  },
  projects: [
    {
      name: 'desktop-1280px',
      use: {
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: 'mobile-360px',
      use: {
        viewport: { width: 360, height: 740 },
      },
    },
  ],
});
