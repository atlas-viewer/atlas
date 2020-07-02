import React, { useRef, useState } from 'react';
import { WorldObject } from '../../../world-objects/world-object';
import { useFrame, useMode, canDrag, useRuntime } from '../Atlas';

export const DraggableWorldItem: React.FC<{ id?: string; x?: number; y?: number; width: number; height: number }> = ({
  x,
  y,
  width,
  height,
  children,
}) => {
  const [mode] = useMode();
  const worldObject = useRef<WorldObject>();
  const [position, setPosition] = useState({ x: x || 0, y: y || 0 });
  const delta = useRef({ x: 0, y: 0 });
  const start = useRef({ x: 0, y: 0 });
  const runtime = useRuntime();
  const isDragging = useRef(false);

  useFrame(() => {
    const obj = worldObject.current;
    if (obj && isDragging.current && canDrag(mode)) {
      runtime.pendingUpdate = true;
      const newX = position.x + delta.current.x; // need to do a scale
      const newY = position.y + delta.current.y; // need to do a scale

      obj.points[3] = newX + (obj.points[3] - obj.points[1]);
      obj.points[4] = newY + (obj.points[4] - obj.points[2]);
      obj.points[1] = newX; // need to do a scale
      obj.points[2] = newY; // need to do a scale
    }
  }, [position]);

  return (
    <worldObject
      ref={worldObject}
      onDragStart={(e: any) => {
        if (canDrag(mode)) {
          e.stopPropagation();
          isDragging.current = true;
          start.current.x = e.atlas.x;
          start.current.y = e.atlas.y;
          // @todo mark world item to prevent react updating
        }
      }}
      onDragEnd={(e: any) => {
        if (canDrag(mode)) {
          e.stopPropagation();
          isDragging.current = false;
          const ax = e.atlas.x - start.current.x;
          const ay = e.atlas.y - start.current.y;
          delta.current.x = 0;
          delta.current.y = 0;
          // Add the delta
          setPosition(pos => ({
            x: pos.x + ax,
            y: pos.y + ay,
          }));
          start.current.x = 0;
          start.current.y = 0;
          // @todo un-mark world item and potentially apply react updates
        }
      }}
      onDrag={(e: any) => {
        if (canDrag(mode)) {
          e.stopPropagation();
          delta.current.x = e.atlas.x - start.current.x;
          delta.current.y = e.atlas.y - start.current.y;
        }
      }}
      x={position.x}
      y={position.y}
      height={height}
      width={width}
    >
      {children}
    </worldObject>
  );
};
