import { Paintable } from '../../../world-objects/paint';
import { useRuntime } from './use-runtime';
import { useEffect } from 'react';

export const useAfterPaint = (callback: (paint: Paintable) => void, deps: any[] = []) => {
  const runtime = useRuntime();

  useEffect(() => {
    if (runtime) {
      return runtime.registerHook('useAfterPaint', callback);
    }
    return () => {
      // no-op
    };
  }, deps);
};
