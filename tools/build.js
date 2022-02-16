const pkg = require('../package.json');

require('esbuild')
  .build({
    // entryPoints: ['src/standalone.ts'],
    entryPoints: ['src/index.ts'],
    outfile: 'dist/esbuild.js',
    bundle: true,
    minify: false,
    sourcemap: true,
    format: 'esm',
    target: ['chrome58', 'firefox57', 'safari11', 'edge18'],
    globalName: 'Atlas',
    define: {
      'process.env.VERSION': JSON.stringify(pkg.version),
      'process.env.NODE_ENV': '"production"',
    },
    external: [
      // List of modules.
      'react',
      'typescript-memoize',
      'stats.js',
      'normalize-wheel',
      'object-assign',
      'scheduler',
      'react-reconciler',
      'debounce',
      'react-dom',
      'typesafe-actions',
      'nanoid',
      '@atlas-viewer/dna',
      '@popmotion/popcorn',
      'popmotion',
      'react-use-measure',
      '@hyperion-framework/vault',
    ],
  })
  .catch(() => process.exit(1));
