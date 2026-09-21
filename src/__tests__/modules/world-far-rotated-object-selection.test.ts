import { dna } from '@atlas-viewer/dna';
import { World } from '../../world';
import { WorldObject } from '../../world-objects/world-object';

// Regression fixture for a real, visually-reported bug, one level above
// world-object-nested-rotation-selection.test.ts: World#getObjectsAt (and
// getScheduledUpdates) filter *top-level* objects with a single
// hidePointsOutsideRegion(this.points, target) call against each object's
// raw, unrotated world bounds -- World has no rotation of its own, and
// nothing above it can widen on a rotated object's behalf the way
// WorldObject#selectionRotation lets an unrotated *ancestor* do one level
// down. Repro: stories/sequence-panel.stories.tsx's "setup test2" button
// (rotate from world center, zoom in, then drag/pan twice) -- confirmed
// live via paint instrumentation that once dragging pushed the raw
// (unrotated) viewport target past a whole top-level canvas's raw world
// bounds, that canvas stopped being painted *at all* (not even a coarse
// fallback layer) -- worse than the per-tile blur the WorldObject-level fix
// targets, since nothing above World was able to recover it.
//
// Fixed by World#forceIncludeRotatedObjects: rather than trying to compute
// a correctly-widened target up here (an earlier version of this fix tried
// exactly that, reusing WorldObject#applyRotation -- see its own comment
// for why that's geometrically incapable of the one thing it needed to do
// whenever the shared pivot happens to equal the current target's own
// center, which while idle it always does), any top-level object carrying
// rotation anywhere in its own subtree is left in hidePointsOutsideRegion's
// candidate list regardless of whether its raw bounds happen to overlap
// target -- deferring the real, precise decision to that object's own
// (already correct) getAllPointsAt/getObjectsAt.

function makeRotatedTopLevelObject(id: string, x: number, width: number) {
  const object = WorldObject.createWithProps({ id, x, y: 0, width, height: 400, rotation: 90 });
  // No Runtime driving updateWorldObjectRotationPivots in this isolated
  // test, so set a pivot directly -- same pattern already used in
  // world-object-culling.test.ts. Placed near the *other* object (x=0) so
  // it's plausible as a shared, world-center-ish pivot, not this object's
  // own center.
  (object as any).rotationPivot = { x: 200, y: 200 };
  return object;
}

describe('World#getObjectsAt / getScheduledUpdates keep a rotated top-level object candidate even when its raw bounds miss target', () => {
  test('getObjectsAt still returns a rotated object whose raw world bounds no longer overlap target', () => {
    const world = new World();
    const near = WorldObject.createWithProps({ id: 'near', x: 0, y: 0, width: 400, height: 400, rotation: 0 });
    const far = makeRotatedTopLevelObject('far', 2451, 2411);
    world.appendChild(near);
    world.appendChild(far);

    // Overlaps `near`'s raw bounds ([0,400]) but not `far`'s ([2451,4862])
    // at all -- the exact shape of the real repro's target after two drags.
    const target = dna([1, 100, 100, 300, 300]);

    const result = world.getObjectsAt(target, true);
    const ids = result.map(([owner]) => owner.id);

    expect(ids).toContain('near');
    expect(ids).toContain('far');
  });

  test('getScheduledUpdates still schedules a rotated object whose raw world bounds no longer overlap target', () => {
    const world = new World();
    const far = makeRotatedTopLevelObject('far', 2451, 2411);
    let scheduled = false;
    (far as any).getScheduledUpdates = () => {
      scheduled = true;
      return [];
    };
    world.appendChild(far);

    const target = dna([1, 100, 100, 300, 300]);
    world.getScheduledUpdates(target, 1);

    expect(scheduled).toBe(true);
  });

  test('an unrotated object with no rotation anywhere in its subtree is still excluded when genuinely off-screen', () => {
    const world = new World();
    const near = WorldObject.createWithProps({ id: 'near', x: 0, y: 0, width: 400, height: 400, rotation: 0 });
    const farUnrotated = WorldObject.createWithProps({
      id: 'far-unrotated',
      x: 2451,
      y: 0,
      width: 2411,
      height: 400,
      rotation: 0,
    });
    world.appendChild(near);
    world.appendChild(farUnrotated);

    const target = dna([1, 100, 100, 300, 300]);
    const result = world.getObjectsAt(target, true);
    const ids = result.map(([owner]) => owner.id);

    // The fix only affects objects that carry rotation somewhere in their
    // own subtree -- the fast, rotation-unaware path stays exactly as
    // correctness-preserving as it always was for everything else.
    expect(ids).toContain('near');
    expect(ids).not.toContain('far-unrotated');
  });
});
