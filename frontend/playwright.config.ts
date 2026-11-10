// End-to-end suite (OWNER: qa-engineer). Drives the installed Chrome (channel 'chrome', no browser download)
// against its own Vite dev server (:5180), so the dev server on :5173 is never touched.
// GRAVIT: only the `mock` project (/?source=mock) runs. The demo's `api` project needed the removed Hono server;
// re-add it once the Spring API (/?source=api) exists.
import { defineConfig } from '@playwright/test'
import { WEB_PORT } from './tests/e2e/env'
import type { OfficeOptions } from './tests/e2e/fixtures'

export default defineConfig<OfficeOptions>({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    channel: 'chrome',
    headless: true,
    viewport: { width: 1440, height: 900 },
    // Use the GPU when there is one; fall back to software WebGL (SwiftShader) on machines without it.
    launchOptions: { args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'mock', use: { source: 'mock' } },
  ],
  webServer: [
    {
      command: `node node_modules/vite/bin/vite.js --port ${WEB_PORT} --strictPort --host 127.0.0.1`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 90_000,
    },
  ],
})
