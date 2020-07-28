import { useEffect, useRef, useState } from 'react';
import { useAtlas, useFrame, useRuntime } from '../Atlas';
import { Box } from '../../../objects/box';
import { useMode } from './use-mode';
import { useWorldEvent } from './use-world-event';

export const useResizeWorldItem = (
  props: { x: number; y: number; width: number; height: number },
  onSave: (item: { x: number; y: number; width: number; height: number }) => void
) => {
  const mode = useMode();
  const runtime = useRuntime();
  const atlas = useAtlas();
  const resizeMode = useRef<string>();
  const portalRef = useRef<Box | null>(null);
  const mouseStart = useRef<{ x: number; y: number } | undefined>();
  const [isEditing, setIsEditing] = useState(false);
  const cardinalDeltas = useRef({ north: 0, south: 0, east: 0, west: 0 });

  const mouseEvent = (direction: string) => (e: any) => {
    setIsEditing(true);
    const { top, left } = atlas.canvasPosition;
    const current = runtime.viewerToWorld(e.pageX - left, e.pageY - top);
    mouseStart.current = { x: current.x, y: current.y };
    resizeMode.current = direction;
  };

  useFrame(() => {
    if (mouseStart && atlas.ready) {
      runtime.pendingUpdate = true;
    }
  });

  useEffect(() => {
    runtime.pendingUpdate = true;
  }, [runtime, isEditing]);

  useWorldEvent(
    'onPointerMove',
    e => {
      if (runtime.mode !== 'sketch') return;
      const box = portalRef.current;
      // Take co-ordinates, clamp constraints, update
      if (
        resizeMode.current === 'translate' ||
        resizeMode.current === 'east' ||
        resizeMode.current === 'north-east' ||
        resizeMode.current === 'south-east'
      ) {
        cardinalDeltas.current.east = e.atlas.x - (mouseStart.current ? mouseStart.current.x : 0);
      }
      if (
        resizeMode.current === 'translate' ||
        resizeMode.current === 'west' ||
        resizeMode.current === 'north-west' ||
        resizeMode.current === 'south-west'
      ) {
        cardinalDeltas.current.west = e.atlas.x - (mouseStart.current ? mouseStart.current.x : 0);
      }
      if (
        resizeMode.current === 'translate' ||
        resizeMode.current === 'north' ||
        resizeMode.current === 'north-east' ||
        resizeMode.current === 'north-west'
      ) {
        cardinalDeltas.current.north = e.atlas.y - (mouseStart.current ? mouseStart.current.y : 0);
      }
      if (
        resizeMode.current === 'translate' ||
        resizeMode.current === 'south' ||
        resizeMode.current === 'south-west' ||
        resizeMode.current === 'south-east'
      ) {
        cardinalDeltas.current.south = e.atlas.y - (mouseStart.current ? mouseStart.current.y : 0);
      }

      if (box) {
        box.points[1] = cardinalDeltas.current.west;
        box.points[2] = cardinalDeltas.current.north;
        box.points[3] = props.width + cardinalDeltas.current.east;
        box.points[4] = props.height + cardinalDeltas.current.south;

        runtime.pendingUpdate = true;
      }
    },
    [props.width, props.height]
  );

  const windowPointerUp = useRef<() => void>();

  useEffect(() => {
    windowPointerUp.current = () => {
      if (isEditing) {
        onSave({
          x: (props.x || 0) + cardinalDeltas.current.west,
          y: (props.y || 0) + cardinalDeltas.current.north,
          width: props.width + cardinalDeltas.current.east - cardinalDeltas.current.west,
          height: props.height + cardinalDeltas.current.south - cardinalDeltas.current.north,
        });

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
    return () => window.removeEventListener('pointerup', cb);
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
    isEditing,
  };
};
