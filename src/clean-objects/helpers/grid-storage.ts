export type GridStorage<T> = Record<number, Record<number, T>>;

export function createEmptyStorage<T>(): GridStorage<T> {
  return Object.create(null);
}

export function setStorageFromIndex<T, Value = T>(
  storage: GridStorage<T>,
  columns: number,
  index: number,
  value: Value | undefined
) {
  const column = Math.floor(index / columns);
  const row = index - column * columns;

  if (!storage[row]) {
    storage[row] = {};
  }

  if (typeof value === 'undefined') {
    delete storage[row][column];
  } else {
    storage[row][column] = value as any;
  }
}

export function getStorageFromIndex<T, Value = T>(
  storage: GridStorage<T>,
  columns: number,
  index: number
): T | undefined {
  const column = Math.floor(index / columns);
  const row = index - column * columns;

  if (storage[row]) {
    return storage[row][column] as any;
  }
  return undefined;
}
