import { useLayoutEffect, useState } from 'react';
import type { ComparisonController, ComparisonState } from '../../comparison/comparison';
import { useRuntime } from './use-runtime';

export function useComparison(): ComparisonController | null {
  const runtime = useRuntime();
  const [controller, setController] = useState<ComparisonController | null>(() => runtime?.comparison || null);
  useLayoutEffect(() => {
    const update = () => setController(runtime?.comparison || null);
    const unsubscribe = runtime?.subscribeComparison(update);
    update();
    return unsubscribe;
  }, [runtime]);
  return controller;
}

export function useComparisonState(controller: ComparisonController | null | undefined): ComparisonState | null {
  const [state, setState] = useState<ComparisonState | null>(() => controller?.getState() || null);
  useLayoutEffect(() => {
    const update = () => setState(controller?.getRuntime() ? controller.getState() : null);
    const unsubscribe = controller?.subscribe(update);
    update();
    return unsubscribe;
  }, [controller]);
  return state;
}
