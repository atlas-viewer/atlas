import { Runtime } from '../../renderer/runtime';

type FakeOwner = { x: number; y: number; width: number; height: number; rotation: number; translate(dx: number, dy: number): void };

function makeOwner(x: number, y: number, width: number, height: number, rotation: number): FakeOwner {
  return {
    x,
    y,
    width,
    height,
    rotation,
    translate(dx: number, dy: number) {
      this.x += dx;
      this.y += dy;
    },
  };
}

// Minimal Runtime stand-in exposing just what compensateRotationPivotChange() touches,
// with a world<->viewer mapping of "screen = world * 2" (scaleFactor 2, no pan offset).
function makeRuntime(owner: FakeOwner): Runtime {
  const runtime = Object.create(Runtime.prototype) as any;
  runtime.viewport = { x: 0, y: 0, width: 1000, height: 800, top: 0, left: 0 };
  runtime.viewportCenterPoint = { x: 500, y: 400 };
  runtime._rotateFromWorldCenter = false;
  runtime.world = { layers: [owner] };
  runtime.getRendererScreenPosition = () => runtime.viewport;
  runtime.updateViewportCenterPoint = () => {
    runtime.viewportCenterPoint = { x: runtime.viewport.width / 2, y: runtime.viewport.height / 2 };
  };
  runtime.getScaleFactor = () => 2;
  runtime.worldToViewer = (x: number, y: number, width: number, height: number) => ({
    x: x * 2,
    y: y * 2,
    width: width * 2,
    height: height * 2,
  });
  return runtime as Runtime;
}

// Mirrors CanvasRenderer.applyTransform's rotation math: rotate the box's raw
// (unrotated) screen center around `pivot` by `angleDeg`.
function renderedCenter(rawCenter: { x: number; y: number }, pivot: { x: number; y: number }, angleDeg: number) {
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = rawCenter.x - pivot.x;
  const dy = rawCenter.y - pivot.y;
  return { x: pivot.x + (dx * cos - dy * sin), y: pivot.y + (dx * sin + dy * cos) };
}

function rawScreenCenter(runtime: Runtime, owner: FakeOwner) {
  const box = runtime.worldToViewer(owner.x, owner.y, owner.width, owner.height);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

describe('Runtime rotation pivot compensation', () => {
  test('toggling to viewport-center pivot renders the box in the same place', () => {
    const owner = makeOwner(100, 80, 60, 40, 30);
    const runtime = makeRuntime(owner);

    // Before: rotateFromWorldCenter is false, so the box rotates around its own center.
    const beforeRaw = rawScreenCenter(runtime, owner);
    const beforeRendered = renderedCenter(beforeRaw, beforeRaw, owner.rotation);

    runtime.rotateFromWorldCenter = true;

    // After: it now rotates around the viewport center, but should land in the same spot.
    const afterRaw = rawScreenCenter(runtime, owner);
    const afterRendered = renderedCenter(afterRaw, (runtime as any).viewportCenterPoint, owner.rotation);

    expect(afterRendered.x).toBeCloseTo(beforeRendered.x);
    expect(afterRendered.y).toBeCloseTo(beforeRendered.y);
    // And it actually had to move to achieve that (sanity check the compensation did something).
    expect(owner.x).not.toBeCloseTo(100);
  });

  test('round trip (on then off) returns the object to its original position', () => {
    const owner = makeOwner(100, 80, 60, 40, 45);
    const runtime = makeRuntime(owner);

    runtime.rotateFromWorldCenter = true;
    runtime.rotateFromWorldCenter = false;

    expect(owner.x).toBeCloseTo(100);
    expect(owner.y).toBeCloseTo(80);
  });

  test('does nothing when the object has no rotation', () => {
    const owner = makeOwner(100, 80, 60, 40, 0);
    const runtime = makeRuntime(owner);

    runtime.rotateFromWorldCenter = true;

    expect(owner.x).toBe(100);
    expect(owner.y).toBe(80);
  });

  test('setting the same value is a no-op', () => {
    const owner = makeOwner(100, 80, 60, 40, 30);
    const runtime = makeRuntime(owner);

    runtime.rotateFromWorldCenter = false; // already false

    expect(owner.x).toBe(100);
    expect(owner.y).toBe(80);
  });
});
