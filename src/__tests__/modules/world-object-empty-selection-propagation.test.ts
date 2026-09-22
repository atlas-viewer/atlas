import { dna, hidePointsOutsideRegion, Strand } from '@atlas-viewer/dna';
import { WorldObject } from '../../world-objects/world-object';

const ROTATION = 90;
const CANVAS_WIDTH = 2411;
const CANVAS_HEIGHT = 3372;
const OFFSET = -601;
const COLS = 3;
const ROWS = 4;

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
    getAllPointsAt(target: Strand, aggregate?: Strand) {
      return [[this, hidePointsOutsideRegion(points, target), aggregate]];
    },
  } as any;
}

// Nested content may extend outside its ancestors.
function makeCanvas(id: string, worldX: number) {
  const leaf = makeGridLeaf(`${id}-tiles`, CANVAS_WIDTH, CANVAS_HEIGHT);

  const rotated = WorldObject.createWithProps({
    id: `${id}-rotated`,
    x: OFFSET,
    y: OFFSET,
    width: CANVAS_WIDTH,
    height: CANVAS_HEIGHT,
    rotation: ROTATION,
  });
  (rotated as any).layers = [leaf];

  const inner = WorldObject.createWithProps({ id: `${id}-inner`, x: 0, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  (inner as any).layers = [rotated];

  const outer = WorldObject.createWithProps({ id, x: worldX, y: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  (outer as any).layers = [inner];
  const contentX = worldX + OFFSET;
  const contentY = OFFSET;

  return { outer, inner, rotated, leaf, contentX, contentY };
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

describe('selection survives a offset subtree, and an empty selection stays empty', () => {
  test('an already-empty target is never widened back into a real region', () => {
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

    const emptyTarget = dna([0, 0, 0, 0, 0]);

    expect(selectedTiles(owner.getAllPointsAt(emptyTarget, AGGREGATE, 1), 'tiles')).toEqual([]);
  });

  test('a target touching the object exactly along one edge selects nothing', () => {
    const owner = WorldObject.createWithProps({
      id: 'owner',
      x: 0,
      y: 0,
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      rotation: ROTATION,
    });
    (owner as any).layers = [makeGridLeaf('tiles', CANVAS_WIDTH, CANVAS_HEIGHT)];

    const edgeTouch = dna([1, CANVAS_WIDTH, 1000, CANVAS_WIDTH, 2000]);

    expect(selectedTiles(owner.getAllPointsAt(edgeTouch, AGGREGATE, 1), 'tiles')).toEqual([]);
  });

  test('selectionBounds covers a offset descendant, and is inert without one', () => {
    const compensated = makeCanvas('compensated', 2451);
    expect(Array.from(compensated.outer.selectionBounds())).toEqual([
      1,
      2451 + OFFSET,
      OFFSET,
      2451 + CANVAS_WIDTH,
      CANVAS_HEIGHT,
    ]);

    const plain = WorldObject.createWithProps({ id: 'plain', x: 10, y: 20, width: 100, height: 200 });
    const child = WorldObject.createWithProps({ id: 'child', x: 0, y: 0, width: 100, height: 200 });
    (plain as any).layers = [child];
    expect(Array.from(plain.selectionBounds())).toEqual(Array.from(plain.points));
  });
});
