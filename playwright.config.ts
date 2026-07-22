import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testMatch: /(?:smoke|accessibility)\.spec\.ts/u, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testMatch: /(?:smoke|accessibility)\.spec\.ts/u, use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chrome', testMatch: /(?:smoke|accessibility)\.spec\.ts/u, use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', testMatch: /(?:smoke|accessibility)\.spec\.ts/u, use: { ...devices['iPhone 14'] } },
  ],
  webServer: { command: 'npm run build --workspace @pcr/web && npm run preview --workspace @pcr/web -- --host 127.0.0.1 --port 4173', port: 4173, reuseExistingServer: !process.env.CI },
});
