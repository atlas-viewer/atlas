import { dna, DnaFactory, Strand, transform } from '@atlas-viewer/dna';
import { flushLayoutSubscriptions } from '../traits/layout';
import { getAllPointsAt, PaintableObject, PointOptions } from '../traits/paintable';
import { getScheduledUpdates } from '../traits/scheduled-updates';
import { Projection } from '../../types';
import { number } from 'style-value-types';

interface RenderState {
  target: Strand;
  lastTarget: Strand;
  object: PaintableObject;
  lastTime: number;
  stopId: number | null;
  pendingUpdate: boolean;
  firstRender: boolean;
  scaleFactor: number;
  transformBuffer: Strand;
  ready: boolean;
}

interface RenderConfig {
  fpsLimit: number;
  pointOptions: PointOptions;
}

interface RenderHooks {
  requestAnimationFrame: (cb: (time: number) => void) => number;
  isReady: (delta: number, state: RenderState) => boolean;
  useOnReady: (delta: number, state: RenderState) => void;
  useFrame: (delta: number, state: RenderState) => void;
  useBeforeFrame: (delta: number, state: RenderState) => void;
  useTransition: (delta: number, state: RenderState) => void;
  usePendingUpdate: (delta: number, state: RenderState) => boolean;
  useAfterPaint: (delta: number, state: RenderState) => void;
  afterFrame: (delta: number, state: RenderState) => void;
  usePrepareLayer: (delta: number, state: RenderState, layer: PaintableObject) => boolean;
  usePaint: (
    object: PaintableObject,
    index: number,
    x: number,
    y: number,
    width: number,
    height: number,
    state: RenderState
  ) => void;
}

export function getDefaultRenderState(object: PaintableObject, viewport: Projection): RenderState {
  const target = DnaFactory.projection(viewport);

  return {
    target,
    object: object,
    firstRender: true,
    scaleFactor: 1,
    lastTarget: target,
    lastTime: 0,
    ready: false,
    pendingUpdate: false,
    stopId: null,
    transformBuffer: dna(9),
  };
}

export function render(t: number, state: RenderState, hooks: RenderHooks, config: Partial<RenderConfig> = {}) {
  const delta = t - state.lastTime;

  if (config.fpsLimit && delta < 1000 / config.fpsLimit) {
    state.stopId = hooks.requestAnimationFrame((t) => render(t, state, hooks, config));
    return;
  }

  state.lastTime = t;
  // First flush
  flushLayoutSubscriptions(state.object);
  // Set up our loop.
  state.stopId = hooks.requestAnimationFrame((t) => render(t, state, hooks, config));

  // Called every frame.
  hooks.useFrame(delta, state);

  const pendingUpdate = state.pendingUpdate;
  const rendererPendingUpdate = hooks.usePendingUpdate(delta, state);

  hooks.useTransition(delta, state);

  if (
    !state.firstRender &&
    !pendingUpdate &&
    // Check if there was a pending update from the renderer.
    !rendererPendingUpdate &&
    // Then check the points, the first will catch invalidation.
    state.target[0] === state.lastTarget[0] &&
    // The following are x1, y1, x2, y2 points of the target.
    state.target[1] === state.lastTarget[1] &&
    state.target[2] === state.lastTarget[2] &&
    state.target[3] === state.lastTarget[3] &&
    state.target[4] === state.lastTarget[4]
  ) {
    // Nothing to do, target didn't change since last time.
    return;
  }

  // Group.
  // console.groupCollapsed(`Previous frame took ${delta} ${delta > 17 ? '<-' : ''} ${delta > 40 ? '<--' : ''}`);

  hooks.useBeforeFrame(delta, state);
  // Calculate a scale factor by passing in the height and width of the target.
  const scaleFactor = state.scaleFactor;
  // Get the points to render based on this scale factor and the current x,y,w,h in the target buffer.

  const points = getAllPointsAt(state.object, state.target, state.scaleFactor, config.pointOptions);
  const pointsLen = points.length;
  for (let p = 0; p < pointsLen; p++) {
    // each point is an array of [SpacialContent, Strand, Strand]
    // The first is used to get real rendering data, like Image URLs etc.
    // The second is the points themselves for the layer. If this is a single
    // image this will be a single set of 5 points, for tiled images, it will be
    // the correct list of tiles, and a much longer list of points.
    const paint = points[p][0];
    const point = points[p][1];
    const transformation = points[p][2];
    // Another hook before painting a layer.
    const shouldRender = hooks.usePrepareLayer(delta, state, paint);
    if (!shouldRender) continue;
    // This is the position of the points. We apply the transform that came with the points.
    // The points before the transformation are just points relative to their parent (canvas?)
    // When we apply the transform, they become relative to the viewer. Both of these point
    // values are useful, but for rendering, we want the viewer-points.
    // @todo add option in renderer to omit this transform, instead passing it as a param.
    const position = transformation ? transform(point, transformation, state.transformBuffer) : point;
    // For loop helps keep this fast, looping through all of the tiles that make up an image.
    // This could be a single point, where len is one.
    const totalTiles = position.length / 5;
    for (let i = 0; i < totalTiles; i++) {
      const key = i * 5;
      // First key position tells us if we should render or not. A 0 will usually
      // indicate that the image is off-screen.
      if (position[key] === 0) {
        continue;
      }
      // This is the most expensive call by a long shot, the client implementation.
      // In the reference Canvas implementation, this will grab the URL of the image,
      // load it into an image tag and then paint it onto the canvas at the viewer points.
      hooks.usePaint(
        paint,
        i,
        position[key + 1],
        position[key + 2],
        position[key + 3] - position[key + 1],
        position[key + 4] - position[key + 2],
        state
      );
      hooks.useAfterPaint(delta, state);
    }
  }
  // A final hook after the entire frame is complete.

  hooks.afterFrame(delta, state);
  // Finally at the end, we set up the frame we just rendered.
  state.lastTarget[0] = state.target[0];
  state.lastTarget[1] = state.target[1];
  state.lastTarget[2] = state.target[2];
  state.lastTarget[3] = state.target[3];
  state.lastTarget[4] = state.target[4];
  // We've just finished our first render.
  state.firstRender = false;
  state.pendingUpdate = false;
  if (hooks.isReady(delta, state)) {
    state.ready = true;
    hooks.useOnReady(delta, state);
  }
  // Flush world subscriptions.
  flushLayoutSubscriptions(state.object);

  const updates = getScheduledUpdates(state.object, state.target, scaleFactor);
  const len = updates.length;
  if (len > 0) {
    for (let i = 0; i < len; i++) {
      const update = updates[len - i - 1]();
      if (update) {
        update.then(() => {
          state.pendingUpdate = true;
        });
      } else {
        state.pendingUpdate = true;
      }
    }
  }
}
