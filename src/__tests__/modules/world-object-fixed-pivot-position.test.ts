import { WorldObject } from '../../world-objects/world-object';
import { CanvasRenderer } from '../../modules/canvas-renderer/canvas-renderer';

// Same minimal 2D affine-matrix mock of CanvasRenderingContext2D used in
// canvas-renderer-rotation.test.ts, tracking only the ops applyTransform() calls.
function createMatrixCtx() {
  let m = [1, 0, 0, 1, 0, 0];
  const multiply = (m1: number[], m2: number[]) => [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
  return {
    save: () => {},
    restore: () => {},
    translate(x: number, y: number) {
      m = multiply(m, [1, 0, 0, 1, x, y]);
    },
    rotate(angle: number) {
      m = multiply(m, [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]);
    },
    apply(x: number, y: number): [number, number] {
      return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    },
  };
}

// Renders `owner`'s current center through the real CanvasRenderer.applyTransform,
// using `pivot` (screen-space, matching what Runtime would pass as cx/cy).
function renderedCenter(owner: WorldObject, pivot: { x: number; y: number } | undefined) {
  const renderer = Object.create(CanvasRenderer.prototype) as CanvasRenderer;
  const ctx = createMatrixCtx();
  (renderer as any).ctx = ctx;
  const paint = { __owner: { value: owner } } as any;

  // Assume world-space === screen-space here (scaleFactor 1, no pan) so the
  // test isolates the rotation/positioning math from viewer<->world conversion.
  renderer.applyTransform(paint, owner.x, owner.y, owner.width, owner.height, pivot?.x as any, pivot?.y as any);

  const rawCenterX = owner.x + owner.width / 2;
  const rawCenterY = owner.y + owner.height / 2;
  const [x, y] = ctx.apply(rawCenterX, rawCenterY);
  return { x, y };
}

describe('WorldObject position under a fixed (viewport-center) rotation pivot', () => {
  test('rotation still sweeps the object around the fixed pivot when x/y are unchanged', () => {
    // This is the core "rotate from viewport center" feature: as rotation
    // angle changes alone, the object's rendered center must move along an
    // arc around the pivot, not stay fixed in place.
    const pivot = { x: 400, y: 300 };
    const owner = WorldObject.createWithProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 0 });
    owner.rotationPivot = pivot;
    owner.applyProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 0 });

    const at0 = renderedCenter(owner, pivot);

    owner.applyProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 90 });
    const at90 = renderedCenter(owner, pivot);

    // The center must have actually moved (swept around the pivot) -- this
    // is the opposite of what a naive "always cancel rotation" fix would do.
    const moved = Math.abs(at90.x - at0.x) > 1 || Math.abs(at90.y - at0.y) > 1;
    expect(moved).toBe(true);
  });

  test('at 90deg, changing x moves the rendered position horizontally, not vertically', () => {
    const pivot = { x: 400, y: 300 };
    const owner = WorldObject.createWithProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 90 });
    owner.rotationPivot = pivot;
    owner.applyProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 90 });

    const before = renderedCenter(owner, pivot);

    owner.applyProps({ id: 'a', x: 110, y: 80, width: 60, height: 40, rotation: 90 });
    const after = renderedCenter(owner, pivot);

    expect(after.x - before.x).toBeCloseTo(10);
    expect(Math.abs(after.y - before.y)).toBeLessThan(0.01);
  });

  test('at 90deg, changing y moves the rendered position vertically, not horizontally', () => {
    const pivot = { x: 400, y: 300 };
    const owner = WorldObject.createWithProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 90 });
    owner.rotationPivot = pivot;
    owner.applyProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 90 });

    const before = renderedCenter(owner, pivot);

    owner.applyProps({ id: 'a', x: 100, y: 90, width: 60, height: 40, rotation: 90 });
    const after = renderedCenter(owner, pivot);

    expect(Math.abs(after.x - before.x)).toBeLessThan(0.01);
    expect(after.y - before.y).toBeCloseTo(10);
  });

  test('without a rotation pivot (own-center mode), x already moves horizontally at any angle', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 90 });
    // rotationPivot left undefined -- own-center mode, unaffected by this change.

    const beforeRaw = { x: owner.x, y: owner.y };
    const before = renderedCenter(owner, undefined);

    owner.applyProps({ id: 'a', x: 110, y: 80, width: 60, height: 40, rotation: 90 });
    const after = renderedCenter(owner, undefined);

    expect(after.x - before.x).toBeCloseTo(10);
    expect(Math.abs(after.y - before.y)).toBeLessThan(0.01);
  });

  test('repeated identical re-renders (unrelated prop changes) do not drift the position', () => {
    const pivot = { x: 400, y: 300 };
    const owner = WorldObject.createWithProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 45 });
    owner.rotationPivot = pivot;
    owner.applyProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 45 });

    const first = renderedCenter(owner, pivot);

    // Re-render several times with the exact same x/y/rotation, as would
    // happen from unrelated state changes elsewhere in the component tree.
    for (let i = 0; i < 5; i++) {
      owner.applyProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 45 });
    }

    const after = renderedCenter(owner, pivot);
    expect(after.x).toBeCloseTo(first.x);
    expect(after.y).toBeCloseTo(first.y);
  });

  // Regression test for a real bug: the screen-aligned delta un-rotation
  // above used to read this.rotation -- the angle from *before* this call --
  // even though this.rotation isn't reassigned to props.rotation until
  // afterward. A call that changes rotation and x/y together therefore
  // un-rotated the position delta by the wrong (stale) angle.
  //
  // Verified by an equivalence that must hold regardless of how the edit is
  // split: rotating first and then moving (two separate applyProps calls,
  // each changing only one thing) must land at the same rendered position
  // as changing both in a single combined call -- there's nothing about a
  // single edit event that should make the math order-dependent. The stale
  // angle breaks exactly this equivalence, since the single-call path ends
  // up un-rotating by the pre-edit angle while the two-call path always
  // un-rotates by whatever angle is already current at the time of the
  // (now angle-only) position-changing call.
  test('changing rotation and x together in one call lands at the same position as doing it in two', () => {
    const pivot = { x: 400, y: 300 };

    const twoStep = WorldObject.createWithProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 0 });
    twoStep.rotationPivot = pivot;
    twoStep.applyProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 0 });
    twoStep.applyProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 90 });
    twoStep.applyProps({ id: 'a', x: 110, y: 80, width: 60, height: 40, rotation: 90 });
    const twoStepCenter = renderedCenter(twoStep, pivot);

    const oneStep = WorldObject.createWithProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 0 });
    oneStep.rotationPivot = pivot;
    oneStep.applyProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 0 });
    oneStep.applyProps({ id: 'a', x: 110, y: 80, width: 60, height: 40, rotation: 90 });
    const oneStepCenter = renderedCenter(oneStep, pivot);

    expect(oneStepCenter.x).toBeCloseTo(twoStepCenter.x);
    expect(oneStepCenter.y).toBeCloseTo(twoStepCenter.y);
  });
});

describe('WorldObject#applyPivotCompensationOffset keeps screen-aligned editing in sync', () => {
  // Regression coverage for a real reported bug: Runtime calls
  // applyPivotCompensationOffset() directly (bypassing applyProps()) both
  // when toggling own-center/viewport-center mode and when a drag gesture
  // ends (see Runtime#endInteraction). WorldObject#applyProps's
  // screen-aligned-edit logic tracks its own lastAppliedX/Y snapshot to
  // compute deltas on the *next* prop change -- if that snapshot isn't kept
  // in sync with the direct offset, the next unrelated edit (rotation,
  // tx, or ty) sees a spurious delta equal to the compensation that was
  // already applied, and re-applies it a second time, rotated.

  test('a compensation offset does not reappear as a spurious jump on the next unrelated edit', () => {
    const pivot = { x: 400, y: 300 };
    const owner = WorldObject.createWithProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 90 });
    owner.rotationPivot = pivot;
    owner.applyProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 90 });

    // Simulates Runtime nudging the object's position directly, as
    // endInteraction()/compensateRotationPivotChange() do -- not via applyProps.
    owner.applyPivotCompensationOffset(25, -15);

    const beforeUnrelatedEdit = { x: owner.x, y: owner.y };

    // An unrelated edit: only rotation changes, x/y props are identical to
    // last time. If lastAppliedX/Y fell out of sync with the compensation
    // above, this would incorrectly see a deltaX/Y of (25,-15) and shift
    // the object again.
    owner.applyProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 95 });

    expect(owner.x).toBeCloseTo(beforeUnrelatedEdit.x);
    expect(owner.y).toBeCloseTo(beforeUnrelatedEdit.y);
  });

  test('a compensation offset does not reappear as a spurious jump on the next tx/ty edit', () => {
    const pivot = { x: 400, y: 300 };
    const owner = WorldObject.createWithProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 90 });
    owner.rotationPivot = pivot;
    owner.applyProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 90 });

    owner.applyPivotCompensationOffset(25, -15);

    // A genuine tx edit of +10 (screen-space, since rotationPivot is set) on
    // top of the already-compensated position. At 90deg this should read as
    // a purely vertical raw-position change (matching the existing "moving
    // x moves vertically at 90deg" behavior), not include any leftover
    // delta from the compensation.
    const before = { x: owner.x, y: owner.y };
    owner.applyProps({ id: 'a', x: 110, y: 80, width: 60, height: 40, rotation: 90 });

    expect(Math.abs(owner.x - before.x)).toBeLessThan(0.01);
    expect(Math.abs(owner.y - before.y)).toBeCloseTo(10);
  });

  test('applyPivotCompensationOffset before any applyProps call does not throw and just translates', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 100, y: 80, width: 60, height: 40, rotation: 0 });
    // Bypass the constructor's own applyProps call by constructing a fresh,
    // never-applyProps'd instance directly (createWithProps always calls it
    // once) -- this covers a WorldObject compensated before its first real
    // prop application, e.g. very early in a mount sequence.
    const fresh = new (WorldObject as any)();
    fresh.points = owner.points.slice();
    fresh.rotation = 0;

    expect(() => fresh.applyPivotCompensationOffset(5, 5)).not.toThrow();
  });
});
