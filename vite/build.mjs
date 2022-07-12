import { defaultExternal, defineConfig } from './base-config.mjs';
import { build } from 'vite';
import chalk from 'chalk';

(async () => {
  // Main UMD build.
  buildMsg('UMD');
  await build(
    defineConfig({
      entry: `src/index.ts`,
      name: 'index',
      outDir: 'dist',
      globalName: 'AtlasViewer',
      external: ['react', 'react-dom', 'scheduler'],
      react: true,
      globals: {
        react: 'React',
        'react-dom': 'ReactDOM',
        'scheduler': 'Scheduler',
      }
    })
  );

  buildMsg('Libraries');
  await build(
    defineConfig({
      entry: `src/index.ts`,
      name: 'index',
      outDir: 'dist/bundle',
      external: [...defaultExternal],
      react: true,
    })
  );

  function buildMsg(name) {
    console.log(chalk.grey(`\n\nBuilding ${chalk.blue(name)}\n`));
  }
})();
