import { defineConfig } from 'tsdown';

export default defineConfig((options) => ({
  dts: true,
  target: ['es2020'],
  exports: true,
  format: ['esm', 'cjs'],
  platform: 'browser',
  entry: {
    index: 'src/index.ts',
  },
  minify: !options.watch,
  clean: true,
  external: ['react', 'react-dom', 'scheduler', 'react-reconciler'],
  globalName: 'AtlasViewer',
  ...options,
}));
