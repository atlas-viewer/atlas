import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire, isBuiltin } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// Follow static imports, re-exports, require() and literal dynamic imports,
// including shared output chunks and external dependencies.
const root = resolve(process.argv[2] || dirname(fileURLToPath(import.meta.url)) + '/..');
const require = createRequire(resolve(root, 'package.json'));
const seen = new Set();
function inspect(file) {
  if (seen.has(file) || file.endsWith('.json')) return;
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  for (const { fileName: specifier } of ts.preProcessFile(source, true, true).importedFiles) {
    if (['exports', 'require', 'module'].includes(specifier)) continue; // AMD loader tokens.
    assert(!forbidden.test(specifier), `${file} imports forbidden runtime ${specifier}`);
    if (!isBuiltin(specifier)) inspect(createRequire(file).resolve(specifier));
  }
}
const forbidden = /^(?:react-dom|preact)(?:\/|$)/;
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const entry = pkg.exports['./react'];
for (const format of ['import', 'require']) {
  const target = typeof entry[format] === 'string' ? entry[format] : entry[format].default;
  inspect(resolve(root, target));
  const module = format === 'import'
    ? await import(pathToFileURL(resolve(root, target)))
    : require(pkg.name + '/react');
  const rootTarget = pkg.exports['.'][format];
  const legacy = format === 'import'
    ? await import(pathToFileURL(resolve(root, typeof rootTarget === 'string' ? rootTarget : rootTarget.default)))
    : require(pkg.name);
  for (const key of ['AtlasContext', 'BoundsContext', 'ReactAtlas', 'World', 'Runtime']) {
    assert(module[key], `Missing export ${key}`);
    assert.equal(module[key], legacy[key], `${format} duplicates ${key}`);
  }
  for (const key of ['HTMLPortal', 'DevTools', 'AtlasAuto', 'CanvasPanel']) assert(!(key in module), key);
  if (typeof entry[format] === 'object') assert(existsSync(resolve(root, entry[format].types)));
}
console.log('Passed: react ESM/CJS dependency graphs and shared runtime/context identity.');
