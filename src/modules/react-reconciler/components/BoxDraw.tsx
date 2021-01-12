import React, { useEffect, useRef, useState } from 'react';
import { useAfterFrame } from '../hooks/use-after-frame';
import { useFrame } from '../hooks/use-frame';
import { useCanvas } from '../hooks/use-canvas';
import { useAtlas } from '../hooks/use-atlas';
import { useRuntime } from '../hooks/use-runtime';
import { useMode } from '../hooks/use-mode';
import { Runtime } from '../../../renderer/runtime';

class BoxDrawPlugin {
  runtime: Runtime;

  state: {
    mousePosition: { x: number; y: number };
    firstCorner: { x: number; y: number } | undefined;
    secondCorner: { x: number; y: number } | undefined;
  } = {
    mousePosition: { x: 0, y: 0 },
    firstCorner: undefined,
    secondCorner: undefined,
  };

  drawFunction: (box: { x: number; y: number; width: number; height: number }) => void;

  constructor(runtime: Runtime, drawFunction: (box: { x: number; y: number; width: number; height: number }) => void) {
    this.runtime = runtime;
    this.drawFunction = drawFunction;
  }

  onFrame() {
    if (this.state.firstCorner && !this.state.secondCorner) {
      this.runtime.pendingUpdate = true;
    }
  }

  onMouseUp = () => {
    // On mouse up
  };

  onMouseDown = () => {
    // On mouse down
  };

  onMouseMove = () => {
    // On mouse move.
  };

  events = {
    onMouseUp: this.onMouseUp,
    onMouseDown: this.onMouseDown,
    onMouseMove: this.onMouseMove,
  };

  onAfterFrame() {
    const { firstCorner, secondCorner, mousePosition } = this.state;
    if (firstCorner) {
      const { x, y, width, height } = this.runtime.worldToViewer(
        firstCorner.x,
        firstCorner.y,
        (secondCorner ? secondCorner.x : mousePosition.x) - firstCorner.x,
        (secondCorner ? secondCorner.y : mousePosition.y) - firstCorner.y
      );
      this.drawFunction({ x, y, width, height });
    }
  }

  // Move to plugin consumer.
  activate() {
    const events = Object.keys(this.events);
    for (const event of events) {
      this.runtime.world.addEventListener(event as any, (this.events as any)[event as any] as any);
    }
  }

  // Move to plugin consumer.
  close() {
    const events = Object.keys(this.events);
    for (const event of events) {
      this.runtime.world.removeEventListener(event as any, (this.events as any)[event as any] as any);
    }
  }
}

export const DrawBox: React.FC<{
  onCreate: (bounds: { x: number; y: number; width: number; height: number }) => void;
}> = ({ onCreate }) => {
  const mousePosition = useRef({ x: 0, y: 0 });
  const canvas = useCanvas();
  const runtime = useRuntime();
  const atlas = useAtlas() as any;
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
      if (atlas.canvasPosition && runtime) {
        const { x, y } = runtime.viewerToWorld(
          e.clientX - atlas.canvasPosition.left,
          e.clientY - atlas.canvasPosition.top
        );
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
  }, [atlas.canvasPosition, canvas, runtime]);

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
