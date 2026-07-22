import { defineConfig } from 'vitest/config';

const common = {
  pool: 'forks' as const,
  fileParallelism: false,
  maxWorkers: 1,
  globals: true,
};

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          ...common,
          name: 'web',
          environment: 'jsdom',
          setupFiles: ['apps/web/tests/setup.ts'],
          include: ['apps/web/tests/**/*.test.ts', 'apps/web/tests/**/*.test.tsx'],
        },
      },
      {
        test: {
          ...common,
          name: 'node',
          environment: 'node',
          include: [
            'apps/api/tests/**/*.test.ts',
            'apps/{ai-worker,pdf-worker,media-worker,outbox-worker}/src/**/*.test.ts',
            'packages/*/tests/**/*.test.ts',
          ],
        },
      },
    ],
  },
});
