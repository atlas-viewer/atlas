import { SupportedEventNames, SupportedEvents } from '../../../events';
import { useEffect } from 'react';
import { useRuntime } from './use-runtime';

export const useWorldEvent = <Name extends SupportedEventNames>(name: Name, cb: (e: any) => void, deps: any[] = []) => {
  const runtime = useRuntime();
  const world = runtime ? runtime.world : undefined;

  useEffect(() => {
    if (runtime) {
      const callback = cb;
      runtime.world.activatedEvents.push(name);
      runtime.world.addEventListener(name, callback);

      return () => {
        runtime.world.removeEventListener(name, callback);
      };
    }
    return () => {
      // no-op
    };
  }, [world, name, ...deps]);
};
