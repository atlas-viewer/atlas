import { dna, hidePointsOutsideRegion, Strand } from '@atlas-viewer/dna';
import { WorldObject } from '../../world-objects/world-object';

// Minimal target-aware leaf, mirroring TiledImage#getAllPointsAt (the real
// content type in the reported bug): it actually consults `target` via
// hidePointsOutsideRegion, unlike Box/SingleImage which always return
// themselves regardless of target. strand[0] === 0 means "culled".
function makeFakeLeaf(points: Strand) {
  return {
    points,
    getAllPointsAt(target: Strand, aggregate?: Strand) {
      const result = hidePointsOutsideRegion(points, target);
      return [[this, result, aggregate]];
    },
  } as any;
}

describe('WorldObject#getAllPointsAt culling is unaffected by rotation', () => {
  // Regression test for a real reported bug: at a particular zoom/position
  // combination, an ImageService/TileSet's rotated wrapper -- with
  // rotationPivot set far outside its own bounds, as happens under
  // rotateFromWorldCenter -- was incorrectly culled, making the image
  // invisible. Root cause: culling used to rotate the *target* around
  // rotationPivot before intersecting it with `this.points`, which could
  // shift a small target far outside the node's own bounds even though the
  // node is genuinely on screen after the real (post-hoc, render-time-only)
  // rotation is applied. See getAllPointsAt's own comment for the full
  // architecture explanation.
  test('a rotated object with an external pivot far outside its own bounds still exposes its content', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 0, y: 0, width: 200, height: 100, rotation: 87 });
    // A rotationPivot far outside the object's own [0,200]x[0,100] bounds --
    // e.g. the viewport center under rotateFromWorldCenter, at a zoom level
    // where the object is comparatively small and far from that center.
    owner.rotationPivot = { x: 5000, y: 3000 };

    const leaf = makeFakeLeaf(dna([1, 0, 0, 200, 100]));
    (owner as any).layers = [leaf];

    // A target that exactly matches the object's own (un-rotated) bounds --
    // the "zero headroom" case from the real bug, where the object is
    // exactly at the edge of the visible window before any rotation is
    // considered.
    const target = dna([1, 0, 0, 200, 100]);
    const aggregate = dna([1, 0, 0, 0, 0, 1, 0, 0, 1]);

    const result = owner.getAllPointsAt(target, aggregate, 1);

    expect(result.length).toBe(1);
    const [, points] = result[0];
    // points[0] === 0 means culled/invisible -- must not happen here.
    expect(points[0]).not.toBe(0);
  });

  test('a target that genuinely does not overlap the object is still culled', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 0, y: 0, width: 200, height: 100, rotation: 87 });
    owner.rotationPivot = { x: 5000, y: 3000 };

    const leaf = makeFakeLeaf(dna([1, 0, 0, 200, 100]));
    (owner as any).layers = [leaf];

    // Far away from the object entirely -- genuinely off-screen, not just a
    // rotation-pivot artifact.
    const target = dna([1, 10000, 10000, 10100, 10100]);
    const aggregate = dna([1, 0, 0, 0, 0, 1, 0, 0, 1]);

    const result = owner.getAllPointsAt(target, aggregate, 1);

    // Nothing selected. This used to assert the layer came back present but
    // culled (one entry, strand[0] === 0) -- an equivalent statement of the
    // same invariant, from when getAllPointsAt descended into its layers
    // with the empty intersection instead of stopping at it. It no longer
    // descends: an empty region does not survive being transformed into a
    // child's coordinate space and re-intersected there, and would come
    // back as a real selection several levels down -- see getAllPointsAt's
    // own comment and world-object-empty-selection-propagation.test.ts.
    // What this test exists to guarantee is unchanged and, if anything,
    // now stated more directly: a genuinely far-away target paints nothing.
    expect(result.length).toBe(0);
  });

  test('own-center rotation (no rotationPivot) also does not narrow culling based on rotation', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 0, y: 0, width: 200, height: 100, rotation: 45 });
    // rotationPivot left undefined -- own-center mode.

    const leaf = makeFakeLeaf(dna([1, 0, 0, 200, 100]));
    (owner as any).layers = [leaf];

    const target = dna([1, 0, 0, 200, 100]);
    const aggregate = dna([1, 0, 0, 0, 0, 1, 0, 0, 1]);

    const result = owner.getAllPointsAt(target, aggregate, 1);

    // getAllPointsAt selects against the union of target and its
    // rotation-aware counterpart in a single pass (see
    // world-object-rotated-tile-selection.test.ts -- fixes a real blur bug:
    // two independently-ordered selection/paint passes gave no guarantee a
    // second pass's coarse fallback tile wouldn't paint over, and so
    // visibly overwrite, a first pass's already-fine tile at the same
    // screen position). Here target already equals this.points exactly, so
    // the union is just target itself, and the leaf is selected once. The
    // guarantee this test exists for -- rotation never narrows culling --
    // still holds: it must not be culled.
    expect(result.length).toBe(1);
    const [, points] = result[0];
    expect(points[0]).not.toBe(0);
  });
});
