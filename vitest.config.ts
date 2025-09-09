import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '*.config.ts',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types/**',
        '**/index.ts',
        'examples/',
        'scripts/',
        'tests/',
        'src/ai/agents/embedded-types.ts', // auto-generated
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
    include: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
    exclude: ['node_modules', 'dist'],
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 1000,
    watch: false,
  },
})
