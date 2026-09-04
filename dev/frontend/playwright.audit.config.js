import { defineConfig } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'http://127.0.0.1:3000'

export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL,
    headless: true,
    ignoreHTTPSErrors: true,
    ...(process.env.E2E_CHROME_PATH
      ? { launchOptions: { executablePath: process.env.E2E_CHROME_PATH } }
      : {}),
  },
})
