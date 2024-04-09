import { defineConfig, type Options } from 'tsup';

export default defineConfig((options: Options) => ({
  dts: true,
  target: ['es2020'],
  format: ['esm', 'cjs', 'iife'],
  platform: 'browser',
  entry: {
    index: 'src/index.ts',
  },
  minify: true,
  external: ['react', 'react-dom', 'scheduler'],
  globalName: 'AtlasViewer',
  ...options,
}));
