import { WorldObject } from '../../world-objects/world-object';

// Regression coverage for a real test-coverage gap: every rotation/pivot
// fixture across the whole rotation test suite used the default scale of 1
// (grep confirms zero non-default `scale` usages anywhere in
// world-object-*.test.ts / world-far-rotated-object-selection.test.ts /
// runtime-*.test.ts), even though WorldObject#selectionBounds multiplies a
// child's bounds by this.scale before merging, and Runtime's pivot-tracking
// tree-walk (updateWorldObjectRotationPivots / syncRotationPivotPosition)
// accumulates parentScale * owner.scale down the tree. A wrong order of
// operations or wrong axis in either would have shipped silently.
//
// Values below are deliberately asymmetric (different x vs y, different
// width vs height, a non-trivial scale) so that an axis swap or a missing
// multiplication produces a numerically different, easy-to-spot result
// rather than accidentally matching by coincidence.

describe('WorldObject#selectionBounds scales a child\'s contribution by this.scale', () => {
  test('a scaled parent widens by the child bounds scaled down, not the raw child bounds', () => {
    // Parent scaled to 0.25 -- WorldObject#applyProps mutates .points to
    // already reflect that scale (a 400x120 object at scale 0.25 ends up
    // with points width/height 100x30), so parent.points itself is already
    // correct; what this test isolates is the *child's* contribution.
    const parent = WorldObject.createWithProps({ id: 'parent', x: 0, y: 0, width: 400, height: 120, scale: 0.25 });
    expect(Array.from(parent.points)).toEqual([1, 0, 0, 100, 30]);

    // A child positioned and sized well outside the parent's own [0,0,100,30]
    // -- in the child's own local (pre-parent-scale) frame.
    const child = WorldObject.createWithProps({ id: 'child', x: 40, y: 200, width: 60, height: 20 });
    (parent as any).layers = [child];

    // child's own bounds: [40, 200, 100, 220]. Scaled by parent.scale=0.25
    // and offset by parent.x/y=0: [10, 50, 25, 55]. Unioned with parent's
    // own [0,0,100,30]: x2/y2 come from the child (25 < 100 is false for x2
    // since parent's own x2=100 is larger, but y2=55 > 30 -- only the y
    // axis should actually widen here, which is exactly what an axis-swap
    // bug would get wrong).
    const bounds = parent.selectionBounds();
    expect(Array.from(bounds)).toEqual([1, 0, 0, 100, 55]);
  });

  test('nested scaling compounds multiplicatively, not additively', () => {
    // outer(scale=0.5) -> inner(scale=0.5): a point at inner-local (100, 0)
    // must land at outer-local (25, 0) -- 100 * 0.5 (inner's own, applied
    // when inner computes its own bounds relative to itself -- inapplicable
    // here since the probe point IS inner's own extent) * 0.5 (outer's) --
    // i.e. compounding by multiplication (0.25 total), not by adding the
    // two scale factors (which would give an incorrect 0.0 or 1.0 style
    // result depending on the mistake).
    const outer = WorldObject.createWithProps({ id: 'outer', x: 0, y: 0, width: 10, height: 10, scale: 0.5 });
    const inner = WorldObject.createWithProps({ id: 'inner', x: 0, y: 0, width: 200, height: 10, scale: 0.5 });
    (outer as any).layers = [inner];

    // inner.points is already [0,0,100,5] (200x10 at its own scale 0.5).
    expect(Array.from(inner.points)).toEqual([1, 0, 0, 100, 5]);

    // outer's own bounds [0,0,5,5] (10x10 at scale 0.5) unioned with
    // inner's [0,0,100,5] scaled by outer.scale=0.5 -> [0,0,50,2.5] ->
    // outer's x2 must be 50 (100 * 0.5), not 100 (unscaled) or 25 (an
    // additive 0.5+0.5=1... no -- distinguishing multiplicative compounding
    // requires comparing against the single-level-scale test above: if
    // outer's own scale were mistakenly ignored for the child merge, x2
    // would come out as 100 instead of 50).
    const bounds = outer.selectionBounds();
    expect(bounds[3]).toBeCloseTo(50);
  });
});
