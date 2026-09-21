import { dna, hidePointsOutsideRegion, Strand } from '@atlas-viewer/dna';
import { WorldObject } from '../../world-objects/world-object';
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
