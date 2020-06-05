import typescript from '@rollup/plugin-typescript';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import visualizer from 'rollup-plugin-visualizer';
import replace from '@rollup/plugin-replace';
import compiler from '@ampproject/rollup-plugin-closure-compiler';
import pkg from './package.json';

export default [
  {
    input: 'src/index.ts',
    output: [
      {
        file: pkg.web,
        name: 'Atlas',
        format: 'umd',
        sourcemap: true,
      },
    ],
    plugins: [
      typescript({ target: 'es5' }),
      resolve(), // so Rollup can find `ms`
      replace({
        'process.env.NODE_ENV': JSON.stringify('production'),
      }),
      commonjs({ extensions: ['.js', '.ts'] }), // the ".ts" extension is required
      terser(),
      compiler(),
    ],
  },
  {
    input: 'src/index.ts',
    output: [
      {
        file: pkg.main,
        format: 'cjs',
      },
      {
        file: pkg.module,
        format: 'es',
      },
    ],
    external: ['@atlas-viewer/dna'],
    plugins: [
      typescript(),
      replace({
        'process.env.NODE_ENV': JSON.stringify('production'),
      }),
      resolve(), // so Rollup can find `ms`
      commonjs({ extensions: ['.js', '.ts'] }), // the ".ts" extension is required
      visualizer(),
    ],
  },
];
