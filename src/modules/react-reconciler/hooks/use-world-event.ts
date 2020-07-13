import { SupportedEvents } from '../../../events';
import { useEffect } from 'react';
import { useRuntime } from '../Atlas';

export const useWorldEvent = <Name extends keyof SupportedEvents>(
  name: Name,
  cb: SupportedEvents[Name],
  deps: any[] = []
) => {
  const runtime = useRuntime();

  useEffect(() => {
    const callback = cb;
    runtime.world.activatedEvents.push(name);
    runtime.world.addEventListener(name, callback);

    return () => {
      runtime.world.removeEventListener(name, callback);
    };
  }, [runtime.world, name, ...deps]);
};
