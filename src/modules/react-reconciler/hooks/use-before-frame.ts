import { useRuntime } from './use-runtime';
import { useEffect } from 'react';

export const useBeforeFrame = (callback: (time: number) => void, deps: any[] = []) => {
  const runtime = useRuntime();

  useEffect(() => {
    if (runtime) {
      return runtime.registerHook('useBeforeFrame', callback);
    }
    return () => {
      // no-op
    };
  }, deps);
};
