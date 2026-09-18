import { dna, DnaFactory, Strand } from '@atlas-viewer/dna';
import { WorldObject, HitTestCullingDebugEvent } from '../../world-objects/world-object';

// getObjectsAt (hit-testing -- world.getObjectsAt() / click and hover
// targets, called from world.ts's propagatePointerEvent/propagateTouchEvent,
// fed by browser-event-manager.ts) rotates `target` via applyRotation()
// before intersecting it with this.points -- superficially the same pattern
// that was removed from getAllPointsAt (painting) to fix a real reported
// bug (see world-object-culling.test.ts): a rotationPivot far from the
// object could rotate a small `target` clean outside this.points, culling
// something genuinely on screen.
//
// It is *not* the same bug here, despite looking identical. The two
// `target`s mean different things:
//  - getAllPointsAt's target is the current viewport window. Rotation is a
//    pure render-time visual effect (see its own comment) that must not
//    reposition the viewport for culling/tile-selection purposes -- hence
//    leaving it unrotated was the correct fix.
//  - getObjectsAt's target is a real click/touch point, always built by its
//    only callers (world.ts:105/122) as a 1x1 box around the raw,
//    un-rotated mouse position from browser-event-manager.ts's
//    viewerToWorld() -- which has no per-object knowledge of rotation at
//    all. To know whether that raw point lands on this *specific* object's
//    visually-rotated appearance, getObjectsAt has to map it back into the
//    object's own local space itself, which is exactly what
//    applyRotation(target) does (verified below against the real forward
//    render transform in canvas-renderer.ts#applyTransform).
//
// Reusing world-object-culling.test.ts's viewport-shaped target (matching
// the object's own full un-rotated bounds) against getObjectsAt was
// comparing the wrong thing -- a real click never looks like that. The
// tests below use a real point-shaped target instead, and confirm the
// current rotation-aware behaviour is correct: a click at the object's true
// (rotated, pivot-swept) on-screen position hits, and a click at its raw
// un-rotated position -- which is no longer where it visually is -- misses.

// Mirrors canvas-renderer.ts#applyTransform's forward transform exactly:
// ctx.translate(cx,cy); ctx.rotate(angle); ctx.translate(-cx,-cy). Used
// here only to compute where a rotated object actually renders, so the
// tests can click "for real" instead of guessing a target.
function forwardRenderPosition(cx: number, cy: number, x: number, y: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + (dx * cos - dy * sin), y: cy + (dx * sin + dy * cos) };
}

describe('WorldObject#debugHitTestCulling hook', () => {
  afterEach(() => {
    WorldObject.debugHitTestCulling = undefined;
  });

  test('does not fire for an unrotated object', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 0, y: 0, width: 200, height: 100, rotation: 0 });
    const events: HitTestCullingDebugEvent[] = [];
    WorldObject.debugHitTestCulling = (event) => events.push(event);

    owner.getObjectsAt(DnaFactory.singleBox(1, 1, 50, 25));

    expect(events).toEqual([]);
  });

  test('fires for a rotated object and reports the target rotated into local space', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 0, y: 0, width: 200, height: 100, rotation: 87 });
    owner.rotationPivot = { x: 5000, y: 3000 };
    const events: HitTestCullingDebugEvent[] = [];
    WorldObject.debugHitTestCulling = (event) => events.push(event);

    const rendered = forwardRenderPosition(5000, 3000, 100, 50, 87);
    const target = DnaFactory.singleBox(1, 1, rendered.x, rendered.y);
    owner.getObjectsAt(target);

    expect(events.length).toBe(1);
    expect(events[0].hasExternalPivot).toBe(true);
    expect(Array.from(events[0].rawTarget)).toEqual(Array.from(target));
    // The click was built at the object's *rendered* position, so mapping
    // it back into local space should land inside this.points -- not culled.
    expect(events[0].culled).toBe(false);
  });
});

describe('WorldObject#getObjectsAt hit-testing a rotated object under a far pivot', () => {
  afterEach(() => {
    WorldObject.debugHitTestCulling = undefined;
  });

  test('a click at the object\'s true (pivot-swept) rendered position registers as a hit', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 0, y: 0, width: 200, height: 100, rotation: 87 });
    // A rotationPivot far outside the object's own bounds -- e.g. the
    // viewport center under rotateFromWorldCenter, at a zoom level where
    // the object is comparatively small and far from that center. Sweeping
    // the object 87deg around a pivot this far away moves its rendered
    // position by thousands of units.
    owner.rotationPivot = { x: 5000, y: 3000 };

    const leaf = { points: dna([1, 0, 0, 200, 100]) } as any;
    (owner as any).layers = [leaf];

    const centerX = 100;
    const centerY = 50;
    const rendered = forwardRenderPosition(5000, 3000, centerX, centerY, 87);

    const events: HitTestCullingDebugEvent[] = [];
    WorldObject.debugHitTestCulling = (event) => events.push(event);

    const target = DnaFactory.singleBox(1, 1, rendered.x, rendered.y);
    const result = owner.getObjectsAt(target);

    expect(events[0].culled).toBe(false);
    expect(result.length).toBe(1);
  });

  test('a click at the object\'s raw un-rotated position misses, since it visually swept away', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 0, y: 0, width: 200, height: 100, rotation: 87 });
    owner.rotationPivot = { x: 5000, y: 3000 };

    const leaf = { points: dna([1, 0, 0, 200, 100]) } as any;
    (owner as any).layers = [leaf];

    const events: HitTestCullingDebugEvent[] = [];
    WorldObject.debugHitTestCulling = (event) => events.push(event);

    // The object's own center, un-rotated -- where a click would need to
    // land if rotation were (incorrectly) ignored entirely.
    const target = DnaFactory.singleBox(1, 1, 100, 50);
    const result = owner.getObjectsAt(target);

    expect(events[0].culled).toBe(true);
    expect(result.length).toBe(0);
  });

  test('a target genuinely nowhere near the object, rotated or not, is still culled', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 0, y: 0, width: 200, height: 100, rotation: 87 });
    owner.rotationPivot = { x: 5000, y: 3000 };

    const leaf = { points: dna([1, 0, 0, 200, 100]) } as any;
    (owner as any).layers = [leaf];

    const events: HitTestCullingDebugEvent[] = [];
    WorldObject.debugHitTestCulling = (event) => events.push(event);

    const target = DnaFactory.singleBox(1, 1, 999999, 999999);
    const result = owner.getObjectsAt(target);

    expect(events[0].culled).toBe(true);
    expect(result.length).toBe(0);
  });
});

// Regression fixture for a second, real bug in the same family: getObjectsAt
// (this file's own subject) never received the fix that made getAllPointsAt
// (painting) correct for a pivot-compensated descendant -- see
// WorldObject#selectionBounds's own comment. Runtime#syncRotationPivotPosition
// moves only the actually-rotated node (`if (owner.rotation)`); an unrotated
// ancestor's own `this.points` is left describing where its content *used*
// to be. getAllPointsAt was fixed to intersect against selectionBounds()
// instead; getObjectsAt (this file) still culled against raw this.points,
// so a click on content that paints correctly (via the already-fixed
// getAllPointsAt) could still be silently rejected before ever reaching the
// descendant whose own hit-test would have found it.
describe('WorldObject#getObjectsAt reaches a pivot-compensated descendant through unrotated ancestors', () => {
  afterEach(() => {
    WorldObject.debugHitTestCulling = undefined;
  });

  // outer (rotation 0, points never updated) -> inner (rotation 0, same) ->
  // rotated (rotation 90, shifted via x/y the way
  // Runtime#syncRotationPivotPosition/applyPivotCompensationOffset actually
  // moves a rotated node -- see world-object.ts's own comment on
  // applyPivotCompensationOffset) -> leaf.
  function makeCompensatedFixture() {
    // Shifted -80 on both axes: half of this now falls outside outer/
    // inner's original, never-updated [0,0,200,100] bounds.
    const rotated = WorldObject.createWithProps({ id: 'rotated', x: -80, y: -80, width: 200, height: 100, rotation: 90 });
    // getObjectsAt(target, all: true) recurses into every layer via
    // layer.getObjectsAt regardless of whether it's a WorldObject or a leaf
    // (BaseObject#getObjectsAt gives every leaf type this same no-op
    // default), so the fake leaf needs one too.
    const leaf = { points: dna([1, 0, 0, 200, 100]), getObjectsAt: () => [] } as any;
    (rotated as any).layers = [leaf];

    const inner = WorldObject.createWithProps({ id: 'inner', x: 0, y: 0, width: 200, height: 100 });
    (inner as any).layers = [rotated];

    const outer = WorldObject.createWithProps({ id: 'outer', x: 0, y: 0, width: 200, height: 100 });
    (outer as any).layers = [inner];

    return { outer, inner, rotated, leaf };
  }

  test('a click at the compensated descendant\'s own center reaches it through two stale-bounds ancestors', () => {
    const { outer, rotated } = makeCompensatedFixture();

    // rotated.points is [-80,-80,120,20] (center at (20,-30)) -- outside
    // outer/inner's original y range of [0,100]. Rotation around a node's
    // own center is a fixed point of the rotation for any angle, so this
    // target requires no render-transform bookkeeping to construct: it maps
    // to itself through rotated.applyRotation() regardless of the 90deg
    // angle, isolating this test to the ancestor-staleness fix rather than
    // re-testing applyRotation's own math (already covered above).
    const centerX = (rotated.points[1] + rotated.points[3]) / 2;
    const centerY = (rotated.points[2] + rotated.points[4]) / 2;
    expect(centerY).toBeLessThan(0); // sanity: genuinely outside the stale ancestor bounds

    const events: HitTestCullingDebugEvent[] = [];
    WorldObject.debugHitTestCulling = (event) => events.push(event);

    const target = DnaFactory.singleBox(1, 1, centerX, centerY);
    const result = outer.getObjectsAt(target, true);

    expect(result.length).toBeGreaterThan(0);
    // The debug hook now fires (and reports culled: false) from the
    // unrotated outer ancestor too, not only from the directly-rotated
    // node -- see the widened-condition comment in getObjectsAt.
    expect(events.some((e) => e.ownerId === 'outer' && e.culled === false)).toBe(true);
  });

  test('a click genuinely outside even the widened bounds is still culled at the outer ancestor', () => {
    const { outer } = makeCompensatedFixture();

    const events: HitTestCullingDebugEvent[] = [];
    WorldObject.debugHitTestCulling = (event) => events.push(event);

    // selectionBounds() for this fixture is [-80,-80,200,100] -- comfortably
    // outside that, in both x and y.
    const target = DnaFactory.singleBox(1, 1, 999999, 999999);
    const result = outer.getObjectsAt(target, true);

    expect(result.length).toBe(0);
    expect(events.some((e) => e.ownerId === 'outer' && e.culled === true)).toBe(true);
  });
});
