/** @vitest-environment happy-dom */

import { dna } from '@atlas-viewer/dna';
import { CanvasRenderer, ImageStretchDebugEvent, isImageStretched } from '../../modules/canvas-renderer/canvas-renderer';

// Detects a distinct failure mode from the rotation blur fix: a tile whose
// *loaded* image doesn't share the target canvas's aspect ratio gets
// drawImage()'d into it anyway (schedulePaintToCanvas always does
// `ctx.drawImage(image, 0, 0, targetWidth, targetHeight)`, with no check
// that the image is actually shaped to fit) -- the tile then renders
// visibly stretched or squashed, not just blurry. This can happen when an
// image server ignores/misreads requested crop or size parameters and
// returns something a different shape than what was asked for.

describe('isImageStretched', () => {
  test('identical dimensions are not stretched', () => {
    expect(isImageStretched(512, 512, 512, 512)).toBe(false);
  });

  test('same aspect ratio at a different absolute size is not stretched (just softer/sharper, uniform scaling)', () => {
    // A server returning e.g. 1023px for a requested 1024px (common
    // off-by-one rounding) scales uniformly -- no visible distortion.
    expect(isImageStretched(1023, 768, 1024, 768.75)).toBe(false);
    expect(isImageStretched(256, 256, 1024, 1024)).toBe(false);
  });

  test('a meaningfully different aspect ratio is stretched', () => {
    // Target wants a 2:1 tile; the loaded image is square -- drawImage will
    // squash it vertically to fit, visibly distorting it.
    expect(isImageStretched(512, 512, 1024, 512)).toBe(true);
  });

  test('a small aspect-ratio drift within tolerance is not flagged, and just outside it is', () => {
    // 400x300 (ratio 1.3333) vs 400x298 (ratio ~1.3423), a ~0.67% drift.
    expect(isImageStretched(400, 300, 400, 298)).toBe(false);
    // 400x300 vs 400x260 (ratio ~1.5385) is well outside 1%.
    expect(isImageStretched(400, 300, 400, 260)).toBe(true);
  });

  test('missing/zero dimensions (e.g. image not yet decoded) are never flagged', () => {
    expect(isImageStretched(0, 0, 512, 512)).toBe(false);
    expect(isImageStretched(512, 512, 0, 0)).toBe(false);
  });
});

// Fake `paint` shaped like the parts of SingleImage/TiledImage that
// schedulePaintToCanvas actually touches, avoiding a real network image
// load or a full SingleImage/TiledImage instance -- schedulePaintToCanvas
// itself takes imageBuffer as an explicit argument rather than reading it
// off paint.__host, so this doesn't need prepareLayer()/a real host either.
function makeFakePaint(targetWidth: number, targetHeight: number, x = 0, y = 0) {
  return {
    id: 'fake-paint',
    display: {
      scale: 1,
      // A single "tile" covering (x,y)-(x+targetWidth,y+targetHeight).
      points: dna([1, x, y, x + targetWidth, y + targetHeight]),
    },
    getImageUrl(index: number) {
      return `https://example.org/fake-image/${index}`;
    },
  } as any;
}

function createMockContext() {
  return {
    imageSmoothingEnabled: true,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
  } as any;
}

// A real CanvasRenderer instance (not Object.create(...prototype) with a
// handful of manually-set fields) -- schedulePaintToCanvas's current
// implementation depends on a lot of constructor-initialized state
// (requiredTileKeys, imageRequestPool, imageLoadingConfig, ...) that a
// partial mock would have to reproduce by hand, and diverge from silently
// the next time that implementation changes.
function createRenderer() {
  const context = createMockContext();
  const canvas = {
    width: 256,
    height: 256,
    style: { transition: '', opacity: '1' },
    dataset: {},
    getBoundingClientRect: () => ({ x: 0, y: 0, top: 0, left: 0, width: 256, height: 256 }),
    getContext: vi.fn(() => context),
  } as any as HTMLCanvasElement;
  return { renderer: new CanvasRenderer(canvas, { readiness: 'immediate' }), context };
}

// Drives schedulePaintToCanvas's two-stage loading queue synchronously:
// mocks imageRequestPool.acquire (real schedulePaintToCanvas's actual
// network path) to resolve with `fakeImage`, pops and awaits the network
// task, then pops the decode task and runs its queued drawCalls entry --
// mirroring canvas-image-loading.test.ts's own established pattern for
// driving this same queue. `beforeDraw` runs after the tile has started
// loading but before it's actually drawn -- e.g. to remove it from
// `renderer.visible`, simulating it scrolling off screen while still in
// flight.
async function runSchedulePaintToCanvas(
  fakeImage: { naturalWidth: number; naturalHeight: number },
  paint: any,
  beforeDraw?: (renderer: any) => void
) {
  const { renderer } = createRenderer();
  renderer.visible = [paint];
  vi.spyOn((renderer as any).imageRequestPool, 'acquire').mockReturnValue({
    requestKey: 'req',
    release: vi.fn(),
    promise: Promise.resolve(fakeImage),
  });

  const imageBuffer = { canvas: undefined, canvases: [] as string[], indices: [] as number[], loaded: [] as number[], loading: false };

  renderer.schedulePaintToCanvas(imageBuffer, paint, 0, 1, false);
  expect(renderer.loadingQueue.length).toBe(1);
  await renderer.loadingQueue.shift()!.task();

  expect(renderer.loadingQueue.length).toBe(1);
  if (beforeDraw) {
    beforeDraw(renderer);
  }
  const drawTaskPromise = renderer.loadingQueue.shift()!.task();
  expect(renderer.drawCalls.length).toBe(1);
  renderer.drawCalls[0]();
  await drawTaskPromise;
}

describe('CanvasRenderer#debugImageStretch hook', () => {
  // happy-dom's canvas element doesn't implement getContext() at all (the
  // method is missing outright, not just non-functional); the decode
  // task's own tile canvas only calls drawImage() on it, so a plain no-op
  // stub is enough to exercise the real code path (including the hook
  // call, which happens just before drawImage) without needing a real
  // canvas backend.
  const originalGetContext = (HTMLCanvasElement.prototype as any).getContext;

  beforeEach(() => {
    (HTMLCanvasElement.prototype as any).getContext = () => ({ drawImage: () => {} });
  });

  afterEach(() => {
    CanvasRenderer.debugImageStretch = undefined;
    (HTMLCanvasElement.prototype as any).getContext = originalGetContext;
  });

  test('does not fire until the queued draw call actually runs', async () => {
    const events: ImageStretchDebugEvent[] = [];
    CanvasRenderer.debugImageStretch = (event) => events.push(event);

    const { renderer } = createRenderer();
    const paint = makeFakePaint(500, 300);
    renderer.visible = [paint];
    vi.spyOn((renderer as any).imageRequestPool, 'acquire').mockReturnValue({
      requestKey: 'req',
      release: vi.fn(),
      promise: Promise.resolve({ naturalWidth: 500, naturalHeight: 300 }),
    });
    const imageBuffer = { canvas: undefined, canvases: [] as string[], indices: [] as number[], loaded: [] as number[], loading: false };

    renderer.schedulePaintToCanvas(imageBuffer, paint, 0, 1, false);
    await renderer.loadingQueue.shift()!.task();
    // Deliberately not awaited: the decode task's promise only resolves via
    // its own drawCalls entry, which is about to be queued but is not run
    // here -- calling .task() still performs its synchronous setup (the
    // drawCalls.push), which is all this test needs.
    renderer.loadingQueue.shift()!.task();

    // The draw call is queued but deliberately not invoked -- matches real
    // rendering, where drawCalls run on the next frame, not synchronously
    // with loading.
    expect(renderer.drawCalls.length).toBe(1);
    expect(events).toEqual([]);
  });

  test('reports stretched: false for an image whose aspect ratio matches its tile', async () => {
    const events: ImageStretchDebugEvent[] = [];
    CanvasRenderer.debugImageStretch = (event) => events.push(event);

    const paint = makeFakePaint(500, 300);
    await runSchedulePaintToCanvas({ naturalWidth: 500, naturalHeight: 300 }, paint);

    expect(events.length).toBe(1);
    expect(events[0].targetWidth).toBe(500);
    expect(events[0].targetHeight).toBe(300);
    expect(events[0].naturalWidth).toBe(500);
    expect(events[0].naturalHeight).toBe(300);
    expect(events[0].paintId).toBe('fake-paint');
    expect(events[0].x).toBe(0);
    expect(events[0].y).toBe(0);
    expect(events[0].stretched).toBe(false);
    expect(events[0].isVisible).toBe(true);
  });

  test('reports the tile\'s actual position for a tile that is not at the image origin', async () => {
    const events: ImageStretchDebugEvent[] = [];
    CanvasRenderer.debugImageStretch = (event) => events.push(event);

    // The second tile in a grid, offset from the image's own origin -- e.g.
    // where a debug overlay would need to draw its label.
    const paint = makeFakePaint(500, 300, 1024, 768);
    await runSchedulePaintToCanvas({ naturalWidth: 500, naturalHeight: 300 }, paint);

    expect(events.length).toBe(1);
    expect(events[0].x).toBe(1024);
    expect(events[0].y).toBe(768);
  });

  test('reports stretched: true for an image server that returned the wrong shape', async () => {
    const events: ImageStretchDebugEvent[] = [];
    CanvasRenderer.debugImageStretch = (event) => events.push(event);

    // Tile expects a 500x300 (landscape) image; the "server" returned a
    // 300x500 (portrait) one instead -- e.g. a misread rotate/crop param.
    const paint = makeFakePaint(500, 300);
    await runSchedulePaintToCanvas({ naturalWidth: 300, naturalHeight: 500 }, paint);

    expect(events.length).toBe(1);
    expect(events[0].stretched).toBe(true);
  });

  test('reports isVisible: false for a tile that scrolled off screen while its image was still loading', async () => {
    const events: ImageStretchDebugEvent[] = [];
    CanvasRenderer.debugImageStretch = (event) => events.push(event);

    const paint = makeFakePaint(500, 300);
    // Present in `visible` when loading started (schedulePaintToCanvas's
    // early-return check passes), removed before the image actually finished
    // loading and got drawn -- a real race between a slow network fetch and
    // the user panning/zooming away.
    await runSchedulePaintToCanvas({ naturalWidth: 500, naturalHeight: 300 }, paint, (renderer) => {
      renderer.visible = renderer.visible.filter((p: any) => p !== paint);
    });

    expect(events.length).toBe(1);
    expect(events[0].isVisible).toBe(false);
  });
});
