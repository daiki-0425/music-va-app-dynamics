import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8011',
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: '../.venv/bin/python ../scripts/e2e_server.py',
    url: 'http://127.0.0.1:8011/',
    reuseExistingServer: false,
  },
})
