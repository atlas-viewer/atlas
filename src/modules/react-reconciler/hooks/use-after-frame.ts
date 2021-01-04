import { useRuntime } from './use-runtime';
import { useEffect } from 'react';

export const useAfterFrame = (callback: (time: number) => void, deps: any[] = []) => {
  const runtime = useRuntime();

  useEffect(() => {
    if (runtime) {
      return runtime.registerHook('useAfterFrame', callback);
    }
    return () => {
      // no-op
    };
  }, deps);
};
