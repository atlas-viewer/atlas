/**
 * Runs `fn` on the next microtask, unless the returned canceller is called
 * first. Extracted out of usePreset's React StrictMode double-invoke guard
 * (see its own comment) so that guard's actual logic -- "defer, but let a
 * cleanup that runs before the microtask fires cancel it" -- can be unit
 * tested directly, without needing to render a React tree or reproduce
 * StrictMode's double-invoke timing.
 */
export function deferToMicrotask(fn: () => void): () => void {
  let cancelled = false;
  Promise.resolve().then(() => {
    if (!cancelled) {
      fn();
    }
  });
  return () => {
    cancelled = true;
  };
}
