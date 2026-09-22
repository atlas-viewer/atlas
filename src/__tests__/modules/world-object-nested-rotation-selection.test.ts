import { dna, hidePointsOutsideRegion, Strand } from '@atlas-viewer/dna';
import { WorldObject, TileSelectionDebugEvent } from '../../world-objects/world-object';

// Regression fixture for a second, real, visually-reported instance of the
// same blur bug world-object-rotated-tile-selection.test.ts fixes -- this
// time surviving that fix. Repro: stories/sequence-panel.stories.tsx --
// Next, Rotate Canvas From Center, Zoom In until it disables. Root cause:
// getAllPointsAt()'s rotation-aware widening only triggered when *the node
// running it* was rotated (this.rotation). But render-time rotation is
// applied by whichever WorldObject is the nearest owner of the paint (see
// CanvasRenderer#applyTransform) -- which, confirmed live against the real
// story, was two plain <world-object> levels *above* the node that actually
// carries the rotation (ImageService renders its rotation onto its own
// nested wrapper -- see TileSet.tsx). Both of those unrotated ancestors had
// this.rotation === 0, so their own getAllPointsAt skipped widening
// entirely (applyRotation is a no-op when rotation is falsy) and handed
// their child an already-narrowed, zero-rotation-aware target. No amount of
// the *rotated descendant's own* correct widening can recover content
// already clipped away by an ancestor's getIntersection higher up the tree
// -- confirmed live via paint instrumentation: of a 3x4 native-resolution
// tile grid, only a single tile was ever selected, the rest permanently
// showing a coarser, visibly blurry fallback layer.
//
// Fixed by WorldObject#selectionRotation(): getAllPointsAt widens using
// this.rotation if set, otherwise recurses into its own children looking
// for a rotation to widen with instead -- see its own comment for why this
// has to recurse (not just check direct children) to see through however
// many unrotated wrapper levels separate a story's own <world-object> from
// wherever a component like ImageService actually applies the rotation.

// Minimal target-aware leaf, mirroring TiledImage#getAllPointsAt: it
// actually consults `target` via hidePointsOutsideRegion, so we can tell
// which leaf(s) a given target would keep. Same pattern already used in
// world-object-rotated-tile-selection.test.ts.
function makeFakeLeaf(label: string, points: Strand) {
  return {
    label,
    points,
    getAllPointsAt(target: Strand, aggregate?: Strand) {
      return [[this, hidePointsOutsideRegion(points, target), aggregate]];
    },
  } as any;
}

function isSelected(points: Strand) {
  return points[0] !== 0;
}

// outer (rotation 0) -> inner (rotation 0) -> rotated (rotation 90) -> [edge, rest].
// Same 400x400 page-split-into-an-edge-strip fixture as
// world-object-rotated-tile-selection.test.ts, just reached through two
// unrotated wrapper levels instead of directly -- matching the real story's
// own tree shape (<world-object> -> ImageService's own outer wrapper ->
// ImageService's *nested*, actually-rotated wrapper -- see TileSet.tsx).
function makeNestedFixture() {
  const rotated = WorldObject.createWithProps({ id: 'rotated', x: 0, y: 0, width: 400, height: 400, rotation: 90 });
  const edge = makeFakeLeaf('edge', dna([1, 0, 0, 40, 400]));
  const rest = makeFakeLeaf('rest', dna([1, 40, 0, 400, 400]));
  (rotated as any).layers = [edge, rest];

  const inner = WorldObject.createWithProps({ id: 'inner', x: 0, y: 0, width: 400, height: 400, rotation: 0 });
  (inner as any).layers = [rotated];

  const outer = WorldObject.createWithProps({ id: 'outer', x: 0, y: 0, width: 400, height: 400, rotation: 0 });
  (outer as any).layers = [inner];

  return { outer, inner, rotated, edge, rest };
}

describe('WorldObject#selectionRotation (rotation carried by a descendant, not this node)', () => {
  afterEach(() => {
    WorldObject.debugTileSelection = undefined;
  });

  test('an unrotated node reports its rotated descendant\'s angle, not 0', () => {
    const { outer, inner, rotated } = makeNestedFixture();

    expect((outer as any).selectionRotation()).toBe(90);
    expect((inner as any).selectionRotation()).toBe(90);
    expect((rotated as any).selectionRotation()).toBe(90);
  });

  test('a node with no rotated descendants anywhere reports 0', () => {
    const outer = WorldObject.createWithProps({ id: 'outer', x: 0, y: 0, width: 400, height: 400, rotation: 0 });
    const inner = WorldObject.createWithProps({ id: 'inner', x: 0, y: 0, width: 400, height: 400, rotation: 0 });
    (outer as any).layers = [inner];
    (inner as any).layers = [makeFakeLeaf('leaf', dna([1, 0, 0, 400, 400]))];

    expect((outer as any).selectionRotation()).toBe(0);
  });

  test('debugTileSelection fires from the unrotated ancestor, reporting the descendant\'s rotation', () => {
    const { outer } = makeNestedFixture();
    const events: TileSelectionDebugEvent[] = [];
    WorldObject.debugTileSelection = (event) => events.push(event);

    outer.getAllPointsAt(dna([1, 0, 0, 40, 400]), dna([1, 0, 0, 0, 0, 1, 0, 0, 1]), 1);

    // Fires once per level of the tree (outer -> inner -> rotated all widen
    // and recurse), so three events for this three-deep fixture -- the
    // point being tested is the *first* of them: outer, despite its own
    // this.rotation being 0, reports its descendant's angle instead of
    // silently skipping the hook the way an unwidened node would.
    expect(events.length).toBe(3);
    expect(events[0].ownerId).toBe('outer');
    expect(events[0].rotation).toBe(90);
    expect(events.map((e) => e.rotation)).toEqual([90, 90, 90]);
  });

  test('a tight, rotated target reaches the rotated descendant\'s far leaf through two unrotated ancestors', () => {
    const { outer } = makeNestedFixture();
    const events: TileSelectionDebugEvent[] = [];
    WorldObject.debugTileSelection = (event) => events.push(event);

    // Same tight window as world-object-rotated-tile-selection.test.ts: read
    // literally against the unrotated target alone, this only overlaps
    // "edge". Without selectionRotation(), outer.rotation === 0 means
    // outer's own getAllPointsAt never widens at all, and "rest" -- the leaf
    // physically on screen at this target once the *descendant's* rotation
    // is accounted for -- never gets a chance to be selected no matter what
    // `rotated` itself would have done with a wider target.
    const target = dna([1, 0, 0, 40, 400]);
    const result = outer.getAllPointsAt(target, dna([1, 0, 0, 0, 0, 1, 0, 0, 1]), 1);

    const actuallySelected = result
      .filter(([, points]: any) => isSelected(points))
      .map(([leaf]: any) => leaf.label)
      .sort();

    expect(actuallySelected).toEqual(['edge', 'rest']);
  });

  test('an unrotated node with no rotated descendants keeps the original conservative (unwidened) selection', () => {
    const outer = WorldObject.createWithProps({ id: 'outer', x: 0, y: 0, width: 400, height: 400, rotation: 0 });
    const edge = makeFakeLeaf('edge', dna([1, 0, 0, 40, 400]));
    const rest = makeFakeLeaf('rest', dna([1, 40, 0, 400, 400]));
    (outer as any).layers = [edge, rest];

    const target = dna([1, 0, 0, 40, 400]);
    const result = outer.getAllPointsAt(target, dna([1, 0, 0, 0, 0, 1, 0, 0, 1]), 1);

    const actuallySelected = result.filter(([, points]: any) => isSelected(points)).map(([leaf]: any) => leaf.label);

    expect(actuallySelected).toEqual(['edge']);
  });
});
