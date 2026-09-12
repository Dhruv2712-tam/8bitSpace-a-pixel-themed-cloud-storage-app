import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', fullyParallel: true,
  use: { baseURL: 'http://127.0.0.1:4173', browserName:'chromium', viewport:{width:1440,height:1000} },
  webServer: { command:'npm run preview -- --port 4173 --strictPort', url:'http://127.0.0.1:4173', reuseExistingServer:!process.env.CI },
  outputDir:'.browser-check', reporter:'list',
})
