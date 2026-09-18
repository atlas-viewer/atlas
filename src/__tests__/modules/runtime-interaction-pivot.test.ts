import { Runtime } from '../../renderer/runtime';

type FakeOwner = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scale: number;
  layers?: FakeOwner[];
  translate(dx: number, dy: number): void;
  applyPivotCompensationOffset(dx: number, dy: number): void;
};

function makeOwner(x: number, y: number, width: number, height: number, rotation: number, scale = 1): FakeOwner {
  return {
    x,
    y,
    width,
    height,
    rotation,
    scale,
    translate(dx: number, dy: number) {
      this.x += dx;
      this.y += dy;
    },
    applyPivotCompensationOffset(dx: number, dy: number) {
      this.translate(dx, dy);
    },
  };
}

// Minimal Runtime stand-in exposing just what beginInteraction/endInteraction/
// finalizePivotSwitch/currentWorldPivot touch. `panOffset` simulates panning:
// it shifts the world<->viewer mapping (screen = (world - panOffset) * 2)
// without needing a real `target` Strand, matching what happens to
// viewerToWorld/worldToViewer while the user drags or an out-of-bounds
// snap-back animates.
function makeRuntime(owners: FakeOwner[]) {
  const state = { panOffset: { x: 0, y: 0 } };
  const runtime = Object.create(Runtime.prototype) as any;
  runtime.viewport = { x: 0, y: 0, width: 1000, height: 800, top: 0, left: 0 };
  runtime.viewportCenterPoint = { x: 500, y: 400 };
  runtime._rotateFromWorldCenter = false;
  runtime.isInteracting = false;
  // Object.create(Runtime.prototype) skips class field initializers, so
  // this needs setting explicitly to match the real default.
  runtime.pivotSwitchPending = false;
  runtime.hasSyncedRotateFromWorldCenter = true;
  runtime.world = { getObjects: () => owners };
  runtime.getRendererScreenPosition = () => runtime.viewport;
  runtime.updateViewportCenterPoint = () => {
    runtime.viewportCenterPoint = { x: runtime.viewport.width / 2, y: runtime.viewport.height / 2 };
  };
  runtime.getScaleFactor = () => 2;
  runtime.worldToViewer = (x: number, y: number, width: number, height: number) => ({
    x: (x - state.panOffset.x) * 2,
    y: (y - state.panOffset.y) * 2,
    width: width * 2,
    height: height * 2,
  });
  runtime.viewerToWorld = (x: number, y: number) => ({ x: x / 2 + state.panOffset.x, y: y / 2 + state.panOffset.y });
  return { runtime: runtime as Runtime, state };
}

function renderedCenter(rawCenter: { x: number; y: number }, pivot: { x: number; y: number }, angleDeg: number) {
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = rawCenter.x - pivot.x;
  const dy = rawCenter.y - pivot.y;
  return { x: pivot.x + (dx * cos - dy * sin), y: pivot.y + (dx * sin + dy * cos) };
}

function rawScreenCenter(runtime: Runtime, owner: FakeOwner) {
  const box = (runtime as any).worldToViewer(owner.x, owner.y, owner.width, owner.height);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function renderedCenterOfPivot(rt: any) {
  const world = rt.currentWorldPivot();
  const projected = rt.worldToViewer(world.x, world.y, 0, 0);
  return { x: projected.x, y: projected.y };
}

describe('Runtime interaction-gated rotation pivot', () => {
  test('currentWorldPivot is undefined when rotateFromWorldCenter is off', () => {
    const { runtime } = makeRuntime([]);
    expect((runtime as any).currentWorldPivot()).toBeUndefined();
  });

  test('while idle, the pivot tracks the live viewport center and self-corrects across calls', () => {
    const { runtime, state } = makeRuntime([]);
    runtime.rotateFromWorldCenter = true;

    const first = (runtime as any).currentWorldPivot();
    expect(first).toEqual({ x: 250, y: 200 }); // viewerToWorld(500,400) with panOffset 0

    // Simulate a view change between frames (e.g. settling into home
    // position, or a programmatic pan) -- idle tracking must reflect it
    // immediately, not hold onto the old value.
    state.panOffset = { x: 50, y: 25 };
    const second = (runtime as any).currentWorldPivot();
    expect(second).toEqual({ x: 300, y: 225 });
  });

  test('beginInteraction freezes the pivot; panning during the gesture does not move it', () => {
    const { runtime, state } = makeRuntime([]);
    runtime.rotateFromWorldCenter = true;

    runtime.beginInteraction();
    const captured = (runtime as any).currentWorldPivot();

    // Simulate panning while the gesture is in progress.
    state.panOffset = { x: 200, y: 100 };

    expect((runtime as any).currentWorldPivot()).toEqual(captured);
    expect(runtime.isInteracting).toBe(true);
  });

  // Regression test for a real bug: PopmotionController#onTouchStart calls
  // beginInteraction() on every touchstart, including a second finger
  // touching down while the first finger's gesture is already active (a
  // real touchstart event, since e.atlasTouches now reports 2 touches).
  // Without a re-entry guard, that second call re-captured fixedWorldPivot
  // at whatever the live pivot had drifted to by then -- here simulated by
  // panning between the two beginInteraction() calls -- producing a jump
  // exactly as a one-finger pan transitions into a two-finger pinch/rotate.
  test('beginInteraction is a no-op when a gesture is already in progress -- panning does not sneak into a re-capture', () => {
    const { runtime, state } = makeRuntime([]);
    runtime.rotateFromWorldCenter = true;

    runtime.beginInteraction();
    const frozenAtGestureStart = (runtime as any).fixedWorldPivot;

    // The drag has moved the view by the time a second finger touches down.
    state.panOffset = { x: 200, y: 100 };
    runtime.beginInteraction();

    expect(runtime.isInteracting).toBe(true);
    expect((runtime as any).fixedWorldPivot).toEqual(frozenAtGestureStart);
    expect((runtime as any).currentWorldPivot()).toEqual(frozenAtGestureStart);
  });

  test('endInteraction defers the pivot switch -- the pivot stays frozen (and no object is touched) until finalizePivotSwitch runs', () => {
    const owner = makeOwner(100, 80, 60, 40, 30);
    const { runtime, state } = makeRuntime([owner]);
    runtime.rotateFromWorldCenter = true;

    runtime.beginInteraction();
    // Baseline *after* the rotateFromWorldCenter=true assignment above,
    // which itself compensates the switch out of own-center mode -- not
    // the object's raw construction values.
    const xBeforeEnd = owner.x;
    const yBeforeEnd = owner.y;
    state.panOffset = { x: 200, y: 100 };
    const frozen = (runtime as any).currentWorldPivot();

    runtime.endInteraction();

    // The raw pointer gesture is over...
    expect(runtime.isInteracting).toBe(false);
    // ...but the pivot switch itself hasn't happened yet, and the object is
    // untouched -- render() (via finalizePivotSwitch) does that, not
    // endInteraction() directly. See finalizePivotSwitch's own comment for
    // why it can't happen synchronously here.
    expect((runtime as any).pivotSwitchPending).toBe(true);
    expect((runtime as any).currentWorldPivot()).toEqual(frozen);
    expect(owner.x).toBe(xBeforeEnd);
    expect(owner.y).toBe(yBeforeEnd);

    // Further panning while still pending continues to read through the
    // same frozen pivot, exactly like still being mid-gesture.
    state.panOffset = { x: 350, y: 275 };
    expect((runtime as any).currentWorldPivot()).toEqual(frozen);
  });

  // Regression coverage for a real, reported bug: a quick click landing
  // while a previous gesture's pivot switch is still pending (e.g. it's
  // deferred behind an active inertial pan-momentum glide, see
  // Runtime#panMomentumActive) used to silently discard that pending switch
  // in beginInteraction() -- clearing pivotSwitchPending without ever
  // running the compensation finalizePivotSwitch() would have applied. The
  // object was still actually being rendered around the OLD frozen pivot
  // right up until that click; beginInteraction() then froze a *new* pivot
  // at the live view, so the very next frame rendered it around a different
  // pivot with no compensating position change in between -- a real,
  // visible jump, sideways relative to whatever was panning (a pivot
  // change, not a bounds correction).
  test('a new gesture starting while a previous pivot switch is still pending settles that switch first, instead of dropping it', () => {
    const owner = makeOwner(100, 80, 60, 40, 30);
    const { runtime, state } = makeRuntime([owner]);
    runtime.rotateFromWorldCenter = true;

    // Gesture 1: a fling. Pan happens during it, same as a real drag.
    runtime.beginInteraction();
    state.panOffset = { x: 200, y: 100 };
    runtime.endInteraction();

    // Momentum now carries the view further *after* the gesture ended --
    // finalizePivotSwitch is deferred behind that (panMomentumActive),
    // exactly like being mid-drag: the pivot is still the one frozen at
    // gesture 1's start, not live.
    state.panOffset = { x: 260, y: 140 };
    expect((runtime as any).pivotSwitchPending).toBe(true);

    const pivotBeforeClick = renderedCenterOfPivot(runtime);
    const rawBeforeClick = rawScreenCenter(runtime, owner);
    const renderedBeforeClick = renderedCenter(rawBeforeClick, pivotBeforeClick, owner.rotation);

    // Gesture 2: a quick click interrupts the glide (momentum's own
    // stopPanMomentum() already halted `target`, so no further panning
    // happens here) while gesture 1's switch is still pending.
    runtime.beginInteraction();

    const pivotAfterClick = renderedCenterOfPivot(runtime);
    const rawAfterClick = rawScreenCenter(runtime, owner);
    const renderedAfterClick = renderedCenter(rawAfterClick, pivotAfterClick, owner.rotation);

    // The object's on-screen position must be continuous across the switch
    // -- not jump just because a new gesture happened to start while the
    // old one's switch was still pending.
    expect(renderedAfterClick.x).toBeCloseTo(renderedBeforeClick.x);
    expect(renderedAfterClick.y).toBeCloseTo(renderedBeforeClick.y);

    // The new gesture's own freeze took effect (pending switch was settled,
    // not left dangling).
    expect((runtime as any).pivotSwitchPending).toBe(false);
    expect(runtime.isInteracting).toBe(true);
  });

  test('finalizePivotSwitch compensates rotated objects so their rendered position does not jump, then resumes live tracking', () => {
    const owner = makeOwner(100, 80, 60, 40, 30);
    const { runtime, state } = makeRuntime([owner]);
    runtime.rotateFromWorldCenter = true;

    runtime.beginInteraction();

    // Pan during the gesture, same as a real drag.
    state.panOffset = { x: 200, y: 100 };

    // Snapshot immediately before finalizing: the frozen pivot has drifted
    // from the live center by now (the whole point of freezing it), so this
    // is genuinely a different pivot than what's used a moment later.
    const pivotBeforeEnd = renderedCenterOfPivot(runtime);
    const beforeRaw = rawScreenCenter(runtime, owner);
    const beforeRendered = renderedCenter(beforeRaw, pivotBeforeEnd, owner.rotation);

    runtime.endInteraction();
    (runtime as any).finalizePivotSwitch();

    // Snapshot immediately after, at the *same* (already-panned) view --
    // only the pivot mode changed (frozen -> live), which is exactly what
    // the compensation must cancel out.
    const pivotAfterEnd = renderedCenterOfPivot(runtime);
    const afterRaw = rawScreenCenter(runtime, owner);
    const afterRendered = renderedCenter(afterRaw, pivotAfterEnd, owner.rotation);

    expect(afterRendered.x).toBeCloseTo(beforeRendered.x);
    expect(afterRendered.y).toBeCloseTo(beforeRendered.y);

    expect((runtime as any).pivotSwitchPending).toBe(false);
    // Tracking resumed live: a further pan now moves the pivot again.
    const liveBefore = (runtime as any).currentWorldPivot();
    state.panOffset = { x: 300, y: 300 };
    expect((runtime as any).currentWorldPivot()).not.toEqual(liveBefore);
  });

  // Regression coverage for a real, reported bug: a rotated WorldObject
  // nested inside another rotated WorldObject got compensated twice.
  // syncRotationPivotPosition's tree-walk computed the absX/absY it hands
  // to a node's children *before* that node's own
  // applyPivotCompensationOffset call had run -- so a rotated child's own
  // compensation math anchored itself to the parent's stale,
  // pre-compensation position instead of the parent's actual (just-shifted)
  // one. Confirmed live against stories/rotation.stories.tsx's
  // CropImageBroken (rotation set on both the <world-object> and the
  // <ImageService> it wraps, with rotateFromWorldCenter on): dragging
  // moved the image away from the box sitting right next to it, because
  // only the image's branch carried a second, independently-rotated
  // wrapper node to double-compensate -- the box, with no rotation of its
  // own, only ever inherited the outer object's single (correct) shift.
  test('a rotated node nested inside another rotated node at the same position and angle needs no compensation of its own', () => {
    const inner = makeOwner(0, 0, 60, 40, 87);
    const outer = makeOwner(2000, 2000, 60, 40, 87);
    outer.layers = [inner];
    const { runtime, state } = makeRuntime([outer]);
    runtime.rotateFromWorldCenter = true;

    runtime.beginInteraction();
    state.panOffset = { x: 200, y: 100 };
    runtime.endInteraction();
    (runtime as any).finalizePivotSwitch();

    // outer received a real, non-trivial compensation (this scenario does
    // exercise the mechanism -- a no-op here would make the rest of this
    // test vacuous).
    expect(outer.x).not.toBe(2000);
    expect(outer.y).not.toBe(2000);

    // inner sits at outer's exact position (offset 0,0) and shares its
    // exact rotation angle, so it is -- geometrically -- the same point
    // undergoing the same rotation as outer's own reference point: outer's
    // shift, inherited through ordinary translation, already keeps inner's
    // rendered position fixed with nothing left for inner's own
    // compensation to do. Before the fix this came out non-zero (an exact
    // duplicate of outer's own shift, once expressed in the same units).
    expect(inner.x).toBeCloseTo(0);
    expect(inner.y).toBeCloseTo(0);
  });

  // The general case behind the test above: a nested rotated node offset
  // from its rotated ancestor, and rotated by a different angle, still
  // needs its own, genuinely non-zero compensation -- the fix must not
  // regress into "never compensate a nested rotated node," only into
  // "compensate it correctly." Verified independently of
  // syncRotationPivotPosition's own math: a node's rendered position
  // (raw position rotated around whatever pivot is in effect, by its own
  // angle) must be the same before and after the pivot switch, for *both*
  // outer and inner, computed by literally re-deriving "rendered position"
  // from first principles rather than re-running the code under test.
  test('a nested rotated node offset from, and at a different angle than, its rotated ancestor still lands correctly', () => {
    const inner = makeOwner(40, 25, 60, 40, 45);
    const outer = makeOwner(500, 300, 60, 40, 87);
    outer.layers = [inner];
    const { runtime, state } = makeRuntime([outer]);
    runtime.rotateFromWorldCenter = true;

    const nestedRawScreenCenter = () => {
      const absX = outer.x + inner.x * outer.scale;
      const absY = outer.y + inner.y * outer.scale;
      const box = (runtime as any).worldToViewer(absX, absY, inner.width * outer.scale, inner.height * outer.scale);
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    };

    runtime.beginInteraction();

    // Pan during the gesture, same as a real drag -- captured *before* the
    // "before" snapshot below (matching the established pattern in
    // "finalizePivotSwitch compensates rotated objects..." above), so both
    // snapshots read through the same panOffset and only the pivot mode
    // (frozen -> live) differs between them. Capturing "before" ahead of
    // the pan would conflate the pan's own (correct, expected) effect on
    // rendered position with whatever the pivot switch itself changes.
    state.panOffset = { x: 200, y: 100 };

    const pivotBeforeEnd = renderedCenterOfPivot(runtime);
    const outerBeforeRendered = renderedCenter(rawScreenCenter(runtime, outer), pivotBeforeEnd, outer.rotation);
    const innerBeforeRendered = renderedCenter(nestedRawScreenCenter(), pivotBeforeEnd, inner.rotation);

    runtime.endInteraction();
    (runtime as any).finalizePivotSwitch();

    const pivotAfterEnd = renderedCenterOfPivot(runtime);
    const outerAfterRendered = renderedCenter(rawScreenCenter(runtime, outer), pivotAfterEnd, outer.rotation);
    const innerAfterRendered = renderedCenter(nestedRawScreenCenter(), pivotAfterEnd, inner.rotation);

    expect(outerAfterRendered.x).toBeCloseTo(outerBeforeRendered.x);
    expect(outerAfterRendered.y).toBeCloseTo(outerBeforeRendered.y);
    expect(innerAfterRendered.x).toBeCloseTo(innerBeforeRendered.x);
    expect(innerAfterRendered.y).toBeCloseTo(innerBeforeRendered.y);

    // Sanity: inner really did need its own, non-zero correction here --
    // unlike the coincidental same-position/same-angle case above, this
    // scenario doesn't let outer's shift alone cover it.
    expect(Math.abs(inner.x - 40) + Math.abs(inner.y - 25)).toBeGreaterThan(0.01);
  });

  // Regression coverage for a real test-coverage gap: every fixture in this
  // suite used the default scale of 1, even though
  // Runtime#updateWorldObjectRotationPivots/#syncRotationPivotPosition
  // accumulate parentScale * owner.scale down the tree and divide the
  // computed compensation by that accumulated parentScale before applying
  // it -- untested, a nested, scaled-down world-object (a thumbnail strip,
  // or any scaled canvas) combined with rotateFromWorldCenter could land
  // its pivot-compensation offset in the wrong local frame with nothing to
  // catch it.
  //
  // Verified by an equivalence that must hold if the scale accumulation is
  // correct: a rotated child nested under a scale=2, unrotated parent must
  // receive exactly *half* the raw local-unit compensation that an
  // equivalent flattened top-level object (the same child pre-multiplied
  // by that same scale, expressed directly in world units) receives for
  // the identical gesture -- one raw unit in the nested child's own local
  // frame is worth two world units, thanks to its ancestor's scale, so
  // achieving the same on-screen (world-space) correction takes half the
  // raw delta.
  test('a scaled ancestor divides a rotated child\'s pivot compensation by the accumulated parentScale', () => {
    const nestedChild = makeOwner(10, 5, 60, 40, 30);
    const parent = makeOwner(0, 0, 10, 10, 0, 2);
    parent.layers = [nestedChild];

    const flatChild = makeOwner(20, 10, 120, 80, 30);

    const { runtime: nestedRuntime, state: nestedState } = makeRuntime([parent]);
    const { runtime: flatRuntime, state: flatState } = makeRuntime([flatChild]);
    nestedRuntime.rotateFromWorldCenter = true;
    flatRuntime.rotateFromWorldCenter = true;

    const runGesture = (runtime: any, state: any) => {
      runtime.beginInteraction();
      state.panOffset = { x: 200, y: 100 };
      runtime.endInteraction();
      runtime.finalizePivotSwitch();
    };

    const nestedXBefore = nestedChild.x;
    const nestedYBefore = nestedChild.y;
    const flatXBefore = flatChild.x;
    const flatYBefore = flatChild.y;

    runGesture(nestedRuntime, nestedState);
    runGesture(flatRuntime, flatState);

    const nestedDx = nestedChild.x - nestedXBefore;
    const nestedDy = nestedChild.y - nestedYBefore;
    const flatDx = flatChild.x - flatXBefore;
    const flatDy = flatChild.y - flatYBefore;

    // Sanity: the gesture actually moved something in both scenarios --
    // otherwise the ratio assertions below would trivially pass at 0/0.
    expect(Math.abs(flatDx) + Math.abs(flatDy)).toBeGreaterThan(0.01);

    expect(nestedDx).toBeCloseTo(flatDx / 2);
    expect(nestedDy).toBeCloseTo(flatDy / 2);
  });

  test('finalizePivotSwitch compensates against whatever view is current when it actually runs, not the view at endInteraction time -- the property that makes an out-of-bounds snap-back land cleanly', () => {
    const owner = makeOwner(100, 80, 60, 40, 30);
    const { runtime, state } = makeRuntime([owner]);
    runtime.rotateFromWorldCenter = true;

    runtime.beginInteraction();
    const xBeforeEnd = owner.x;
    state.panOffset = { x: 200, y: 100 };
    runtime.endInteraction();

    // Simulate render() stepping an out-of-bounds snap-back across several
    // frames *after* endInteraction() returns, before the pivot switch
    // finalizes -- render() only calls finalizePivotSwitch() once
    // transitionManager.hasPending() has gone false again (the transition
    // has actually settled), so by construction this always sees whichever
    // view is current at that point, never a stale snapshot from earlier.
    state.panOffset = { x: 40, y: 15 }; // mid-transition
    expect(owner.x).toBe(xBeforeEnd); // still untouched -- no premature compensation
    state.panOffset = { x: -545, y: 487 }; // transition's settled resting point

    const pivotBeforeFinalize = renderedCenterOfPivot(runtime);
    const beforeRaw = rawScreenCenter(runtime, owner);
    const beforeRendered = renderedCenter(beforeRaw, pivotBeforeFinalize, owner.rotation);

    (runtime as any).finalizePivotSwitch();

    const pivotAfterFinalize = renderedCenterOfPivot(runtime);
    const afterRaw = rawScreenCenter(runtime, owner);
    const afterRendered = renderedCenter(afterRaw, pivotAfterFinalize, owner.rotation);

    // Compensated against the settled (-545, 487) view, not the (200, 100)
    // view captured back at endInteraction() time.
    expect(afterRendered.x).toBeCloseTo(beforeRendered.x);
    expect(afterRendered.y).toBeCloseTo(beforeRendered.y);
  });

  test('beginInteraction cancels a still-pending pivot switch from a previous gesture', () => {
    const owner = makeOwner(100, 80, 60, 40, 30);
    const { runtime, state } = makeRuntime([owner]);
    runtime.rotateFromWorldCenter = true;

    runtime.beginInteraction();
    state.panOffset = { x: 200, y: 100 };
    runtime.endInteraction();
    expect((runtime as any).pivotSwitchPending).toBe(true);

    // A new gesture starts before the previous snap-back ever settled.
    runtime.beginInteraction();
    expect((runtime as any).pivotSwitchPending).toBe(false);
    expect(runtime.isInteracting).toBe(true);
  });

  test('endInteraction is a no-op when rotateFromWorldCenter is off', () => {
    const owner = makeOwner(100, 80, 60, 40, 30);
    const { runtime } = makeRuntime([owner]);
    // Never turned on, never began -- matches e.g. a plain pan on a story
    // that doesn't use rotateFromWorldCenter at all.
    expect(() => runtime.endInteraction()).not.toThrow();
    expect((runtime as any).pivotSwitchPending).toBe(false);
    expect(owner.x).toBe(100);
    expect(owner.y).toBe(80);
  });

  test('objects with no rotation are left untouched by the end-of-gesture compensation', () => {
    const rotated = makeOwner(100, 80, 60, 40, 30);
    const unrotated = makeOwner(200, 150, 60, 40, 0);
    const { runtime, state } = makeRuntime([rotated, unrotated]);
    runtime.rotateFromWorldCenter = true;

    runtime.beginInteraction();
    state.panOffset = { x: 150, y: 75 };
    runtime.endInteraction();
    (runtime as any).finalizePivotSwitch();

    // Own-center rotation math has no positional effect regardless, but
    // this also confirms the `if (!owner.rotation) continue` guard in
    // syncRotationPivotPosition still applies through the shared helper.
    expect(unrotated.x).toBe(200);
    expect(unrotated.y).toBe(150);
  });

  test('turning rotateFromWorldCenter on mid-gesture captures a pivot lazily instead of returning stale/undefined', () => {
    const { runtime } = makeRuntime([]);
    // A gesture is already in progress (e.g. the user started dragging
    // before rotateFromWorldCenter was ever enabled).
    runtime.beginInteraction(); // rotateFromWorldCenter is still false here, so no capture yet
    runtime.rotateFromWorldCenter = true;

    const pivot = (runtime as any).currentWorldPivot();
    expect(pivot).toEqual({ x: 250, y: 200 });

    // And it stays frozen at that lazily-captured value for the rest of the gesture.
    expect((runtime as any).currentWorldPivot()).toEqual(pivot);
  });

  test('turning rotateFromWorldCenter off cancels a pending pivot switch', () => {
    const { runtime, state } = makeRuntime([]);
    runtime.rotateFromWorldCenter = true;

    runtime.beginInteraction();
    state.panOffset = { x: 200, y: 100 };
    runtime.endInteraction();
    expect((runtime as any).pivotSwitchPending).toBe(true);

    runtime.rotateFromWorldCenter = false;
    expect((runtime as any).pivotSwitchPending).toBe(false);
    expect((runtime as any).currentWorldPivot()).toBeUndefined();
  });

  // Regression coverage for the pivotPhase merge (isInteracting and
  // pivotSwitchPending used to be two independent booleans; they're now
  // accessors over one 'idle' | 'interacting' | 'switching' field -- see
  // its own comment). This is the one write site that clears
  // pivotSwitchPending while a gesture can still genuinely be in progress:
  // rotateFromWorldCenter's setter clears it unconditionally when turned
  // off, with no check on whether a gesture happens to be active. Under
  // the old two-flag design that was naturally harmless (pivotSwitchPending
  // and isInteracting were just separate booleans); the merged
  // implementation has to actively choose not to fold "clear
  // pivotSwitchPending" into "go to idle" when the phase is 'interacting'.
  test('turning rotateFromWorldCenter off mid-gesture does not end the gesture itself', () => {
    const { runtime } = makeRuntime([]);
    runtime.rotateFromWorldCenter = true;

    runtime.beginInteraction();
    expect(runtime.isInteracting).toBe(true);

    runtime.rotateFromWorldCenter = false;

    // The raw pointer gesture is still in progress -- only the pivot mode
    // changed. isInteracting must not have been knocked back to idle as a
    // side effect of clearing the (already-false, since a gesture is
    // active, not a pending switch) pivotSwitchPending flag.
    expect(runtime.isInteracting).toBe(true);
    expect((runtime as any).pivotSwitchPending).toBe(false);
  });
});
