import { getNavigatorWorldTransform, navigatorToWorldPoint } from '../../modules/navigator-renderer/navigator-renderer';

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
});
