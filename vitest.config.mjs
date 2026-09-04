import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
  },
});
