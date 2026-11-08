import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './responsive',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  workers: 2,
  timeout: 60_000,
  reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:3100', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node responsive/api.mjs', url: 'http://127.0.0.1:3101', reuseExistingServer: false },
    { command: 'npm run dev -- --hostname 127.0.0.1 --port 3100', url: 'http://127.0.0.1:3100', timeout: 120_000,
      env: { INTERNAL_API_URL: 'http://127.0.0.1:3101', NEXT_PUBLIC_API_URL: 'http://127.0.0.1:3101', NEXT_DIST_DIR: '.next-responsive' }, reuseExistingServer: false },
  ],
  projects: [
    { name: 'iphone-webkit', use: { browserName: 'webkit', viewport: { width: 430, height: 932 }, isMobile: true, hasTouch: true } },
    { name: 'phone-landscape', use: { browserName: 'chromium', viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true } },
    { name: 'small-phone', use: { browserName: 'chromium', viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true } },
    { name: 'phone', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
    { name: 'tablet-portrait', use: { browserName: 'chromium', viewport: { width: 768, height: 1024 }, hasTouch: true } },
    { name: 'tablet-landscape', use: { browserName: 'chromium', viewport: { width: 1024, height: 768 }, hasTouch: true } },
    { name: 'desktop', use: { browserName: 'chromium', viewport: { width: 1440, height: 1000 } } },
    { name: 'ipad-webkit', use: { browserName: 'webkit', viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true } },
  ],
});
