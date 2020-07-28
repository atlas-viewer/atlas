import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import visualizer from 'rollup-plugin-visualizer';
import replace from '@rollup/plugin-replace';
import compiler from '@ampproject/rollup-plugin-closure-compiler';
import pkg from './package.json';

const isProduction = process.env.NODE_ENV === 'production';

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: pkg.web,
        name: 'Atlas',
        format: 'umd',
        sourcemap: true,
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'react-reconciler': 'ReactReconciler',
          scheduler: 'Scheduler',
        },
      },
    ],
    external: ['react', 'react-dom', 'react-reconciler', 'scheduler'],
    plugins: [
      typescript({ target: 'es5' }),
      resolve(), // so Rollup can find `ms`
      replace({
        'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
        'process.env.VERSION': JSON.stringify(pkg.version),
      }),
      commonjs({ extensions: ['.js', '.ts'] }), // the ".ts" extension is required
      isProduction && terser(),
      isProduction && compiler(),
    ].filter(Boolean),
  },
  {
    input: 'src/index.ts',
    output: [
      {
        file: pkg.main,
        format: 'cjs',
        sourcemap: true,
      },
      {
        file: pkg.module,
        format: 'es',
        sourcemap: true,
      },
    ],
    external: [...Object.keys(pkg.dependencies)],
    plugins: [
      typescript({ target: isProduction ? 'es5' : 'es2020' }),
      replace({
        'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
        'process.env.VERSION': JSON.stringify(pkg.version),
      }),
      resolve(), // so Rollup can find `ms`
      commonjs({ extensions: ['.js', '.ts'] }), // the ".ts" extension is required
      isProduction && visualizer(),
    ],
  },
].filter(Boolean);
