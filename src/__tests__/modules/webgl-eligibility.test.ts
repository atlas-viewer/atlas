import { describe, expect, test } from 'vitest';
import { SingleImage } from '../../spacial-content/single-image';
import { ImageTexture } from '../../spacial-content/image-texture';
import { isWebGLImageFastPathCandidate } from '../../modules/webgl-renderer/webgl-eligibility';

describe('WebGL fast-path eligibility', () => {
  test('accepts plain single images', () => {
    const image = new SingleImage();
    image.applyProps({
      uri: 'https://example.com/a.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
    });

    expect(isWebGLImageFastPathCandidate(image, 0)).toBe(true);
  });

  test('rejects cropped, rotated, transparent, or owner-rotated images', () => {
    const cropped = new SingleImage();
    cropped.applyProps({
      uri: 'https://example.com/a.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
      crop: { x: 1, y: 1, width: 10, height: 10 },
    });
    expect(isWebGLImageFastPathCandidate(cropped, 0)).toBe(false);

    const rotated = new SingleImage();
    rotated.applyProps({
      uri: 'https://example.com/a.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100, rotation: 10 },
    });
    expect(isWebGLImageFastPathCandidate(rotated, 0)).toBe(false);

    const transparent = new SingleImage();
    transparent.applyProps({
      uri: 'https://example.com/a.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
      style: { opacity: 0.5 },
    });
    expect(isWebGLImageFastPathCandidate(transparent, 0)).toBe(false);

    const ownerRotated = new SingleImage();
    ownerRotated.applyProps({
      uri: 'https://example.com/a.jpg',
      target: { width: 100, height: 100 },
      display: { width: 100, height: 100 },
    });
    ownerRotated.__owner.value = { rotation: 15 } as any;
    expect(isWebGLImageFastPathCandidate(ownerRotated, 0)).toBe(false);
  });

  test('rejects non-image spatial content', () => {
    const texture = new ImageTexture();
    texture.applyProps({
      id: 'texture-1',
      target: { width: 100, height: 100 },
      getTexture: () => ({ source: undefined, hash: 1 }),
    });

    expect(isWebGLImageFastPathCandidate(texture as any, 0)).toBe(false);
  });
});
