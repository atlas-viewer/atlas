import {
  getNavigatorWorldRegion,
  getNavigatorWorldTransform,
  navigatorToWorldPoint,
} from '../../modules/navigator-renderer/navigator-renderer';

describe('Navigator transform helpers', () => {
  test('centers world content when aspect ratios do not match', () => {
    const transform = getNavigatorWorldTransform(1000, 500, 100, 100);

    expect(transform.scale).toBeCloseTo(0.1, 6);
    expect(transform.offsetX).toBeCloseTo(0, 6);
    expect(transform.offsetY).toBeCloseTo(25, 6);
  });

  test('maps navigator space to clamped world space', () => {
    const transform = getNavigatorWorldTransform(200, 100, 100, 50);

    const center = navigatorToWorldPoint(transform, 50, 25);
    expect(center.x).toBeCloseTo(100, 6);
    expect(center.y).toBeCloseTo(50, 6);

    const outside = navigatorToWorldPoint(transform, -20, 80);
    expect(outside.x).toBe(0);
    expect(outside.y).toBe(100);
  });

  test('supports world regions with non-zero origin', () => {
    const transform = getNavigatorWorldTransform(300, 200, 150, 100, 1000, 500);
    const center = navigatorToWorldPoint(transform, 75, 50);
    expect(center.x).toBeCloseTo(1150, 6);
    expect(center.y).toBeCloseTo(600, 6);
  });

  test('prefers active zone as navigator world region', () => {
    const world: any = {
      width: 2000,
      height: 4000,
      getActiveZone: () => ({
        points: [1, 300, 600, 1300, 2600],
        recalculateBounds: () => {},
      }),
    };

    const region = getNavigatorWorldRegion(world);
    expect(region).toEqual({ x: 300, y: 600, width: 1000, height: 2000 });
  });
});
