import { dna, hidePointsOutsideRegion, Strand } from '@atlas-viewer/dna';
import { WorldObject, TileSelectionDebugEvent } from '../../world-objects/world-object';

// Regression fixture for a real, visually-reported bug: after rotating a
// zoomed-in canvas (see stories/sequence-panel.stories.tsx -- Next, Zoom In
// x3, Rotate once), the edge of the page nearest the rotation renders
// visibly blurrier than the rest, because a lower-resolution fallback layer
// is what's actually painted there. Root cause: getAllPointsAt() selected
// *which* content/tile to fetch using only the raw, unrotated `target` (see
// its own comment -- that's intentional, fixing a different bug where a far
// rotationPivot caused rotated objects to vanish entirely). That was correct
// for the yes/no "is this object visible" question, but once zoomed in
// tight, the raw target no longer identifies the physically-correct
// sub-region of a *rotated* object, and a leaf that should be selected got
// skipped -- so nothing at the requested resolution covered that patch of
// screen, and a coarser fallback layer showed through instead.
//
// Fixed by selecting content against the union of target and
// applyRotation(target) in one pass -- see getAllPointsAt. Extending the
// selected region can only add coverage, never remove it, so the far-pivot
// invisibility fix above is untouched; it just also covers whatever the
// unrotated target alone missed.
//
// An earlier version of this fix ran two *separate* getAllPointsAt passes
// (unrotated, then rotation-aware) and concatenated their results, which
// introduced its own real bug: each pass does its own coarse-to-fine layer
// selection and paint ordering, correct within itself, but nothing ordered
// the two passes against each other, so the second pass's coarse fallback
// tiles could paint after -- and so visibly overwrite -- the first pass's
// already-fine tile at the same screen position. A single selection pass
// against the union has only one coarse-to-fine ordering, so that can't
// happen; see 'a single selection pass never selects the same leaf twice'
// below.

// Minimal target-aware leaf, mirroring TiledImage#getAllPointsAt: it
// actually consults `target` via hidePointsOutsideRegion, so we can tell
// which leaf(s) a given target would keep. Same pattern already used in
// world-object-culling.test.ts.
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

describe('WorldObject#debugTileSelection hook', () => {
  afterEach(() => {
    WorldObject.debugTileSelection = undefined;
  });

  test('does not fire for an unrotated object', () => {
    const owner = WorldObject.createWithProps({ id: 'page', x: 0, y: 0, width: 400, height: 400, rotation: 0 });
    const events: TileSelectionDebugEvent[] = [];
    WorldObject.debugTileSelection = (event) => events.push(event);

    owner.getAllPointsAt(dna([1, 0, 0, 200, 400]), dna([1, 0, 0, 0, 0, 1, 0, 0, 1]), 1);

    expect(events).toEqual([]);
  });

  test('fires for a rotated object and reports a rotation-aware target that differs from the raw one', () => {
    const owner = WorldObject.createWithProps({ id: 'page', x: 0, y: 0, width: 400, height: 400, rotation: 90 });
    const events: TileSelectionDebugEvent[] = [];
    WorldObject.debugTileSelection = (event) => events.push(event);

    const target = dna([1, 0, 0, 200, 400]);
    owner.getAllPointsAt(target, dna([1, 0, 0, 0, 0, 1, 0, 0, 1]), 1);

    expect(events.length).toBe(1);
    expect(Array.from(events[0].rawTarget)).toEqual(Array.from(target));
    // If these matched, there'd be nothing for a test to detect below.
    expect(Array.from(events[0].rotationAwareTarget)).not.toEqual(Array.from(events[0].rawTarget));
  });
});

describe('WorldObject#getAllPointsAt tile selection near a rotated edge (reproduces the reported blur)', () => {
  afterEach(() => {
    WorldObject.debugTileSelection = undefined;
  });

  test('the leaves selected for a tight, rotated target cover what a rotation-aware selection would pick', () => {
    // A 400x400 page split into a thin "edge" strip (mirroring the margin
    // that rendered blurry in the story) and the rest of the page.
    const owner = WorldObject.createWithProps({ id: 'page', x: 0, y: 0, width: 400, height: 400, rotation: 90 });
    const edge = makeFakeLeaf('edge', dna([1, 0, 0, 40, 400]));
    const rest = makeFakeLeaf('rest', dna([1, 40, 0, 400, 400]));
    (owner as any).layers = [edge, rest];

    const events: TileSelectionDebugEvent[] = [];
    WorldObject.debugTileSelection = (event) => events.push(event);

    // Zoomed tightly into a window that, read literally against the
    // unrotated target alone, overlaps only "edge".
    const target = dna([1, 0, 0, 40, 400]);
    const result = owner.getAllPointsAt(target, dna([1, 0, 0, 0, 0, 1, 0, 0, 1]), 1);

    const actuallySelected = result
      .filter(([, points]: any) => isSelected(points))
      .map(([leaf]: any) => leaf.label)
      .sort();

    // What a rotation-aware selection alone would have picked, computed
    // independently (not by calling getAllPointsAt again) against the
    // rotationAwareTarget the hook just reported.
    const rotationAwareTarget = events[0].rotationAwareTarget;
    const physicallyExpected = [edge, rest]
      .filter((leaf) => isSelected(hidePointsOutsideRegion(leaf.points, rotationAwareTarget)))
      .map((leaf) => leaf.label)
      .sort();

    // Fixed: getAllPointsAt now selects against target ∪ rotationAwareTarget,
    // so "rest" -- the leaf that's physically on screen at this target once
    // rotation is accounted for -- is selected alongside "edge" (the
    // unrotated pass's conservative baseline, kept for the far-pivot
    // guarantee). `actuallySelected` covers everything `physicallyExpected`
    // says should be visible.
    for (const label of physicallyExpected) {
      expect(actuallySelected).toContain(label);
    }
  });

  test('a single selection pass never selects the same leaf twice', () => {
    // Regression guard for the real bug the union-based fix above replaced:
    // running getAllPointsAt against target and applyRotation(target) as
    // two *separate* passes and concatenating them could select (and then
    // paint) the same leaf twice, with no guarantee the second pass's own
    // coarse-to-fine ordering wouldn't land a lower-resolution draw after
    // the first pass's already-fine one at the same screen position --
    // confirmed live via drawImage instrumentation against the real story,
    // watching several render ticks after rotating (dozens of overwritten-
    // tile cases). Asserting exactly one
    // result per leaf is what actually guarantees that can't recur: with
    // only one selection pass, there is only one coarse-to-fine paint
    // order.
    const owner = WorldObject.createWithProps({ id: 'page', x: 0, y: 0, width: 400, height: 400, rotation: 90 });
    const edge = makeFakeLeaf('edge', dna([1, 0, 0, 40, 400]));
    const rest = makeFakeLeaf('rest', dna([1, 40, 0, 400, 400]));
    (owner as any).layers = [edge, rest];

    // A target whose rotation-aware counterpart overlaps a *different*
    // region than the raw target (same setup as the test above, where both
    // leaves end up selected) -- the case most likely to double-select if
    // the old two-pass approach were still in use.
    const target = dna([1, 0, 0, 40, 400]);
    const result = owner.getAllPointsAt(target, dna([1, 0, 0, 0, 0, 1, 0, 0, 1]), 1);

    const selectedLabels = result.filter(([, points]: any) => isSelected(points)).map(([leaf]: any) => leaf.label);
    const uniqueLabels = new Set(selectedLabels);
    expect(selectedLabels.length).toBe(uniqueLabels.size);
  });
});
