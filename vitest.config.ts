import { defineConfig } from 'vitest/config';
// Unit tests only. Database tests live in test/integration (npm run test:integration, needs `npx supabase start`).
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], exclude: ['test/integration/**', 'node_modules/**'], environment: 'node' },
});
