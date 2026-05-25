import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    environment: 'node',
  },
  plugins: [
    // Usar SWC para una compilación más rápida de archivos TS en tests
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
});