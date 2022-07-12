import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import * as path from 'path';

export default defineConfig({
  build: {
    sourcemap: true,
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'Atlas',
      formats: ['es'],
      fileName: (format) => `index.${format}.js`,
    },
    rollupOptions: {
      external: ['crypto', 'react', 'react-dom', 'react-dom/client', 'react-reconciler', 'scheduler'],
      output: {
        globals: {
          crypto: 'crypto',
          react: 'React',
          'react-dom': 'ReactDOM',
          'react-reconciler': 'ReactReconciler',
          scheduler: 'Scheduler',
        },
      },
    },
  },

  plugins: [
    react({
      jsxRuntime: 'automatic',
    }),
  ],
  test: {
    include: ['**/*.{test,tests,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    environment: 'happy-dom', // or 'jsdom', 'node'
    globals: true,
  },
  server: {
    port: 3004,
  },
});
