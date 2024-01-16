import { HasElement, HasElementMap } from './types';
import { createEmptyStorage, setStorageFromIndex } from '../helpers/grid-storage';

// Hosts
//
// We need to change how hosts work in some ways.
// For simple cases, where there is one asset hosted for an object, it should be the same
// However, when a single asset contains a grid of assets, we need a way to store and access them quickly.
// Previously we used a single, very long, array and then used an index. This was very quick to calculate and
// was great for smaller and fixed sized grids.
//
// This won't work for mapping or very large grids with millions of tiles. Instead, we need an index method where we
// can access using rows and grids. This data model can be sparsely populated without allocating an extremely large
// array.
//
// It's important to note that composition can work in 3 ways:
//  - Storing tiles for an object individually
//  - Storing tiles on a single composite object (with a record of loaded items)
//  - Storing tiles on many composite objects (e.g. 1024x1024 virtual tiles, with 256x256 real tiles)
//
// The chosen solution should work with all 3 in mind, but only the first two are to be implemented.

export function emptyHostElement(type: string): HasElement<any> {
  return {
    type,
    element: undefined,
    loading: false,
  };
}

export function emptyHostElementMap(type: string, columns = 0): HasElementMap<any> {
  return {
    type,
    elements: createEmptyStorage(),
    columns,
    loadingMap: createEmptyStorage(),
    abortMap: createEmptyStorage(),
    errorMap: createEmptyStorage(),
  };
}

export function createLoader<T>(
  host: HasElement<T>,
  loader: (signal?: AbortSignal) => Promise<T> | T,
  abortable: true
): () => Promise<void>;
export function createLoader<T>(
  host: HasElement<T>,
  loader: () => Promise<T> | T,
  abortable: false
): () => Promise<void>;
export function createLoader<T>(host: HasElement<T>, loader: () => Promise<T> | T): () => Promise<void>;
export function createLoader<T>(
  host: HasElement<T>,
  loader: (signal?: AbortSignal) => Promise<T> | T,
  abortable = false
): () => Promise<void> {
  return async () => {
    if (host.loading) {
      return;
    }

    host.abortController = abortable ? new AbortController() : undefined;
    host.loading = true;
    try {
      const element = await loader(host.abortController?.signal);
      host.loading = false;
      // Allows the image or data to be GCd hopefully!
      if (!host.abortController?.signal.aborted) {
        host.element = element;
      }
      host.abortController = undefined;
    } catch (e) {
      host.loading = false;
      host.error = e as Error;
      host.abortController = undefined;
    }
  };
}

export function createCompositeLoader<T>(
  host: HasElementMap<T>,
  loader: (data: { index: number; row: number; column: number }) => Promise<T> | T
): (index: number) => Promise<void>;
export function createCompositeLoader<T>(
  host: HasElementMap<T>,
  loader: (data: { index: number; row: number; column: number }) => Promise<T> | T,
  abortable: false
): (index: number) => Promise<void>;
export function createCompositeLoader<T>(
  host: HasElementMap<T>,
  loader: (data: { index: number; row: number; column: number }, signal?: AbortSignal) => Promise<T> | T,
  abortable: true
): (index: number) => Promise<void>;
export function createCompositeLoader<T>(
  host: HasElementMap<T>,
  loader: (data: { index: number; row: number; column: number }, signal?: AbortSignal) => Promise<T> | T,
  abortable = false
): (index: number) => Promise<void> {
  return async (index: number) => {
    const columns = host.columns;
    const row = Math.floor(index / columns);
    const column = index - row * columns;
    const abortController = abortable ? new AbortController() : undefined;
    if (abortController) {
      setStorageFromIndex(host.abortMap, host.columns, index, abortController);
    }
    setStorageFromIndex(host.loadingMap, host.columns, index, true);
    try {
      const element = await loader({ index, column, row }, abortController?.signal);
      setStorageFromIndex(host.loadingMap, host.columns, index, false);
      // Allows the image or data to be GCd hopefully!
      if (!abortController || !abortController.signal.aborted) {
        setStorageFromIndex(host.elements, host.columns, index, element);
      }
      setStorageFromIndex(host.abortMap, host.columns, index, undefined);
    } catch (e) {
      setStorageFromIndex(host.loadingMap, host.columns, index, false);
      setStorageFromIndex(host.abortMap, host.columns, index, undefined);
      setStorageFromIndex(host.errorMap, host.columns, index, e);
    }
  };
}

// export function setStorageFromIndex<T, Value = T>(
//   host: HasElementMap<T>,
//   index: number,
//   value: Value | undefined,
//   key: 'elements' | 'loadingMap' | 'abortMap' | 'errorMap' = 'elements'
// ) {
//   const storage = host[key];
//   const columns = host.columns;
//   const column = Math.floor(index / columns);
//   const row = index - column * columns;
//
//   if (!storage[row]) {
//     storage[row] = {};
//   }
//
//   if (typeof value === 'undefined') {
//     delete storage[row][column];
//   } else {
//     storage[row][column] = value as any;
//   }
// }
//
// export function getStorageFromIndex<T, Value = T>(
//   host: HasElementMap<Value>,
//   index: number,
//   key: 'elements' | 'loadingMap' | 'abortMap' | 'errorMap' = 'elements'
// ): T | undefined {
//   const storage = host[key];
//   const columns = host.columns;
//   const column = Math.floor(index / columns);
//   const row = index - column * columns;
//
//   if (storage[row]) {
//     return storage[row][column] as any;
//   }
//   return undefined;
// }
