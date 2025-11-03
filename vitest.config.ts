import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts', // Entry point, tested via integration
        'src/mcp/**/*.ts', // MCP modules require integration testing
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/node_modules/**',
        '**/dist/**',
        '**/.trunk/**',
      ],
    },
  },
  esbuild: {
    target: 'node18'
  }
});