import { dna, hidePointsOutsideRegion, Strand } from '@atlas-viewer/dna';
import { WorldObject } from '../../world-objects/world-object';
import { World } from '../../world';

test('appending a world object preserves visibility before any subsequent React update', () => {
  const world = new World(200, 100);
  const visible = WorldObject.createWithProps({ id: 'visible', width: 200, height: 100 });
  const hidden = WorldObject.createWithProps({ id: 'hidden', width: 200, height: 100 });
  hidden.points[0] = 0;
  world.appendChild(visible);
  world.appendChild(hidden);
  expect(visible.points[0]).toBe(1);
  expect(hidden.points[0]).toBe(0);
});
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
  test('a rotated object still exposes its content', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 0, y: 0, width: 200, height: 100, rotation: 87 });

    const leaf = makeFakeLeaf(dna([1, 0, 0, 200, 100]));
    (owner as any).layers = [leaf];
    const target = dna([1, 0, 0, 200, 100]);
    const aggregate = dna([1, 0, 0, 0, 0, 1, 0, 0, 1]);

    const result = owner.getAllPointsAt(target, aggregate, 1);

    expect(result.length).toBe(1);
    const [, points] = result[0];
    expect(points[0]).not.toBe(0);
  });

  test('a target that genuinely does not overlap the object is still culled', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 0, y: 0, width: 200, height: 100, rotation: 87 });

    const leaf = makeFakeLeaf(dna([1, 0, 0, 200, 100]));
    (owner as any).layers = [leaf];
    const target = dna([1, 10000, 10000, 10100, 10100]);
    const aggregate = dna([1, 0, 0, 0, 0, 1, 0, 0, 1]);

    const result = owner.getAllPointsAt(target, aggregate, 1);
    expect(result.length).toBe(0);
  });

  test('45-degree rotation also does not narrow culling based on rotation', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 0, y: 0, width: 200, height: 100, rotation: 45 });

    const leaf = makeFakeLeaf(dna([1, 0, 0, 200, 100]));
    (owner as any).layers = [leaf];

    const target = dna([1, 0, 0, 200, 100]);
    const aggregate = dna([1, 0, 0, 0, 0, 1, 0, 0, 1]);

    const result = owner.getAllPointsAt(target, aggregate, 1);
    expect(result.length).toBe(1);
    const [, points] = result[0];
    expect(points[0]).not.toBe(0);
  });
});
