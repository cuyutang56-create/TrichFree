import { defineConfig } from 'vitest/config';

// Integration tests need the local Supabase stack: `npx supabase start` (Docker), then `npm run test:integration`.
export default defineConfig({
  test: {
    include: ['test/integration/**/*.int.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
