/** LRU bitmap retention with a soft budget for the current viewport's working set. */
export class TileCanvasCache extends Map<string, HTMLCanvasElement> {
  readonly maxSize = 64 * 1024 * 1024;
  calculatedSize = 0;
  private sizes = new Map<string, number>();
  private protectedKeys = new Set<string>();

  protect(key: string) {
    this.protectedKeys.add(key);
  }

  finishFrame(keys: Set<string>) {
    this.protectedKeys = new Set(keys);
    this.trim();
  }

  get(key: string) {
    const canvas = super.get(key);
    if (canvas) {
      super.delete(key);
      super.set(key, canvas);
    }
    return canvas;
  }

  set(key: string, canvas: HTMLCanvasElement) {
    if (super.get(key) === canvas) return this;
    this.delete(key);
    const size = Math.min(this.maxSize, Math.max(1, (canvas.width || 0) * (canvas.height || 0) * 4));
    super.set(key, canvas);
    this.sizes.set(key, size);
    this.calculatedSize += size;
    this.trim();
    return this;
  }

  delete(key: string) {
    const canvas = super.get(key);
    if (!canvas) return false;
    this.calculatedSize -= this.sizes.get(key) || 0;
    this.sizes.delete(key);
    super.delete(key);
    canvas.width = canvas.height = 0;
    return true;
  }

  clear() {
    for (const key of this.keys()) this.delete(key);
    this.protectedKeys.clear();
  }

  private trim() {
    // Visible tiles may exceed the retention budget. Evicting them would cause an
    // endless load/evict/reload loop; release the excess when the viewport changes.
    for (const key of this.keys()) {
      if (this.calculatedSize <= this.maxSize) break;
      if (!this.protectedKeys.has(key)) this.delete(key);
    }
  }
}
