import { GcpTransformer } from '@allmaps/transform';
import {
  createWarpTransformer,
  fromAllmapsTransformer,
  isAffineWarpType,
  WarpTransformError,
} from '../../../modules/maps/warped/transformer';
import type { WarpControlPoint, WarpTransformationType } from '../../../modules/maps/warped/types';
import { latitudeToMercatorY, longitudeToMercatorX } from '../../../modules/maps/projection';

// A 1000x700 image, georeferenced onto a slightly rotated / skewed patch of New York.
const controlPoints: WarpControlPoint[] = [
  { image: { x: 0, y: 0 }, map: { lng: -74.08, lat: 40.9 } },
  { image: { x: 1000, y: 0 }, map: { lng: -73.85, lat: 40.88 } },
  { image: { x: 1000, y: 700 }, map: { lng: -73.86, lat: 40.7 } },
  { image: { x: 0, y: 700 }, map: { lng: -74.1, lat: 40.72 } },
  { image: { x: 500, y: 350 }, map: { lng: -73.97, lat: 40.8 } },
  { image: { x: 250, y: 100 }, map: { lng: -74.03, lat: 40.87 } },
];

const samples: Array<[number, number]> = [
  [100, 100],
  [500, 350],
  [900, 650],
  [250, 600],
  [750, 120],
];

function distanceInMeters(a: [number, number], b: [number, number]) {
  const toMeters = 40075016.68;
  const ax = longitudeToMercatorX(a[0]) * toMeters;
  const ay = latitudeToMercatorY(a[1]) * toMeters;
  const bx = longitudeToMercatorX(b[0]) * toMeters;
  const by = latitudeToMercatorY(b[1]) * toMeters;
  return Math.hypot(ax - bx, ay - by);
}

describe('createWarpTransformer', () => {
  test('affine / polynomial1 are the same transformation', () => {
    const a = createWarpTransformer(controlPoints, 'affine');
    const b = createWarpTransformer(controlPoints, 'polynomial1');
    for (const [x, y] of samples) {
      expect(a.toGeo(x, y)[0]).toBeCloseTo(b.toGeo(x, y)[0], 10);
      expect(a.toGeo(x, y)[1]).toBeCloseTo(b.toGeo(x, y)[1], 10);
    }
  });

  test('thinPlateSpline passes exactly through the control points', () => {
    const transformer = createWarpTransformer(controlPoints, 'thinPlateSpline');
    for (const point of controlPoints) {
      const [lng, lat] = transformer.toGeo(point.image.x, point.image.y);
      expect(distanceInMeters([lng, lat], [point.map.lng, point.map.lat])).toBeLessThan(0.01);
    }
  });

  test('projective maps four points exactly', () => {
    const four = controlPoints.slice(0, 4);
    const transformer = createWarpTransformer(four, 'projective');
    for (const point of four) {
      const [lng, lat] = transformer.toGeo(point.image.x, point.image.y);
      expect(distanceInMeters([lng, lat], [point.map.lng, point.map.lat])).toBeLessThan(0.01);
    }
  });

  test('toResource inverts toGeo for exactly determined fits', () => {
    // With more points than a fit needs it is a least squares fit in each direction, and the two
    // directions are then not exact inverses of each other (the same is true in Allmaps).
    const minimal: Array<[WarpTransformationType, number, number]> = [
      ['helmert', 2, 0.05],
      ['affine', 3, 0.05],
      ['projective', 4, 0.05],
      // A TPS fitted backwards is an approximation of the forward TPS's inverse.
      ['thinPlateSpline', 6, 15],
    ];
    for (const [type, count, tolerance] of minimal) {
      const transformer = createWarpTransformer(controlPoints.slice(0, count), type);
      for (const [x, y] of samples) {
        const [lng, lat] = transformer.toGeo(x, y);
        const [rx, ry] = (transformer.toResource as (lng: number, lat: number) => [number, number])(lng, lat);
        expect(Math.hypot(rx - x, ry - y)).toBeLessThan(tolerance);
      }
    }
  });

  test('reports too few or degenerate control points', () => {
    expect(() => createWarpTransformer(controlPoints.slice(0, 2), 'affine')).toThrow(WarpTransformError);
    expect(() => createWarpTransformer(controlPoints.slice(0, 3), 'projective')).toThrow(/at least 4/);
    const collinear: WarpControlPoint[] = [0, 1, 2, 3].map((i) => ({
      image: { x: i * 100, y: i * 100 },
      map: { lng: -74 + i * 0.01, lat: 40.7 + i * 0.01 },
    }));
    expect(() => createWarpTransformer(collinear, 'affine')).toThrow(WarpTransformError);
  });

  test('classifies exactly affine transformation types', () => {
    expect(isAffineWarpType('helmert')).toBe(true);
    expect(isAffineWarpType('affine')).toBe(true);
    expect(isAffineWarpType('projective')).toBe(false);
    expect(isAffineWarpType('thinPlateSpline')).toBe(false);
  });
});

// Allmaps is the reference implementation: its transformations are done in Web Mercator, so we
// compare against it by giving it the same projected control points.
describe('agreement with @allmaps/transform', () => {
  const S = 40075016.68;
  const toProjected = (lng: number, lat: number): [number, number] => [
    longitudeToMercatorX(lng) * S,
    // Allmaps uses north-up geo space; our mercator y is south-down.
    -latitudeToMercatorY(lat) * S,
  ];
  const fromProjected = ([x, y]: [number, number]): [number, number] => {
    const mx = x / S;
    const my = -y / S;
    const lng = mx * 360 - 180;
    const n = Math.PI * (1 - 2 * my);
    const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));
    return [lng, lat];
  };

  // [type, allmaps type, number of control points, tolerance in metres]
  // Over-determined projective fits depend on the error being minimised (algebraic vs geometric),
  // so projective is compared on exactly four points. Allmaps solves it on raw metre coordinates, and
  // is off by metres at the control points themselves (see the exactness tests above, where ours is
  // exact), hence the looser tolerance - still ~0.1% of the 25km area covered.
  const cases: Array<[WarpTransformationType, string, number, number]> = [
    ['helmert', 'helmert', 6, 0.5],
    ['affine', 'polynomial', 6, 0.5],
    ['projective', 'projective', 4, 30],
    ['thinPlateSpline', 'thinPlateSpline', 6, 0.5],
  ];

  test.each(cases)('%s matches allmaps (%s)', (type, allmapsType, count, tolerance) => {
    const points = controlPoints.slice(0, count);
    const gcps = points.map((point) => ({
      resource: [point.image.x, point.image.y] as [number, number],
      geo: toProjected(point.map.lng, point.map.lat),
    }));
    const allmaps = new GcpTransformer(gcps as any, allmapsType as any);

    const ours = createWarpTransformer(points, type);
    const reference = fromAllmapsTransformer({
      transformToGeo: (point) => fromProjected(allmaps.transformToGeo(point) as [number, number]),
    });
    for (const [x, y] of samples) {
      expect(distanceInMeters(ours.toGeo(x, y), reference.toGeo(x, y))).toBeLessThan(tolerance);
    }
  });
});
