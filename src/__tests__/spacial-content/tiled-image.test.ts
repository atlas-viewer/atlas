import { TiledImage } from '../../spacial-content/index';
import { DnaFactory } from '@atlas-viewer/dna';

describe('TiledImage', () => {
  test('it can construct', () => {
    const image = TiledImage.fromTile(
      'https://example.org/tiled-image',
      { width: 100, height: 200 },
      { width: 50, height: 50 },
      1
    );

    expect(image.points).toEqual(
      DnaFactory.grid(2, 4)
        .row((r) => r.addBox(0, 0, 50, 50).addBox(50, 0, 50, 50))
        .row((r) => r.addBox(0, 50, 50, 50).addBox(50, 50, 50, 50))
        .row((r) => r.addBox(0, 100, 50, 50).addBox(50, 100, 50, 50))
        .row((r) => r.addBox(0, 150, 50, 50).addBox(50, 150, 50, 50))
        .build()
    );
    expect(image.display.scale).toEqual(1);
  });

  test('it can construct scaled instance', () => {
    const image = TiledImage.fromTile(
      'https://example.org/tiled-image',
      { width: 200, height: 400 },
      { width: 50, height: 50 },
      2
    );

    expect(image.display.points).toEqual(
      DnaFactory.grid(2, 4)
        .row((r) => r.addBox(0, 0, 50, 50).addBox(50, 0, 50, 50))
        .row((r) => r.addBox(0, 50, 50, 50).addBox(50, 50, 50, 50))
        .row((r) => r.addBox(0, 100, 50, 50).addBox(50, 100, 50, 50))
        .row((r) => r.addBox(0, 150, 50, 50).addBox(50, 150, 50, 50))
        .build()
    );
    expect(image.display.scale).toEqual(2);
  });

  test('v3 URL uses width and height constraints for rectangular tiles', () => {
    const image = TiledImage.fromTile(
      'https://example.org/tiled-image',
      { width: 1024, height: 1024 },
      { width: 512, height: 256 },
      1,
      undefined,
      'jpg',
      undefined,
      true
    );

    expect(image.getImageUrl(0)).toContain('/512,256/0/default.jpg');
  });

  test('default id includes tile profile to avoid collisions', () => {
    const a = TiledImage.fromTile(
      'https://example.org/tiled-image',
      { width: 1024, height: 1024 },
      { width: 256, height: 256 },
      2
    );
    const b = TiledImage.fromTile(
      'https://example.org/tiled-image',
      { width: 1024, height: 1024 },
      { width: 512, height: 512 },
      2
    );

    expect(a.id).not.toEqual(b.id);
    expect(a.columns).toBeGreaterThan(0);
    expect(a.rows).toBeGreaterThan(0);
  });
});

describe('massive IIIF pyramids', () => {
  const width = 134217728;
  const create = (factor = 1, dimensions = { width, height: width }) =>
    TiledImage.fromTile('https://example.org/osm', dimensions, { width: 256 }, factor, undefined, 'jpg', false, true);

  test('constructs all 20 levels without allocating the full grid', () => {
    const levels = Array.from({ length: 20 }, (_, level) => create(2 ** level));
    expect(levels[0].columns * levels[0].rows).toBe(274877906944);
    expect(levels.reduce((sum, image) => sum + image.points.length / 5, 0)).toBe(341);
    expect(levels[0].display.width).toBe(width);
    expect(levels[0].getImageUrl(0)).toBe('https://example.org/osm/0,0,256,256/256,256/0/default.jpg');
    expect(levels[0].getAllPointsAt(DnaFactory.singleBox(width, width))).toEqual([]);
  });

  test('selects native-resolution tiles, reuses the margin and releases old hosts on distant pans', () => {
    const image = create();
    const target = DnaFactory.singleBox(1024, 768, 100000000, 80000000);
    const paints = image.getAllPointsAt(target);
    expect(paints).toHaveLength(1);
    expect(image.points.length / 5).toBeLessThan(100);
    const visible = [];
    for (let i = 0; i < paints[0][1].length; i += 5) {
      if (paints[0][1][i]) visible.push(image.getImageUrl(i / 5));
    }
    expect(visible).toHaveLength(12);
    expect(visible[0]).toBe('https://example.org/osm/100000000,80000000,256,256/256,256/0/default.jpg');
    const points = image.points;
    const canvasDispose = vi.fn();
    const webglDispose = vi.fn();
    image.__host = { canvas: { dispose: canvasDispose }, webgl: { dispose: webglDispose } };
    image.getAllPointsAt(DnaFactory.singleBox(1024, 768, 100000128, 80000128));
    expect(image.points).toBe(points);
    expect(canvasDispose).not.toHaveBeenCalled();
    image.getAllPointsAt(DnaFactory.singleBox(1024, 768, 20000000, 30000000));
    expect(canvasDispose).toHaveBeenCalledOnce();
    expect(webglDispose).toHaveBeenCalledOnce();
    expect(image.__host).toBeUndefined();
    expect(image.points).not.toBe(points);
    expect(image.getImageUrl(0)).not.toContain('/99999488,');
  });

  test('keeps exact partial edge URLs beyond float32 integer precision', () => {
    const image = create(2, { width: width - 1, height: width - 3 });
    image.getAllPointsAt(DnaFactory.singleBox(1024, 1024, width - 1024, width - 1024));
    const last = image.points.length / 5 - 1;
    expect(image.getImageUrl(last)).toBe('https://example.org/osm/134217216,134217216,511,509/256,255/0/default.jpg');
    expect(image.getAllPointsAt(DnaFactory.singleBox(100, 100, -200, -200))).toEqual([]);
  });

  test('keeps repeated pans bounded and supports cropped source coordinates', () => {
    const image = create();
    image.applyProps({ crop: { x: 100000000, y: 80000000, width: 10000, height: 10000 } });
    const paint = image.getAllPointsAt(DnaFactory.singleBox(512, 512))[0];
    expect(Array.from(paint[1]).some((value, index) => index % 5 === 0 && value === 1)).toBe(true);
    for (let i = 0; i < 200; i++) {
      image.getAllPointsAt(DnaFactory.singleBox(512, 512, i * 32, i * 16));
      expect(image.points.length / 5).toBeLessThan(100);
    }
  });

  test.each([0, -1, NaN, Infinity])('rejects invalid tile dimensions: %s', (size) => {
    expect(() => TiledImage.fromTile('https://example.org', { width, height: width }, { width: size }, 1)).toThrow();
  });
});
