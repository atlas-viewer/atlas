/** @vitest-environment happy-dom */

import { Runtime } from '../../renderer/runtime';
import { World } from '../../world';
import { Renderer } from '../../renderer/renderer';
import { Strand } from '@atlas-viewer/dna';
import { Paint } from '../../world-objects/paint';
import { PositionPair } from '../../types';
import { SpacialContent } from '../../spacial-content/spacial-content';
import { WorldObject } from '../../world-objects/world-object';
import { SingleImage } from '../../spacial-content/single-image';

class MockRenderer implements Renderer {
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
  reset(): void {}
  getRendererScreenPosition() {
    return { x: 0, y: 0, top: 0, left: 0, width: 100, height: 100 };
  }
}

describe('Runtime debug subscribers', () => {
  test('emits frame and paint events', () => {
    const world = new World(100, 100);
    const worldObject = new WorldObject();
    worldObject.applyProps({ id: 'world-object-1', width: 100, height: 100 });

    const image = new SingleImage();
    image.applyProps({
      uri: 'https://example.com/image.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
    } as any);

    worldObject.appendChild(image as unknown as SpacialContent);
    world.appendChild(worldObject);

    const runtime = new Runtime(new MockRenderer(), world, {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      scale: 1,
    });

    const events: any[] = [];
    const unsubscribe = runtime.addDebugSubscriber((event) => {
      events.push(event);
    });

    runtime.updateNextFrame();
    runtime.render(performance.now() + 16);

    expect(events.some((event) => event.type === 'frame-start')).toBe(true);
    expect(events.some((event) => event.type === 'paint')).toBe(true);
    expect(events.some((event) => event.type === 'frame-end')).toBe(true);

    unsubscribe();
    runtime.stop();
  });
});
