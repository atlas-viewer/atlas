import type { Runtime } from '../../renderer/runtime';
import type { WorldObject } from '../../world-objects/world-object';
import type { World } from '../../world';
import {
  comparisonSideAtPoint,
  normalizeSplit,
  resolveComparisonClip,
  type ComparisonSide,
  type ComparisonSplit,
  type LayerContext,
} from './geometry';

export type ComparisonTarget = { objects: readonly WorldObject[] } | { zoneId: string };
export type ComparisonDetail = Readonly<{ source: 'pointer' | 'keyboard' | 'api' }>;
export type ComparisonOptions = {
  first: ComparisonTarget;
  second: ComparisonTarget;
  split?: ComparisonSplit;
  defaultSplit?: ComparisonSplit;
  enabled?: boolean;
  onSplitChange?: (split: ComparisonSplit, detail: ComparisonDetail) => void;
  onSplitCommit?: (split: ComparisonSplit, detail: ComparisonDetail) => void;
};
export type ComparisonState = Readonly<{ split: ComparisonSplit; enabled: boolean }>;
export type ComparisonEvent = { type: 'change' | 'commit' | 'destroy'; detail: ComparisonState };

/** One comparison per runtime. Allocation alone has no scene or browser effects. */
export class ComparisonController {
  private runtime?: Runtime;
  private options: ComparisonOptions;
  private state: ComparisonState;
  private listeners = new Set<(event: ComparisonEvent) => void>();
  private cleanup = new Set<() => void>();
  private eventListeners = new Map<
    ComparisonEvent['type'],
    Map<(event: ComparisonEvent) => void, (event: ComparisonEvent) => void>
  >();
  private destroyed = false;
  private hidden = false;

  constructor(options: ComparisonOptions) {
    if (options.split && options.defaultSplit) throw new Error('Use split or defaultSplit, not both');
    this.options = options;
    this.state = Object.freeze({
      split: normalizeSplit(options.split || options.defaultSplit || { angle: 0, position: 0.5 }),
      enabled: options.enabled !== false,
    });
  }
  attach(runtime: Runtime) {
    if (this.destroyed) throw new Error('Comparison has been destroyed');
    if (this.runtime === runtime) return;
    if (this.runtime) throw new Error('Comparison already attached');
    if (runtime.comparison && runtime.comparison !== this)
      throw new Error('Only one comparison may be attached to a runtime');
    if (!runtime.renderer.supportsViewportClip) throw new Error('Renderer does not support viewport clipping');
    this.runtime = runtime;
    runtime.setComparison(this);
    this.emit('change');
  }
  getState = (): ComparisonState => this.state;
  getRuntime() {
    return this.runtime;
  }
  subscribe = (listener: () => void) => {
    const callback = () => listener();
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  addEventListener(type: ComparisonEvent['type'], listener: (event: ComparisonEvent) => void) {
    this.removeEventListener(type, listener);
    const callback = (event: ComparisonEvent) => {
      if (event.type === type) listener(event);
    };
    const listeners = this.eventListeners.get(type) || new Map();
    listeners.set(listener, callback);
    this.eventListeners.set(type, listeners);
    this.listeners.add(callback);
    return () => this.removeEventListener(type, listener);
  }
  removeEventListener(type: ComparisonEvent['type'], listener: (event: ComparisonEvent) => void) {
    const listeners = this.eventListeners.get(type),
      callback = listeners?.get(listener);
    if (callback) this.listeners.delete(callback);
    listeners?.delete(listener);
  }
  addCleanup(callback: () => void) {
    this.cleanup.add(callback);
    return () => {
      this.cleanup.delete(callback);
    };
  }
  private emit(type: ComparisonEvent['type']) {
    for (const listener of [...this.listeners]) listener({ type, detail: this.state });
    this.runtime?.updateNextFrame();
  }
  updateOptions(options: ComparisonOptions) {
    if (options.split && options.defaultSplit) throw new Error('Use split or defaultSplit, not both');
    if (!!options.split !== !!this.options.split)
      throw new Error('Cannot switch comparison state ownership while mounted');
    this.options = options;
    const split = options.split ? normalizeSplit(options.split) : this.state.split;
    this.state = Object.freeze({ split, enabled: options.enabled !== false && !this.hidden });
    this.emit('change');
  }
  setSplit(split: ComparisonSplit, detail: ComparisonDetail = { source: 'api' }) {
    if (this.destroyed) return;
    split = normalizeSplit(split);
    if (!this.options.split) {
      this.state = Object.freeze({ ...this.state, split });
      this.emit('change');
    }
    this.options.onSplitChange?.(split, detail);
  }
  commit(detail: ComparisonDetail) {
    if (this.destroyed) return;
    this.options.onSplitCommit?.(this.state.split, detail);
    this.emit('commit');
  }
  setTargets(targets: Pick<ComparisonOptions, 'first' | 'second'>) {
    this.options = { ...this.options, ...targets };
    this.emit('change');
  }
  setEnabled(enabled: boolean) {
    this.updateOptions({ ...this.options, enabled });
  }
  setHidden(hidden: boolean) {
    this.hidden = hidden;
    this.updateOptions(this.options);
  }
  private members(target: ComparisonTarget, world: World) {
    return 'zoneId' in target ? world.getZoneById(target.zoneId)?.objects || [] : target.objects;
  }
  sideFor(object: WorldObject, world: World): ComparisonSide | undefined {
    if (!this.state.enabled) return;
    const contains = (target: ComparisonTarget) =>
      this.members(target, world).some((member) => {
        let candidate: WorldObject | undefined = object;
        while (candidate) {
          if (candidate === member) return true;
          candidate = candidate.__owner?.value;
        }
        return false;
      });
    const first = contains(this.options.first),
      second = contains(this.options.second);
    return first === second ? undefined : first ? 'first' : 'second';
  }
  includes(object: WorldObject, world: World): boolean {
    if (!this.state.enabled) return false;
    return [...this.members(this.options.first, world), ...this.members(this.options.second, world)].some((member) => {
      let candidate: WorldObject | undefined = member;
      while (candidate) {
        if (candidate === object) return true;
        candidate = candidate.__owner.value;
      }
      return false;
    });
  }
  layerContext(object: WorldObject, world: World, width: number, height: number): LayerContext | undefined {
    const side = this.sideFor(object, world);
    return side ? { viewportClip: resolveComparisonClip(this.state.split, width, height, side) } : undefined;
  }
  accepts(object: WorldObject, world: World, x: number, y: number): boolean {
    const runtime = this.runtime;
    if (!runtime || !this.state.enabled) return true;
    const side = this.sideFor(object, world);
    if (!side) return true;
    const point = runtime.worldToViewer(x, y, 0, 0);
    const bounds = runtime.renderer.getRendererScreenPosition();
    if (!bounds?.width || !bounds.height) return false;
    return (
      side === comparisonSideAtPoint(resolveComparisonClip(this.state.split, bounds.width, bounds.height, side), point)
    );
  }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const callback of [...this.cleanup]) callback();
    this.cleanup.clear();
    const runtime = this.runtime;
    if (runtime?.comparison === this) runtime.setComparison(undefined);
    this.runtime = undefined;
    this.emit('destroy');
    this.listeners.clear();
    this.eventListeners.clear();
  }
}

export function createComparison(runtime: Runtime, options: ComparisonOptions) {
  const comparison = new ComparisonController(options);
  comparison.attach(runtime);
  return comparison;
}
