import { Projection, RuntimeController, Viewer } from '../types';
import { World } from '../world';
import {
  DnaFactory,
  mutate,
  scale,
  scaleAtOrigin,
  transform,
  Strand,
  dna,
  hidePointsOutsideRegion,
  translate,
  compose,
} from '@atlas-viewer/dna';
import { EventSubscription, supportedEvents } from './dispatcher';
import { Renderer } from './renderer';
import { Paint } from '../world-objects/paint';

export type RuntimeHooks = {
  useFrame: Array<(time: number) => void>;
  useBeforeFrame: Array<(time: number) => void>;
  useAfterFrame: Array<(time: number) => void>;
  useAfterPaint: Array<(paint: Paint) => void>;
};

type UnwrapHook<T> = T extends Array<infer R> ? R : never;
type UnwrapHookArg<T> = T extends Array<(arg: infer R) => any> ? R : never;

type useFrame = UnwrapHook<RuntimeHooks['useFrame']>;

export class Runtime {
  // Helper getters.
  get x(): number {
    return this.target[1];
  }

  set x(x: number) {
    this.target[1] = x;
  }

  get y(): number {
    return this.target[2];
  }

  set y(y: number) {
    this.target[2] = y;
  }

  get x2(): number {
    return this.target[3];
  }

  set x2(x2: number) {
    this.target[3] = x2;
  }

  get y2(): number {
    return this.target[4];
  }

  set y2(y2: number) {
    this.target[4] = y2;
  }

  get width(): number {
    return this.target[3] - this.target[1];
  }

  set width(width: number) {
    this.target[3] = this.target[1] + width;
  }

  get height(): number {
    return this.target[4] - this.target[2];
  }

  set height(height: number) {
    this.target[4] = this.target[2] = height;
  }

  renderer: Renderer;
  world: World;
  target: Strand;
  aggregate: Strand;
  scaleFactor: number;
  transformBuffer = dna(500);
  lastTarget = dna(5);
  logNextRender = false;
  pendingUpdate = false;
  firstRender = true;
  lastTime: number;
  stopId?: number;
  controllers: RuntimeController[] = [];
  controllersRunning = false;
  hooks: RuntimeHooks = {
    useFrame: [],
    useBeforeFrame: [],
    useAfterPaint: [],
    useAfterFrame: [],
  };

  constructor(renderer: Renderer, world: World, target: Viewer, controllers: RuntimeController[] = []) {
    this.renderer = renderer;
    this.world = world;
    this.target = DnaFactory.projection(target);
    this.aggregate = scale(1);
    this.scaleFactor = target.scale;
    this.world.addLayoutSubscriber((type: string) => {
      if (type === 'repaint') {
        this.pendingUpdate = true;
      }
    });
    this.lastTime = performance.now();
    this.controllers = controllers;
    this.render(this.lastTime);
    this.startControllers();
  }

  startControllers() {
    if (this.controllersRunning) {
      return;
    }
    for (const controller of this.controllers) {
      controller.start(this);
    }
    this.controllersRunning = true;
  }

  stopControllers() {
    if (!this.controllersRunning) {
      return;
    }
    for (const controller of this.controllers) {
      controller.stop(this);
    }
  }

  addController(controller: RuntimeController) {
    this.controllers.push(controller);
    if (this.controllersRunning) {
      controller.start(this);
    }
  }

  /**
   * Resize world
   *
   * This is generally called when the world is re-sized. This recalculates the current target accordingly. It needs to
   * be improved, tested and planned.
   *
   * @param fromWidth
   * @param toWidth
   * @param fromHeight
   * @param toHeight
   */
  resize(fromWidth: number, toWidth: number, fromHeight: number, toHeight: number) {
    this.scaleFactor = this.scaleFactor * (fromWidth / toWidth);
    this.target[3] = this.target[1] + (this.target[3] - this.target[1]) / (fromWidth / toWidth);
    this.target[4] = this.target[2] + (this.target[4] - this.target[2]) / (fromHeight / toHeight);
  }

  /**
   * Get Viewport
   *
   * Returns a projection based on the current target.
   *
   * @todo rename to getProjection.
   * @todo evaluate if we actually need this.
   */
  getViewport(): Projection {
    return {
      x: this.target[1],
      y: this.target[2],
      width: this.target[3] - this.target[1],
      height: this.target[4] - this.target[2],
    };
  }

  /**
   * Set Viewport
   *
   * This is a helper for setting the viewport based on x, y, width and height, opposed to the x1, y1, x2, y2 native
   * co-ordinates of the target.
   *
   * @param data
   */
  setViewport = (data: { x: number; y: number; width?: number; height?: number }) => {
    if (data.width) {
      this.target[3] = data.x + data.width;
    } else {
      this.target[3] = this.target[3] - this.target[1] + data.x;
    }
    if (data.height) {
      this.target[4] = data.y + data.height;
    } else {
      this.target[4] = this.target[4] - this.target[2] + data.y;
    }
    this.target[1] = data.x;
    this.target[2] = data.y;
  };

  /**
   * Get bounds
   *
   * Returns the minimum and maximum bounds. This absolutely needs improved. With the addition of zones this is becoming
   * more of an issue. It has to take into account the current layout. There also needs to be a new method for creating
   * a "home" view  that will fit the content to the view.
   */
  getBounds(padding: number) {
    if (this.world.hasActiveZone()) {
      const zone = this.world.getActiveZone();

      if (zone) {
        const xCon = this.target[3] - this.target[1] < zone.points[3] - zone.points[1];
        const yCon = this.target[4] - this.target[2] < zone.points[4] - zone.points[2];
        return {
          x1: xCon
            ? zone.points[1] - padding
            : zone.points[1] + (zone.points[3] - zone.points[1]) / 2 - (this.target[3] - this.target[1]) / 2,
          y1: yCon
            ? zone.points[2] - padding
            : zone.points[2] + (zone.points[4] - zone.points[2]) / 2 - (this.target[4] - this.target[2]) / 2,
          x2: xCon
            ? zone.points[3] + padding
            : zone.points[1] + (zone.points[3] - zone.points[1]) / 2 - (this.target[3] - this.target[1]) / 2,
          y2: yCon
            ? zone.points[4] + padding
            : zone.points[2] + (zone.points[4] - zone.points[2]) / 2 - (this.target[4] - this.target[2]) / 2,
        };
      }
    }

    const deltaX = this.scaleFactor < 1 ? this.world.width / this.scaleFactor / 2 : padding;
    const deltaY = this.scaleFactor < 1 ? this.world.height / this.scaleFactor / 2 : padding;
    return {
      x1: -deltaX,
      y1: -deltaY,
      x2: this.world.width - (this.target[3] - this.target[1]) + deltaX,
      y2: this.world.height - (this.target[4] - this.target[2]) + deltaY,
    };
  }

  /**
   * Converts units from the viewer to the world.
   *
   * Needs to be tested, as this will become more important with the event system.
   *
   * @param x
   * @param y
   */
  viewerToWorld(x: number, y: number) {
    return {
      x: this.target[1] + x / this.scaleFactor,
      y: this.target[2] + y / this.scaleFactor,
    };
  }

  /**
   * Converts units from the viewer to the world.
   *
   * Needs to be tested, as this will become more important with the event system.
   *
   * @param x
   * @param y
   * @param width
   * @param height
   */
  worldToViewer(x: number, y: number, width: number, height: number) {
    const strand = DnaFactory.singleBox(width, height, x, y);

    mutate(strand, compose(scale(this.scaleFactor), translate(-this.target[1], -this.target[2])));

    return {
      // visible: visible[0] !== 0,
      x: strand[1],
      y: strand[2],
      width: strand[3] - strand[1],
      height: strand[4] - strand[2],
      strand,
    };
  }

  /**
   * Set scale
   *
   * This will set the scale of the target, with an optional origin.
   *
   * @param scaleFactor
   * @param origin
   */
  setScale(scaleFactor: number, origin?: { x: number; y: number }) {
    mutate(
      this.target,
      scaleAtOrigin(
        scaleFactor,
        origin ? origin.x : this.target[1] + (this.target[3] - this.target[1]) / 2,
        origin ? origin.y : this.target[2] + (this.target[4] - this.target[2]) / 2
      )
    );
  }

  /**
   * Sync runtime instances
   *
   * Allows a single controller to drive 2 runtime instances, or 2 controllers to both
   * control each other.
   *
   * @param runtime
   */
  syncTo(runtime: Runtime) {
    const oldTarget = this.target;
    this.target = runtime.target;

    // Return an unsubscribe.
    return () => {
      this.target = oldTarget;
    };
  }

  /**
   * Invalidate
   *
   * Unused function, not sure what it does.
   * @deprecated
   */
  invalidate() {
    // The first 0 will ensure no valid target matches.
    this.target.set([0, 0, 0, 0, 0]);
  }

  /**
   * Stop the runtime
   *
   * Stops the internal clock, where no more updates will occur. Returns a function to restart it.
   */
  stop(): () => void {
    if (typeof this.stopId !== 'undefined') {
      window.cancelAnimationFrame(this.stopId);
    }

    return () => {
      this.render(performance.now());
    };
  }

  registerEventListener<T extends supportedEvents, N extends keyof T>(
    eventName: N,
    subscription: EventSubscription<T[N]>
  ) {
    // new Dispatcher(this.world).registerEventListener(eventName, subscription);
  }

  selectZone(zone: number | string) {
    this.world.selectZone(zone);
    this.pendingUpdate = true;
  }

  deselectZone() {
    this.world.deselectZone();
    this.pendingUpdate = true;
  }

  hook<Name extends keyof RuntimeHooks, Arg = UnwrapHookArg<Name>>(name: keyof RuntimeHooks, arg: Arg) {
    const len = this.hooks[name].length;
    if (len !== 0) {
      for (let x = 0; x < len; x++) {
        this.hooks[name][x](arg as any);
      }
    }
  }

  registerHook<Name extends keyof RuntimeHooks, Hook = UnwrapHook<Name>>(name: Name, hook: Hook) {
    this.hooks[name].push(hook as any);
    return () => {
      this.hooks[name] = (this.hooks[name] as any[]).filter(e => e !== (hook as any));
    };
  }

  /**
   * Render
   *
   * The hottest path in the runtime, called every 16.7ms, if possible in the future be double-timed on 120hz monitors.
   *
   * @   param t
   */
  render = (t: number) => {
    const delta = t - this.lastTime;
    this.lastTime = t;
    // First flush
    this.world.flushSubscriptions();
    // Set up our loop.
    this.stopId = window.requestAnimationFrame(this.render);
    // Called every frame.
    this.hook('useFrame', delta);

    if (
      !this.firstRender &&
      !this.pendingUpdate &&
      // Check if there was a pending update from the renderer.
      !this.renderer.pendingUpdate() &&
      // Then check the points, the first will catch invalidation.
      this.target[0] === this.lastTarget[0] &&
      // The following are x1, y1, x2, y2 points of the target.
      this.target[1] === this.lastTarget[1] &&
      this.target[2] === this.lastTarget[2] &&
      this.target[3] === this.lastTarget[3] &&
      this.target[4] === this.lastTarget[4]
    ) {
      // Nothing to do, target didn't change since last time.
      return;
    }

    this.hook('useBeforeFrame', delta);
    // Before everything kicks off, add a hook.
    this.renderer.beforeFrame(this.world, delta, this.target);
    // Calculate a scale factor by passing in the height and width of the target.
    this.scaleFactor = this.renderer.getScale(this.target[3] - this.target[1], this.target[4] - this.target[2]);
    // Get the points to render based on this scale factor and the current x,y,w,h in the target buffer.
    const points = this.renderer.getPointsAt(this.world, this.target, this.aggregate, this.scaleFactor);
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
      this.renderer.prepareLayer(paint);
      // This is the position of the points. We apply the transform that came with the points.
      // The points before the transformation are just points relative to their parent (canvas?)
      // When we apply the transform, they become relative to the viewer. Both of these point
      // values are useful, but for rendering, we want the viewer-points.
      // @todo add option in renderer to omit this transform, instead passing it as a param.
      const position = transformation ? transform(point, transformation, this.transformBuffer) : point;
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
        this.renderer.paint(
          paint,
          i,
          position[key + 1],
          position[key + 2],
          position[key + 3] - position[key + 1],
          position[key + 4] - position[key + 2]
        );
        this.hook('useAfterPaint', paint);
      }
    }
    // A final hook after the entire frame is complete.
    this.renderer.afterFrame(this.world, delta, this.target);
    this.hook('useAfterFrame', delta);
    // Finally at the end, we set up the frame we just rendered.
    this.lastTarget.set([this.target[0], this.target[1], this.target[2], this.target[3], this.target[4]]);
    // We've just finished our first render.
    this.firstRender = false;
    this.pendingUpdate = false;
    this.logNextRender = false;
    // Flush world subscriptions.
    this.world.flushSubscriptions();
    // @todo this could be improved, but will work for now.
    const updates = this.world.getScheduledUpdates(this.target, this.scaleFactor);
    const len = updates.length;
    if (len > 0) {
      for (let i = 0; i < len; i++) {
        const update = updates[len - i]();
        if (update) {
          update.then(() => {
            this.pendingUpdate = true;
          });
        } else {
          this.pendingUpdate = true;
        }
      }
    }
  };
}
