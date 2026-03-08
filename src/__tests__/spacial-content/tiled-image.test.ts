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
