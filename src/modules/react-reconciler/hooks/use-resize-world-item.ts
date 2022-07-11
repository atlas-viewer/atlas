import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box } from '../../../objects/box';
import { useMode } from './use-mode';
import { useWorldEvent } from './use-world-event';
import { useRuntime } from './use-runtime';
import { useFrame } from './use-frame';
import { useCanvasPosition } from './use-canvas-position';

export const useResizeWorldItem = (
  props: { x: number; y: number; width: number; height: number; maintainAspectRatio?: boolean; aspectRatio?: number },
  onSave: (item: { x: number; y: number; width: number; height: number }) => void
) => {
  const mode = useMode();
  const runtime = useRuntime();
  const canvasPosition = useCanvasPosition();
  const resizeMode = useRef<string>();
  const portalRef = useRef<Box | null>(null);
  const mouseStart = useRef<{ x: number; y: number } | undefined>();
  const [isEditing, setIsEditing] = useState(false);
  const cardinalDeltas = useRef({ north: 0, south: 0, east: 0, west: 0 });

  const mouseEvent = (direction: string) => (e: any) => {
    setIsEditing(true);
    if (canvasPosition && runtime) {
      const { top, left } = canvasPosition;
      const current = runtime.viewerToWorld(e.pageX - left, e.pageY - top);
      mouseStart.current = { x: current.x, y: current.y };
      resizeMode.current = direction;
    }
  };

  const aspectRatio = useMemo(() => {
    // Calculate aspect ratio.
  }, [])

  const constrainToAspectRatio = useCallback(() => {
    // 1. Set initial aspect ratio.
    // 2.
  }, []);

  useFrame(() => {
    if (mouseStart && runtime) {
      runtime.updateNextFrame();
    }
  });

  useEffect(() => {
    if (runtime) {
      runtime.updateNextFrame();
    }
  }, [runtime, isEditing]);

  const onPointerMoveCallback = useCallback(
    (e) => {
      const position = e.atlasTouches ? e.atlasTouches[0] : e.atlas ? e.atlas : { x: e.pageX, y: e.pageY };

      if (!runtime || runtime.mode !== 'sketch') return;
      const box = portalRef.current;
      // Take co-ordinates, clamp constraints, update
      if (
        resizeMode.current === 'translate' ||
        resizeMode.current === 'east' ||
        resizeMode.current === 'north-east' ||
        resizeMode.current === 'south-east'
      ) {
        cardinalDeltas.current.east = position.x - (mouseStart.current ? mouseStart.current.x : 0);
      }
      if (
        resizeMode.current === 'translate' ||
        resizeMode.current === 'west' ||
        resizeMode.current === 'north-west' ||
        resizeMode.current === 'south-west'
      ) {
        cardinalDeltas.current.west = position.x - (mouseStart.current ? mouseStart.current.x : 0);
      }
      if (
        resizeMode.current === 'translate' ||
        resizeMode.current === 'north' ||
        resizeMode.current === 'north-east' ||
        resizeMode.current === 'north-west'
      ) {
        cardinalDeltas.current.north = position.y - (mouseStart.current ? mouseStart.current.y : 0);
      }
      if (
        resizeMode.current === 'translate' ||
        resizeMode.current === 'south' ||
        resizeMode.current === 'south-west' ||
        resizeMode.current === 'south-east'
      ) {
        cardinalDeltas.current.south = position.y - (mouseStart.current ? mouseStart.current.y : 0);
      }

      if (box) {
        box.points[1] = cardinalDeltas.current.west;
        box.points[2] = cardinalDeltas.current.north;
        box.points[3] = props.width + cardinalDeltas.current.east;
        box.points[4] = props.height + cardinalDeltas.current.south;

        runtime.updateNextFrame();
      }
    },
    [runtime, props.width, props.height]
  );

  useWorldEvent('mousemove', onPointerMoveCallback, [props.width, props.height]);
  useWorldEvent('pointermove', onPointerMoveCallback, [props.width, props.height]);

  const windowPointerUp = useRef<() => void>();

  useEffect(() => {
    windowPointerUp.current = () => {
      if (isEditing) {
        const realSize = {
          x: (props.x || 0) + cardinalDeltas.current.west,
          y: (props.y || 0) + cardinalDeltas.current.north,
          width: props.width + cardinalDeltas.current.east - cardinalDeltas.current.west,
          height: props.height + cardinalDeltas.current.south - cardinalDeltas.current.north,
        };
        if (props.maintainAspectRatio) {
          // @todo apply aspect ratio here.
          onSave(realSize);
        } else {
          onSave(realSize);
        }

        resizeMode.current = undefined;
        mouseStart.current = undefined;
        cardinalDeltas.current.east = 0;
        cardinalDeltas.current.west = 0;
        cardinalDeltas.current.north = 0;
        cardinalDeltas.current.south = 0;
        setIsEditing(false);
      }
    };
  }, [isEditing, onSave, props.height, props.width, props.x, props.y]);

  useEffect(() => {
    const cb = () => {
      if (windowPointerUp.current) {
        windowPointerUp.current();
      }
    };
    window.addEventListener('pointerup', cb);
    window.addEventListener('touchend', cb);
    return () => {
      window.removeEventListener('pointerup', cb);
      window.removeEventListener('touchend', cb);
    };
  }, []);

  // useEffect(() => {
  //   const cb = () => {
  //     onSave({
  //       x: (props.x || 0) + cardinalDeltas.current.west,
  //       y: (props.y || 0) + cardinalDeltas.current.north,
  //       width: props.width + cardinalDeltas.current.east - cardinalDeltas.current.west,
  //       height: props.height + cardinalDeltas.current.south - cardinalDeltas.current.north,
  //     });
  //
  //     resizeMode.current = undefined;
  //     mouseStart.current = undefined;
  //     cardinalDeltas.current.east = 0;
  //     cardinalDeltas.current.west = 0;
  //     cardinalDeltas.current.north = 0;
  //     cardinalDeltas.current.south = 0;
  //     setIsEditing(false);
  //   };
  //   window.addEventListener('pointerup', cb);
  //   return () => {
  //     window.removeEventListener('pointerup', cb);
  //   };
  // }, [onSave, props.height, props.width, props.x, props.y]);

  return {
    portalRef,
    mode,
    mouseEvent,
    onPointerMoveCallback,
    isEditing,
  };
};
