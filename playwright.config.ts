import { defineConfig } from '@playwright/test'

/**
 * The pre-installed Chromium in this environment is a different revision from
 * the one this Playwright version would fetch, and browser downloads are
 * disabled here. Pointing `executablePath` at the installed build is the
 * supported way to run against it.
 */
const CHROMIUM = process.env['CHRONOS_CHROMIUM'] ?? '/opt/pw-browsers/chromium'

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5174',
    launchOptions: {
      executablePath: CHROMIUM,
      // Frame pacing is left at the compositor default: the perf gate measures
      // real rAF intervals, and uncapping the frame rate would make them
      // meaningless. Hinting is disabled because the bitmap eras depend on
      // unhinted pixel-outline fonts staying on the integer grid.
      args: ['--font-render-hinting=none'],
    },
  },
  webServer: {
    command: 'npx vite --port 5174 --strictPort',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
})
