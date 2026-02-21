import { useCallback, useEffect, useState } from 'react';
import type { RuntimeZoneState } from '../../../renderer/runtime';
import { useAfterFrame } from './use-after-frame';
import { useRuntime } from './use-runtime';

function getDefaultZoneRuntimeState(zoneId: string): RuntimeZoneState {
  return {
    zoneId,
    exists: false,
    active: false,
    visibleInViewport: false,
  };
}

export const useZoneRuntimeState = (zoneId: string): RuntimeZoneState => {
  const runtime = useRuntime();
  const [state, setState] = useState<RuntimeZoneState>(() => getDefaultZoneRuntimeState(zoneId));

  const update = useCallback(() => {
    const next = runtime ? runtime.getZoneRuntimeState(zoneId) : getDefaultZoneRuntimeState(zoneId);
    setState((prev) => {
      if (
        prev.zoneId === next.zoneId &&
        prev.exists === next.exists &&
        prev.active === next.active &&
        prev.visibleInViewport === next.visibleInViewport
      ) {
        return prev;
      }
      return next;
    });
  }, [runtime, zoneId]);

  useAfterFrame(update, [runtime, update]);

  useEffect(() => {
    update();
    if (!runtime) {
      return () => {
        // no-op
      };
    }
    return runtime.world.addLayoutSubscriber((type) => {
      if (type === 'zone-changed' || type === 'goto-region' || type === 'recalculate-world-size') {
        update();
      }
    });
  }, [runtime, update]);

  return state;
};
