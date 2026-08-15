import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      // Coverage is measured on the pure layer only. supabase.ts, env.ts,
      // giphy.ts and media.ts are I/O adapters — they are exercised against a
      // local Supabase stack, not with unit-test mocks, so counting them here
      // would only produce a number that flatters the suite.
      include: ['src/lib/**', 'src/config/**'],
      exclude: [
        'src/lib/supabase.ts',
        'src/lib/env.ts',
        'src/lib/giphy.ts',
        'src/lib/media.ts',
        'src/lib/__tests__/**',
      ],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
