/** @vitest-environment happy-dom */

import { describe, expect, test, vi } from 'vitest';
import { CanvasRenderer } from '../../modules/canvas-renderer/canvas-renderer';
import { SingleImage } from '../../spacial-content/single-image';
import { isWebGLImageFastPathCandidate } from '../../modules/webgl-renderer/webgl-eligibility';

function createImage(id: string, props: Partial<{ crop: { x: number; y: number; width: number; height: number } }> = {}) {
  const image = new SingleImage();
  image.applyProps({
    id,
    uri: `https://example.com/${id}.jpg`,
    target: { width: 100, height: 100 },
    display: { width: 100, height: 100 },
    ...(props.crop ? { crop: props.crop } : {}),
  });
  return image;
}

describe('CanvasRenderer routing controls', () => {
  test('shouldPaintImage can delegate eligible images away from canvas', () => {
    const context = {
      imageSmoothingEnabled: true,
      globalAlpha: 1,
      filter: 'none',
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      stroke: vi.fn(),
      fill: vi.fn(),
      strokeRect: vi.fn(),
    } as any;
    const canvas = {
      width: 256,
      height: 256,
      style: { transition: '', opacity: '1' },
      dataset: {},
      getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, width: 256, height: 256 }),
      getContext: vi.fn(() => context),
    } as any as HTMLCanvasElement;

    const renderer = new CanvasRenderer(canvas, {
      readiness: 'immediate',
      paintImages: true,
      shouldPaintImage: (paint, index) => !isWebGLImageFastPathCandidate(paint, index),
    });
    const scheduleSpy = vi.spyOn(renderer, 'schedulePaintToCanvas').mockImplementation(() => {
      // no-op
    });

    const delegatedToWebGL = createImage('fast-path');
    const forcedToCanvas = createImage('cropped', { crop: { x: 1, y: 1, width: 50, height: 50 } });

    renderer.prepareLayer(delegatedToWebGL, delegatedToWebGL.points);
    renderer.paint(delegatedToWebGL, 0, 0, 0, 100, 100);
    expect(scheduleSpy).not.toHaveBeenCalled();

    renderer.prepareLayer(forcedToCanvas, forcedToCanvas.points);
    renderer.paint(forcedToCanvas, 0, 0, 0, 100, 100);
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
  });
});
