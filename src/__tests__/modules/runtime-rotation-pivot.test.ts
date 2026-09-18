import { Runtime } from '../../renderer/runtime';

type FakeOwner = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  translate(dx: number, dy: number): void;
  applyPivotCompensationOffset(dx: number, dy: number): void;
};

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
    applyPivotCompensationOffset(dx: number, dy: number) {
      this.translate(dx, dy);
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
  // Simulates a runtime that has already synced this prop once (matching a
  // real component past its first mount), so these tests exercise genuine
  // subsequent toggles -- not the special-cased first-ever sync, which
  // intentionally skips compensation (see the setter in runtime.ts).
  runtime.hasSyncedRotateFromWorldCenter = true;
  runtime.world = { getObjects: () => [owner] };
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
  runtime.viewerToWorld = (x: number, y: number) => ({ x: x / 2, y: y / 2 });
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

  // AtlasAuto syncs rotateFromWorldCenter via a useEffect that always fires
  // on mount (Atlas.tsx), so a component that starts with
  // rotateFromWorldCenter={true} still calls this setter once with a
  // false->true transition, purely because Runtime's own field defaults to
  // false -- not because the user toggled anything. There's no
  // previously-rendered own-center appearance to preserve in that case, so
  // compensating would corrupt the initial position instead of protecting
  // it (this was the root cause of a real reported bug: an object whose
  // rotateFromWorldCenter starts true failed to render at all, because the
  // spurious compensation pushed it far enough that the visibility check
  // no longer overlapped its own bounds).
  test('does not compensate on the very first sync (component mounting with rotateFromWorldCenter already true)', () => {
    const owner = makeOwner(100, 80, 60, 40, 30);
    const runtime = makeRuntime(owner);
    // Override the "already synced" simulation from makeRuntime -- this
    // test specifically wants the fresh-mount (never synced) state.
    (runtime as any).hasSyncedRotateFromWorldCenter = false;

    runtime.rotateFromWorldCenter = true;

    expect(owner.x).toBe(100);
    expect(owner.y).toBe(80);

    // A genuine later toggle (off, matching a real user action) should
    // still compensate normally.
    runtime.rotateFromWorldCenter = false;
    expect(owner.x).not.toBeCloseTo(100);
  });

  // A story that starts with rotateFromWorldCenter={false} matches this
  // class's own default, so AtlasAuto's initial sync effect calls this
  // setter with a value equal to the current one -- the early-return branch
  // above. That must still count as "synced": otherwise the user's first
  // *real* toggle (false->true) would be misidentified as the special-cased
  // initial sync and incorrectly skip compensation, producing a real,
  // uncompensated jump on the very first click.
  test('a no-op initial sync still counts as synced, so the first real toggle after it compensates', () => {
    const owner = makeOwner(100, 80, 60, 40, 30);
    const runtime = makeRuntime(owner);
    (runtime as any).hasSyncedRotateFromWorldCenter = false;

    // Simulates AtlasAuto's mount-time effect syncing the starting prop
    // value (false), which matches Runtime's own default -- a no-op.
    runtime.rotateFromWorldCenter = false;
    expect((runtime as any).hasSyncedRotateFromWorldCenter).toBe(true);
    expect(owner.x).toBe(100);

    // The user's first real toggle should compensate normally, not be
    // skipped as if it were the initial sync.
    runtime.rotateFromWorldCenter = true;
    expect(owner.x).not.toBeCloseTo(100);
  });
});
