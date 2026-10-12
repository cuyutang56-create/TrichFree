import { defineConfig } from '@playwright/test';
// Browser tests. Build first (npm run build, or npm run build:e2e for the account/sync tests).
export default defineConfig({ testDir: 'e2e', timeout: 180_000, workers: 1, reporter: 'list', expect: { timeout: 10_000 } });
