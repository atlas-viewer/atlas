import { WorldObject } from '../../world-objects/world-object';

// getAllPointsAt used to call selectionRotation() and selectionBounds()
// separately, each independently walking this node's entire child subtree
// -- real, measurable redundant work on a hot per-frame path (see
// selectionRotationAndBounds's own comment). It was merged into one
// combined walk purely as an internal optimization: this test exists to
// guarantee that merge didn't change any observable value -- the combined
// method must always agree with what the two separate public methods
// would have computed independently, for both a plain tree and one with a
// pivot-compensated (and so widened) descendant.

function makeCompensatedFixture() {
  const rotated = WorldObject.createWithProps({ id: 'rotated', x: -80, y: -80, width: 200, height: 100, rotation: 90 });
  const leaf = { points: (rotated as any).points, rotation: 0 } as any;
  (rotated as any).layers = [leaf];

  const inner = WorldObject.createWithProps({ id: 'inner', x: 0, y: 0, width: 200, height: 100 });
  (inner as any).layers = [rotated];

  const outer = WorldObject.createWithProps({ id: 'outer', x: 0, y: 0, width: 200, height: 100 });
  (outer as any).layers = [inner];

  return outer;
}

describe('WorldObject#selectionRotationAndBounds agrees with the separate public methods', () => {
  test('a plain, unrotated tree with no rotated descendants', () => {
    const outer = WorldObject.createWithProps({ id: 'outer', x: 10, y: 20, width: 100, height: 50 });
    const inner = WorldObject.createWithProps({ id: 'inner', x: 0, y: 0, width: 100, height: 50 });
    (outer as any).layers = [inner];

    const combined = (outer as any).selectionRotationAndBounds();

    expect(combined.rotation).toBe(outer.selectionRotation());
    expect(Array.from(combined.bounds)).toEqual(Array.from(outer.selectionBounds()));
  });

  test('a tree with a pivot-compensated, rotated descendant reached through unrotated ancestors', () => {
    const outer = makeCompensatedFixture();

    // Read selectionRotation()/selectionBounds() *first*, independently,
    // before selectionRotationAndBounds() has a chance to run and
    // overwrite any shared buffer -- isolates this from the buffer-reuse
    // mechanics being tested, not just their end values.
    const expectedRotation = outer.selectionRotation();
    const expectedBounds = Array.from(outer.selectionBounds());

    const combined = (outer as any).selectionRotationAndBounds();

    expect(combined.rotation).toBe(expectedRotation);
    expect(combined.rotation).toBe(90);
    expect(Array.from(combined.bounds)).toEqual(expectedBounds);
    expect(Array.from(combined.bounds)).toEqual([1, -80, -80, 200, 100]);
  });

  test('a leaf contributing only a bare .rotation property (no selectionRotation/selectionBounds of its own)', () => {
    const outer = WorldObject.createWithProps({ id: 'outer', x: 0, y: 0, width: 100, height: 100 });
    const leaf = { points: (outer as any).points, rotation: 42 } as any;
    (outer as any).layers = [leaf];

    const combined = (outer as any).selectionRotationAndBounds();

    expect(combined.rotation).toBe(42);
    expect(combined.rotation).toBe(outer.selectionRotation());
    // A leaf's own rotation contributes to widening but never to bounds --
    // matches selectionBounds()'s existing behavior of skipping anything
    // without its own selectionBounds method.
    expect(Array.from(combined.bounds)).toEqual(Array.from(outer.points));
  });
});
