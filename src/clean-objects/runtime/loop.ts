/**
 * Adapted from: https://github.com/pmndrs/react-three-fiber/blob/8bab743dfeb686524c475f7d3135a6c48a371f1f/packages/fiber/src/core/loop.ts#L65
 */
import { render, RenderRoot } from './render';

type GlobalRenderCallback = (timeStamp: number) => void;
type SubItem = { callback: GlobalRenderCallback };

function createSubs(callback: GlobalRenderCallback, subs: Set<SubItem>): () => void {
  const sub = { callback };
  subs.add(sub);
  return () => void subs.delete(sub);
}

const globalEffects: Set<SubItem> = new Set();
const globalAfterEffects: Set<SubItem> = new Set();
const globalTailEffects: Set<SubItem> = new Set();

export const addEffect = (callback: GlobalRenderCallback) => createSubs(callback, globalEffects);
export const addAfterEffect = (callback: GlobalRenderCallback) => createSubs(callback, globalAfterEffects);
export const addTail = (callback: GlobalRenderCallback) => createSubs(callback, globalTailEffects);

function run(effects: Set<SubItem>, timestamp: number) {
  effects.forEach(({ callback }) => callback(timestamp));
}

export function createLoop<TCanvas>(roots: Map<TCanvas, RenderRoot>) {
  let running = false;
  let repeat: boolean;
  let frame: number;

  function loop(timestamp: number): void {
    frame = requestAnimationFrame(loop);
    running = true;
    repeat = false;

    // Run effects
    if (globalEffects.size) run(globalEffects, timestamp);

    // Render all roots
    roots.forEach((root) => {
      repeat = render(timestamp, root.state, root.hooks, root.config) || repeat;
    });

    // Run after-effects
    if (globalAfterEffects.size) run(globalAfterEffects, timestamp);

    // Stop the loop if nothing invalidates it
    if (!repeat) {
      // Tail call effects, they are called when rendering stops
      if (globalTailEffects.size) run(globalTailEffects, timestamp);

      // Flag end of operation
      running = false;
      return cancelAnimationFrame(frame);
    }
  }

  function invalidate(root?: RenderRoot): void {
    if (root) {
      root.state.pendingUpdate = true;
    } else {
      roots.forEach((root) => (root.state.pendingUpdate = true));
    }
    if (!running) {
      running = true;
      requestAnimationFrame(loop);
    }
  }

  function advance(timestamp: number, runGlobalEffects = true): void {
    if (runGlobalEffects) run(globalEffects, timestamp);
    roots.forEach((root) => render(timestamp, root.state, root.hooks, root.config));
    if (runGlobalEffects) run(globalAfterEffects, timestamp);
  }

  return {
    loop,
    invalidate,
    advance,
  };
}
