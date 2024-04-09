import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import storylitePlugin from '@storylite/vite-plugin';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        nested: resolve(__dirname, 'canvas.html'),
      },
    },
    outDir: './storybook-static',
  },
  plugins: [
    storylitePlugin({
      stories: 'stories/**/*.stories.tsx', // relative to process.cwd()
    }),
    react({}),
  ],
  test: {
    include: ['**/*.{test,tests,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    environment: 'happy-dom', // or 'jsdom', 'node'
    globals: true,
  },
  server: {
    port: 3010,
  },
});
