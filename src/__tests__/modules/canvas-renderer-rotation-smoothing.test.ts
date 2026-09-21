/** @vitest-environment happy-dom */

import { CanvasRenderer, needsSmoothing } from '../../modules/canvas-renderer/canvas-renderer';
import { SingleImage } from '../../spacial-content/single-image';

// Regression test for a real reported bug: rotate the canvas (even a clean
// 90deg) while zoomed in to a tile's native resolution, and it visibly
// blurs -- even though the tile is already being drawn 1:1 (not
// under-resolved, the earlier "tile is blurry" bug). The cause: paint()'s
// destination x/y/width/height (and, for rotated content, the
// translate/rotate pivot) are raw floats from continuous pan/zoom/rotate
// math, never snapped to integer device pixels. With imageSmoothingEnabled
// left on unconditionally, that sub-pixel misalignment gets bilinearly
// resampled on every draw, softening a tile that's already at full
// resolution. needsSmoothing() (and paint()'s use of it) fixes this by only
// asking for smoothing when the draw is actually resizing the image.

describe('needsSmoothing', () => {
  test('an exact 1:1 draw does not need smoothing', () => {
    expect(needsSmoothing(512, 512, 512, 512)).toBe(false);
  });

  test('sub-pixel rounding slop (well under a device pixel) still counts as 1:1', () => {
    expect(needsSmoothing(363, 1024, 363.2, 1023.6)).toBe(false);
  });

  test('a genuinely upscaled draw needs smoothing to avoid blockiness', () => {
    expect(needsSmoothing(256, 256, 512, 512)).toBe(true);
  });

  test('a genuinely downscaled draw needs smoothing', () => {
    expect(needsSmoothing(1024, 1024, 512, 512)).toBe(true);
  });

  test('a custom tolerance is respected', () => {
    expect(needsSmoothing(500, 500, 504, 504, 5)).toBe(false);
    expect(needsSmoothing(500, 500, 504, 504, 2)).toBe(true);
  });
});

function createMockContext() {
  return {
    imageSmoothingEnabled: true,
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
  } as any;
}

// A real CanvasRenderer instance (not Object.create(...prototype) with a
// handful of manually-set fields) -- paint()'s current implementation
// reads a lot of constructor-initialized state on its way to the
// smoothing decision (requiredTileKeys, tileState, layer-activity/fade
// bookkeeping, ...), all wrapped in a try/catch that silently swallows any
// error from a field a partial mock forgot -- which reads as "smoothing
// was never touched, still whatever the mock ctx started at" rather than
// a helpful failure. Matches canvas-image-loading.test.ts's own
// createRenderer pattern.
function createRenderer() {
  const context = createMockContext();
  const canvas = {
    width: 1000,
    height: 1000,
    style: { transition: '', opacity: '1' },
    dataset: {},
    getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, width: 1000, height: 1000 }),
    getContext: vi.fn(() => context),
  } as any as HTMLCanvasElement;
  return { renderer: new CanvasRenderer(canvas, { readiness: 'immediate' }), context };
}

// A real SingleImage instance (not a plain object) so `paint instanceof
// SingleImage` passes -- paint()'s smoothing/drawImage branch is gated on
// that check. Set up as already fully decoded and hosted (via
// prepareLayer's own real host creation, then marking that single tile
// 'decoded' with a canvas already in hostCache) so paint() takes the
// existing-image draw path directly, without needing to also drive
// schedulePaintToCanvas's async load pipeline just to test the smoothing
// decision.
function makeSingleImagePaint(renderer: CanvasRenderer, sourceWidth: number, sourceHeight: number, canvasToPaintKey: string) {
  const paint = new SingleImage({ uri: `https://example.org/${canvasToPaintKey}.jpg`, width: sourceWidth, height: sourceHeight });
  renderer.prepareLayer(paint, paint.points);
  const buffer = (paint as any).__host.canvas;
  buffer.canvases[0] = canvasToPaintKey;
  buffer.tiles = { 0: { state: 'decoded', loadedAt: performance.now() } };
  renderer.hostCache.set(canvasToPaintKey, { fake: 'canvas' } as any);
  return paint;
}

describe('CanvasRenderer#paint imageSmoothingEnabled', () => {
  test('drawing a tile at its native resolution (1:1) disables smoothing', () => {
    const { renderer, context } = createRenderer();
    const paint = makeSingleImagePaint(renderer, 363, 1024, 'tile-0');

    // Destination width/height match the tile's own source size exactly --
    // the same shape as an already-at-native-resolution tile drawn through
    // a rotated world.
    renderer.paint(paint, 0, 10, 20, 363, 1024);

    expect(context.imageSmoothingEnabled).toBe(false);
  });

  test('drawing a tile that is genuinely upscaled keeps smoothing on', () => {
    const { renderer, context } = createRenderer();
    const paint = makeSingleImagePaint(renderer, 256, 256, 'tile-0');

    // Destination is 2x the tile's own source size -- e.g. a lower
    // pyramid-level tile stretched to fill more screen space than it has
    // detail for, which still wants bilinear filtering to avoid a blocky look.
    renderer.paint(paint, 0, 10, 20, 512, 512);

    expect(context.imageSmoothingEnabled).toBe(true);
  });

  test('the smoothing flag is re-decided per draw, not stuck from a previous tile', () => {
    const { renderer, context } = createRenderer();

    const upscaled = makeSingleImagePaint(renderer, 256, 256, 'tile-a');
    renderer.paint(upscaled, 0, 0, 0, 512, 512);
    expect(context.imageSmoothingEnabled).toBe(true);

    const native = makeSingleImagePaint(renderer, 363, 1024, 'tile-b');
    renderer.paint(native, 0, 0, 0, 363, 1024);
    expect(context.imageSmoothingEnabled).toBe(false);
  });
});
