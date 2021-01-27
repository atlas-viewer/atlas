import { Runtime } from '../../renderer/runtime';

/**
 * Box draw plugin.
 *
 * This is a work in progress. This would replace the react specific and hold the state for driving that component. It
 * would allow other implementations to pick up and use the box-drawing capabilities.
 */
export class BoxDrawPlugin {
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
