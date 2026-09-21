import { dna, hidePointsOutsideRegion, Strand } from '@atlas-viewer/dna';
import { World } from '../../world';
import { WorldObject } from '../../world-objects/world-object';

// Regression fixture for the second half of the bug
// world-far-rotated-object-selection.test.ts fixes -- the half that fix
// exposed. World#forceIncludeRotatedObjects keeps a rotated top-level
// object in the candidate list even when its raw bounds miss target, so
// that the object's own getAllPointsAt can make the real decision. It then
// made the wrong one, twice over:
//
//   1. it intersected target against `this.points`, which for a
//      pivot-compensated subtree no longer says where the content is (see
//      WorldObject#selectionBounds) -- so a canvas that was genuinely,
//      visibly on screen got an *empty* intersection at the very first
//      level; and
//   2. that empty strand didn't stay empty: it gets translated into each
//      child's coordinate space on the way down, rotating an empty region
//      around a distant pivot *moves* it, and the union of where it was and
//      where it moved to is a real rectangle again -- so two levels down,
//      a region nobody computed on purpose got clipped against the rotated
//      wrapper's bounds and selected a couple of tiles.
//
// Which is exactly the reported symptom: the canvas painted, but from the
// wrong two tiles out of its grid, so it showed as a smeared low-resolution
// band rather than as missing content.
//
// Every number below is measured, not invented -- captured from
// stories/sequence-panel.stories.tsx's "setup test2" (rotate from world
// center, zoom in, drag twice) by instrumenting getAllPointsAt and
// CanvasRenderer#paint in the browser at the moment the second canvas was
// painting blurry: two 2411x3372 canvases 40 units apart, the whole tree
// pivot-compensated by -601 on both axes, viewport 1248x512 onto world
// target [1217,1430 -> 2442,1942], rotated 90 degrees about the viewport
// centre. The far canvas's top-level object still claimed x 2451..4862
// while its tiles were painting from x 1850.

const ROTATION = 90;
const CANVAS_WIDTH = 2411;
const CANVAS_HEIGHT = 3372;
// Runtime#syncRotationPivotPosition applies this to the rotated node only
// -- the nested wrapper -- leaving every ancestor's bounds behind.
const COMPENSATION = -601;
const COLS = 3;
const ROWS = 4;

const TARGET = dna([1, 1217, 1430, 2442, 1942]);
// The live viewport centre, which is what the pivot tracks while idle.
const PIVOT = { x: (TARGET[1] + TARGET[3]) / 2, y: (TARGET[2] + TARGET[4]) / 2 };

const AGGREGATE = dna([1, 0, 0, 0, 0, 1, 0, 0, 1]);

function makeGridLeaf(label: string, width: number, height: number) {
  const points = dna(COLS * ROWS * 5);
  const tileWidth = width / COLS;
  const tileHeight = height / ROWS;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const i = (row * COLS + col) * 5;
      points[i] = 1;
      points[i + 1] = col * tileWidth;
      points[i + 2] = row * tileHeight;
      points[i + 3] = (col + 1) * tileWidth;
      points[i + 4] = (row + 1) * tileHeight;
    }
  }
  return {
    label,
    points,
    // Mirrors TiledImage#getAllPointsAt exactly.
    getAllPointsAt(target: Strand, aggregate?: Strand) {
      return [[this, hidePointsOutsideRegion(points, target), aggregate]];
    },
  } as any;
}

/**
 * The tree shape a IIIF canvas actually renders as, as captured from the
 * story: a plain top-level <world-object>, a plain wrapper inside it, then
 * ImageService's own nested wrapper -- the only rotated node, and so the
 * only one Runtime pivot-compensates -- holding the tile grid.
 */
function makeCanvas(id: string, worldX: number) {
  const leaf = makeGridLeaf(`${id}-tiles`, CANVAS_WIDTH, CANVAS_HEIGHT);

  const rotated = WorldObject.createWithProps({
    id: `${id}-rotated`,
    x: COMPENSATION,
    y: COMPENSATION,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    rotation: ROTATION,
  });
  (rotated as any).layers = [leaf];

  const inner = WorldObject.createWithProps({ id: `${id}-inner`, x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  (inner as any).layers = [rotated];

  const outer = WorldObject.createWithProps({ id, x: worldX, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  (outer as any).layers = [inner];

  // Runtime#updateWorldObjectRotationPivots writes the shared world pivot
  // onto every node, expressed in that node's own local frame.
  outer.rotationPivot = { x: PIVOT.x, y: PIVOT.y };
  inner.rotationPivot = { x: PIVOT.x - worldX, y: PIVOT.y };
  rotated.rotationPivot = { x: PIVOT.x - worldX, y: PIVOT.y };

  // Where this canvas's tiles are really painted, in world coordinates:
  // the compensation offset is not reflected in `outer.points`.
  const contentX = worldX + COMPENSATION;
  const contentY = COMPENSATION;

  return { outer, inner, rotated, leaf, contentX, contentY };
}

/**
 * The world region genuinely on screen once the post-hoc render rotation is
 * applied: the viewport rotated back around the pivot. Computed here from
 * first principles for the one angle this fixture uses -- a 90 degree turn
 * about a point keeps the centre and swaps width for height -- rather than
 * by calling applyRotation, so this is an independent check rather than the
 * code agreeing with itself.
 */
function visibleWorldRegion() {
  const halfWidth = (TARGET[3] - TARGET[1]) / 2;
  const halfHeight = (TARGET[4] - TARGET[2]) / 2;
  return {
    x1: PIVOT.x - halfHeight,
    y1: PIVOT.y - halfWidth,
    x2: PIVOT.x + halfHeight,
    y2: PIVOT.y + halfWidth,
  };
}

/** Indices of the grid tiles overlapping `region`, in leaf-local coordinates. */
function tilesOverlapping(leaf: any, x1: number, y1: number, x2: number, y2: number) {
  const overlapping: number[] = [];
  for (let i = 0; i < leaf.points.length; i += 5) {
    if (leaf.points[i + 1] < x2 && leaf.points[i + 3] > x1 && leaf.points[i + 2] < y2 && leaf.points[i + 4] > y1) {
      overlapping.push(i / 5);
    }
  }
  return overlapping;
}

/** Indices of the grid tiles a selection pass actually kept. */
function selectedTiles(result: any[], label: string) {
  const selected: number[] = [];
  for (const [leaf, points] of result) {
    if (leaf.label !== label) continue;
    for (let i = 0; i < points.length; i += 5) {
      if (points[i] !== 0) selected.push(i / 5);
    }
  }
  return selected;
}

describe('selection survives a pivot-compensated subtree, and an empty selection stays empty', () => {
  test('both rotated canvases select every tile that is physically on screen', () => {
    const world = new World();
    const near = makeCanvas('near', 0);
    // 2451 = the second canvas's world x. Its raw bounds (2451..4862) miss
    // the target entirely; its content (1850..4261) does not.
    const far = makeCanvas('far', 2451);
    world.appendChild(near.outer);
    world.appendChild(far.outer);

    const result = world.getPointsAt(TARGET, AGGREGATE, 1);
    const visible = visibleWorldRegion();

    for (const canvas of [near, far]) {
      // The visible region in this canvas's own leaf coordinates.
      const expected = tilesOverlapping(
        canvas.leaf,
        visible.x1 - canvas.contentX,
        visible.y1 - canvas.contentY,
        visible.x2 - canvas.contentX,
        visible.y2 - canvas.contentY
      );
      // Both canvases really are partly on screen here -- if this ever
      // stops holding, the fixture has drifted and the rest of the test
      // would be vacuous.
      expect(expected.length).toBeGreaterThan(0);

      const selected = selectedTiles(result, canvas.leaf.label);
      for (const tile of expected) {
        expect(selected).toContain(tile);
      }
    }
  });

  test('the far canvas is not reduced to a stray tile or two at one edge', () => {
    // The specific pre-fix failure, stated as its own guard: the far canvas
    // did paint -- from the sliver an empty region left behind after being
    // rotated back into existence -- but from the wrong end of its grid,
    // missing most of what was on screen. Selecting *something* is not the
    // bar; selecting what's actually visible is.
    const world = new World();
    const far = makeCanvas('far', 2451);
    world.appendChild(far.outer);

    const visible = visibleWorldRegion();
    const expected = tilesOverlapping(
      far.leaf,
      visible.x1 - far.contentX,
      visible.y1 - far.contentY,
      visible.x2 - far.contentX,
      visible.y2 - far.contentY
    );
    const selected = selectedTiles(world.getPointsAt(TARGET, AGGREGATE, 1), 'far-tiles');

    expect(selected.length).toBeGreaterThanOrEqual(expected.length);
    expect(selected.sort()).toEqual(expect.arrayContaining(expected));
  });

  test('an already-empty target is never widened back into a real region', () => {
    // The resurrection step in isolation: an unrotated node whose
    // *descendant* carries the rotation (so it does widen -- see
    // selectionRotation) is handed getIntersection's own "these boxes miss
    // each other" strand by its parent.
    const owner = WorldObject.createWithProps({ id: 'owner', x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
    const rotated = WorldObject.createWithProps({
      id: 'rotated',
      x: 0,
      y: 0,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      rotation: ROTATION,
    });
    const leaf = makeGridLeaf('tiles', CANVAS_WIDTH, CANVAS_HEIGHT);
    (rotated as any).layers = [leaf];
    (owner as any).layers = [rotated];
    // A pivot outside the empty region, which is what makes rotating it
    // move the region somewhere else rather than leave it in place.
    const pivot = { x: -621, y: 1686 };
    owner.rotationPivot = { ...pivot };
    rotated.rotationPivot = { ...pivot };

    const emptyTarget = dna([0, 0, 0, 0, 0]);

    expect(selectedTiles(owner.getAllPointsAt(emptyTarget, AGGREGATE, 1), 'tiles')).toEqual([]);
  });

  test('a target touching the object exactly along one edge selects nothing', () => {
    // getIntersection's overlap test is inclusive, so an edge-touch comes
    // back flagged as a real intersection -- with zero area. Nothing can be
    // visible in it, and it must not be widened back into a real region
    // either.
    const owner = WorldObject.createWithProps({
      id: 'owner',
      x: 0,
      y: 0,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      rotation: ROTATION,
    });
    (owner as any).layers = [makeGridLeaf('tiles', CANVAS_WIDTH, CANVAS_HEIGHT)];
    owner.rotationPivot = { x: 5000, y: 3000 };

    const edgeTouch = dna([1, CANVAS_WIDTH, 1000, CANVAS_WIDTH, 2000]);

    expect(selectedTiles(owner.getAllPointsAt(edgeTouch, AGGREGATE, 1), 'tiles')).toEqual([]);
  });

  test('selectionBounds covers a pivot-compensated descendant, and is inert without one', () => {
    const compensated = makeCanvas('compensated', 2451);
    expect(Array.from(compensated.outer.selectionBounds())).toEqual([
      1,
      2451 + COMPENSATION,
      COMPENSATION,
      2451 + CANVAS_WIDTH,
      CANVAS_HEIGHT,
    ]);

    const plain = WorldObject.createWithProps({ id: 'plain', x: 10, y: 20, width: 100, height: 200 });
    const child = WorldObject.createWithProps({ id: 'child', x: 0, y: 0, width: 100, height: 200 });
    (plain as any).layers = [child];
    expect(Array.from(plain.selectionBounds())).toEqual(Array.from(plain.points));
  });
});
