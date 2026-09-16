import os from 'node:os';
import path from 'node:path';
import { defineConfig } from '@playwright/test';

const port = 3210;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000
  },
  outputDir: path.join(os.tmpdir(), 'jd-to-notion-playwright-results'),
  reporter: 'line',
  use: {
    baseURL,
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure'
  },
  webServer: {
    command: 'node src/server/server.js',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 15_000,
    env: {
      PORT: String(port),
      ADMISSIONS_CYCLE: '2026/27',
      NOTION_CREATION_ENABLED: 'false',
      GOOGLE_SHEETS_ENABLED: 'false',
      GOOGLE_SHEETS_WRITE_ENABLED: 'false',
      WORD_GENERATION_ENABLED: 'false'
    }
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: {
        channel: 'chrome',
        viewport: { width: 1280, height: 900 }
      }
    }
  ]
});
