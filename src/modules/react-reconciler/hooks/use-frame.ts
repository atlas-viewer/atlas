import { useRuntime } from './use-runtime';
import { useEffect } from 'react';

export const useFrame = (callback: (time: number) => void, deps: any[] = []) => {
  const runtime = useRuntime();

  useEffect(() => {
    if (runtime) {
      return runtime.registerHook('useFrame', callback);
    }
    return () => {
      // no-op
    };
  }, deps);
};
