import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { useAfterFrame } from '../hooks/use-after-frame';
import { useFrame } from '../hooks/use-frame';
import { useCanvas } from '../hooks/use-canvas';
import { useRuntime } from '../hooks/use-runtime';
import { useMode } from '../hooks/use-mode';
import { useCanvasPosition } from '../hooks/use-canvas-position';

export const DrawBox: React.FC<{
  children?: ReactNode;
  onCreate: (bounds: { x: number; y: number; width: number; height: number }) => void;
}> = ({ onCreate }) => {
  const mousePosition = useRef({ x: 0, y: 0 });
  const canvas = useCanvas();
  const canvasPosition = useCanvasPosition();
  const runtime = useRuntime();
  const [firstCorner, setFirstCorner] = useState<{ x: number; y: number } | undefined>();
  const [secondCorner, setSecondCorner] = useState<{ x: number; y: number } | undefined>();
  const mode = useMode();

  useFrame(() => {
    if (runtime && firstCorner && !secondCorner) {
      runtime.pendingUpdate = true;
    }
  }, [firstCorner, secondCorner]);

  useAfterFrame(() => {
    if (firstCorner && canvas && runtime) {
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
      if (canvasPosition && runtime) {
        const { x, y } = runtime.viewerToWorld(e.clientX - canvasPosition.left, e.clientY - canvasPosition.top);
        mousePosition.current.x = ~~x;
        mousePosition.current.y = ~~y;
      }
    };
    if (canvas) {
      canvas.addEventListener('mousemove', cb);
      return () => canvas.removeEventListener('mousemove', cb);
    }
    return () => {
      // no-op
    };
  }, [canvasPosition, canvas, runtime]);

  useEffect(() => {
    const cb = (e: MouseEvent) => {
      if (mode === 'sketch') {
        setFirstCorner({ x: Math.round(mousePosition.current.x), y: Math.round(mousePosition.current.y) });
        setSecondCorner(undefined);
      }
    };
    if (canvas) {
      canvas.addEventListener('mousedown', cb);

      return () => canvas.removeEventListener('mousedown', cb);
    }
    return () => {
      // no-op
    };
  }, [canvas, mode]);

  useEffect(() => {
    const cb = (e: MouseEvent) => {
      if (firstCorner && !secondCorner) {
        setSecondCorner({ x: Math.round(mousePosition.current.x), y: Math.round(mousePosition.current.y) });
      }
    };

    if (canvas) {
      canvas.addEventListener('mouseup', cb);

      return () => canvas.removeEventListener('mouseup', cb);
    }
    return () => {
      // no-op
    };
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
