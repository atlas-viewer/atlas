/** @vitest-environment happy-dom */

import { Runtime } from '../../../renderer/runtime';
import { World } from '../../../world';
import { Renderer } from '../../../renderer/renderer';
import { PositionPair } from '../../../types';
import { Strand } from '@atlas-viewer/dna';
import { Paint } from '../../../world-objects/paint';
import { WorldObject } from '../../../world-objects/world-object';
import { SingleImage } from '../../../spacial-content/single-image';
import { resetImageLoadingState } from '../../../modules/react-reconciler/devtools/actions';

class MockCanvasLikeRenderer implements Renderer {
  loadingQueue: any[] = [{ id: 'queued' }];
  drawCalls: Array<() => void> = [() => undefined];
  invalidated: string[] = ['stale'];
  imageIdsLoaded: string[] = ['tile-a'];
  imagesPending = 2;
  imagesLoaded = 1;
  tasksRunning = 1;
  pendingDrawCall = true;
  loadingQueueOrdered = false;

  beforeFrame(): void {}
  paint(): void {}
  afterFrame(): void {}
  getScale(): number {
    return 1;
  }
  prepareLayer(): void {}
  finishLayer(): void {}
  afterPaintLayer(): void {}
  pendingUpdate(): boolean {
    return false;
  }
  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    return world.getPointsAt(target, aggregate, scaleFactor);
  }
  getViewportBounds(): PositionPair | null {
    return null;
  }
  isReady(): boolean {
    return true;
  }
  resize(): void {}
  reset(): void {
    this.loadingQueue = [];
    this.drawCalls = [];
  }
  getRendererScreenPosition() {
    return { x: 0, y: 0, top: 0, left: 0, width: 100, height: 100 };
  }
}

describe('DevTools actions', () => {
  test('resetImageLoadingState clears host/loading state and schedules a frame', () => {
    const world = new World(100, 100);
    const worldObject = new WorldObject();
    worldObject.applyProps({ id: 'object', width: 100, height: 100 });

    const image = new SingleImage();
    image.applyProps({
      uri: 'https://example.com/a.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
    } as any);

    image.__host = {
      canvas: {
        canvas: undefined,
        canvases: ['a'],
        indices: [0],
        loaded: [],
        loading: true,
      },
    };

    worldObject.appendChild(image as any);
    world.appendChild(worldObject);

    const runtime = new Runtime(new MockCanvasLikeRenderer(), world, {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      scale: 1,
    });

    runtime.pendingUpdate = false;

    const result = resetImageLoadingState(runtime);

    expect(result.imageHostsReset).toBeGreaterThan(0);
    expect(result.renderersReset).toBeGreaterThan(0);
    expect(image.__host.canvas.indices).toEqual([]);
    expect(image.__host.canvas.loading).toBe(false);
    expect(runtime.pendingUpdate).toBe(true);

    runtime.stop();
  });
});
