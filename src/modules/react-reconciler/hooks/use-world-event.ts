import { supportedEventMap, SupportedEventNames } from '../../../events';
import { useEffect } from 'react';
import { useRuntime } from './use-runtime';

export const useWorldEvent = <Name extends SupportedEventNames>(name: Name, cb: (e: any) => void, deps: any[] = []) => {
  const runtime = useRuntime();
  const world = runtime ? runtime.world : undefined;

  useEffect(() => {
    if (runtime) {
      const callback = cb;
      const realName = supportedEventMap[name];
      runtime.world.activatedEvents.push(realName);
      const ev = realName.slice(2).toLowerCase();
      runtime.world.addEventListener(ev as any, callback);

      return () => {
        runtime.world.removeEventListener(ev as any, callback);
      };
    }
    return () => {
      // no-op
    };
  }, [world, name, ...deps]);
};
