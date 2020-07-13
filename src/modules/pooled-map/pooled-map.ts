export class PooledMap<T> {
  poolSize: number;
  cursor = 0;
  internalMap: { [key: string]: number } = {};
  keys: string[] = [];
  values: T[];
  lockedValues: { [key: string]: T } = {};

  constructor(size: number) {
    this.poolSize = size;
    this.values = new Array(size);
  }

  set(key: string, value: T): T {
    // The value that will be overridden next.
    delete this.values[this.cursor];
    // Set the internal map to be removed.
    const v = this.internalMap[this.keys[this.cursor]];
    if (v >= 0) {
      this.internalMap[this.keys[this.cursor]] = -1;
    }
    // Set out new value.
    this.keys[this.cursor] = key;
    this.values[this.cursor] = value;
    this.internalMap[key] = this.cursor;
    // Set next value to be removed.
    this.cursor = (this.cursor + 1) % this.poolSize;
    // Return the value back.
    return value;
  }

  get(key: string): T | null;
  get(key: string, reset: () => T): T;
  get(key: string, reset?: () => T): T | null {
    if (this.internalMap[key] === -2) {
      return this.lockedValues[key];
    }

    if (
      !this.internalMap.hasOwnProperty(key) ||
      this.internalMap[key] === -1 ||
      this.lockedValues.hasOwnProperty(key)
    ) {
      return reset ? this.set(key, reset()) : null;
    }

    return this.values[this.internalMap[key]];
  }

  lock(key: string) {
    const value = this.get(key);
    if (value === null) {
      throw new Error('Cannot lock resource that does not exist.');
    }
    this.lockedValues[key] = value;
    this.internalMap[key] = -2;
  }

  unsafeUnlockAll() {
    this.lockedValues = {};
  }

  unlock(key: string) {
    if (!this.lockedValues.hasOwnProperty(key)) {
      return;
    }

    delete this.lockedValues[key];
    this.internalMap[key] = -1;
  }
}
