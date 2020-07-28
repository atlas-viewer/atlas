import React, { useEffect, useRef, useState } from 'react';
import { useAfterFrame, useAtlas, useCanvas, useFrame, useRuntime } from '../Atlas';

export const DrawBox: React.FC<{
  onCreate: (bounds: { x: number; y: number; width: number; height: number }) => void;
}> = ({ onCreate }) => {
  const mousePosition = useRef({ x: 0, y: 0 });
  const canvas = useCanvas();
  const runtime = useRuntime();
  const atlas = useAtlas() as any;
  const [firstCorner, setFirstCorner] = useState<{ x: number; y: number } | undefined>();
  const [secondCorner, setSecondCorner] = useState<{ x: number; y: number } | undefined>();

  useFrame(() => {
    if (firstCorner && !secondCorner) {
      runtime.pendingUpdate = true;
    }
  }, [firstCorner, secondCorner]);

  useAfterFrame(() => {
    if (firstCorner) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const { x, y, width, height } = runtime.worldToViewer(
          firstCorner.x,
          firstCorner.y,
          (secondCorner ? secondCorner.x : mousePosition.current.x) - firstCorner.x,
          (secondCorner ? secondCorner.y : mousePosition.current.y) - firstCorner.y
        );

        ctx.lineWidth = secondCorner ? 3 : 1;
        ctx.strokeStyle = '#fff';
        ctx.strokeRect(x, y, width, height);

        ctx.lineWidth = secondCorner ? 3 : 1;
        ctx.strokeStyle = '#000';
        ctx.strokeRect(x + 1, y + 1, width - 2, height - 2);
      }
    }
  }, [firstCorner, secondCorner]);

  useEffect(() => {
    const cb = (e: MouseEvent) => {
      if (atlas.canvasPosition) {
        const { x, y } = runtime.viewerToWorld(e.pageX - atlas.canvasPosition.left, e.pageY - atlas.canvasPosition.top);
        mousePosition.current.x = ~~x;
        mousePosition.current.y = ~~y;
      }
    };
    canvas.addEventListener('mousemove', cb);
    return () => canvas.removeEventListener('mousemove', cb);
  }, [atlas.canvasPosition, canvas, runtime]);

  useEffect(() => {
    const cb = (e: MouseEvent) => {
      if (runtime.mode === 'sketch') {
        setFirstCorner({ x: Math.round(mousePosition.current.x), y: Math.round(mousePosition.current.y) });
        setSecondCorner(undefined);
      }
    };
    canvas.addEventListener('mousedown', cb);

    return () => canvas.removeEventListener('mousedown', cb);
  }, [canvas, runtime.mode]);

  useEffect(() => {
    const cb = (e: MouseEvent) => {
      if (firstCorner && !secondCorner) {
        setSecondCorner({ x: Math.round(mousePosition.current.x), y: Math.round(mousePosition.current.y) });
      }
    };
    canvas.addEventListener('mouseup', cb);

    return () => canvas.removeEventListener('mouseup', cb);
  }, [canvas, firstCorner, secondCorner]);

  useEffect(() => {
    if (firstCorner && secondCorner) {
      onCreate({
        x: Math.min(firstCorner.x, secondCorner.x),
        y: Math.min(firstCorner.y, secondCorner.y),
        width: Math.abs(secondCorner.x - firstCorner.x),
        height: Math.abs(secondCorner.y - firstCorner.y),
      });
    }
  }, [firstCorner, onCreate, secondCorner]);

  return null;
};
