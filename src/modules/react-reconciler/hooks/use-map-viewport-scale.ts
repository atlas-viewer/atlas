import { useEffect, useRef, useState } from 'react';
import { useMapProjectionContext } from './use-map-projection';
import { useRuntime } from './use-runtime';

/**
 * Screen pixels per map-local unit, updated as the viewport zooms. Changes smaller than
 * `tolerance` (relative) are ignored so overlays do not re-render on every animation frame.
 */
export function useMapViewportScale(enabled = true, tolerance = 0.03): number {
  const runtime = useRuntime();
  const map = useMapProjectionContext();
  const objectScale = map.scale || 1;
  const last = useRef(0);
  const [scale, setScale] = useState(() => (runtime ? runtime.getScaleFactor() * objectScale : 1));

  useEffect(() => {
    if (!enabled || !runtime) {
      return;
    }
    const update = () => {
      let scale = 1;
      let object = map.object?.current;
      if (!object) scale = objectScale;
      while (object) {
        scale *= object.scale;
        object = object.__owner.value;
      }
      const next = runtime.getScaleFactor() * scale;
      if (!Number.isFinite(next) || next <= 0) {
        return;
      }
      if (!last.current || Math.abs(next - last.current) / last.current > tolerance) {
        last.current = next;
        setScale(next);
      }
    };
    update();
    return runtime.registerHook('useAfterFrame', update);
  }, [enabled, runtime, objectScale, map.object, tolerance]);

  return scale;
}
