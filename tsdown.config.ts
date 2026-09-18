import { defineConfig } from 'tsdown';

export default defineConfig((options) => ({
  dts: true,
  target: ['es2020'],
  exports: true,
  format: ['esm', 'cjs'],
  platform: 'browser',
  entry: {
    index: 'src/index.ts',
    standalone: 'src/standalone.ts',
  },
  minify: options.watch ? false : { compress: true, mangle: false, codegen: true },
  clean: true,
  external: ['react', 'react-dom', 'scheduler', 'react-reconciler'],
  globalName: 'AtlasViewer',
  ...options,
}));
