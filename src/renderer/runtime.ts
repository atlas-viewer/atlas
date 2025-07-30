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
  translate,
  compose,
} from '@atlas-viewer/dna';
import { Renderer } from './renderer';
import { Paint } from '../world-objects/paint';
import { TransitionManager } from '../modules/transition-manager/transition-manager';
import { nanoid } from 'nanoid';

export type RuntimeHooks = {
  useFrame: Array<(time: number) => void>;
  useBeforeFrame: Array<(time: number) => void>;
  useAfterFrame: Array<(time: number) => void>;
  useAfterPaint: Array<(paint: Paint) => void>;
};

type UnwrapHook<T> = T extends Array<infer R> ? R : never;
type UnwrapHookArg<T> = T extends Array<(arg: infer R) => any> ? R : never;

export type ViewerMode = 'static' | 'explore' | 'sketch';
const MIN = Number.MIN_VALUE + 1;

export type ViewerFilters = {
  grayscale: number;
  contrast: number;
  brightness: number;
  saturate: number;
  hueRotate: number;
  sepia: number;
  invert: number;
  blur: number;
};

export type HookOptions = {
  enableFilters?: boolean;
  filters: ViewerFilters;
};

export type RuntimeOptions = {
  visibilityRatio: number;
  maxOverZoom: number;
  maxUnderZoom: number;
};

export class Runtime {
  id = nanoid();
  ready = false;

  _rotateFromWorldCenter: boolean = false;
  viewportCenterPoint: { x: number; y: number; };
  viewport: { x: number; y: number; width: number; height: number; top: number; left: number; } | undefined;
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


  get rotateFromWorldCenter(): boolean {
    return this._rotateFromWorldCenter;
  }

  set rotateFromWorldCenter(rotateFromWorldCenter: boolean) {
    console.log('setRotateFromWorldCenter', rotateFromWorldCenter)
    this._rotateFromWorldCenter = rotateFromWorldCenter;
  }


  renderer: Renderer;
  world: World;
  target: Strand;
  homePosition: Strand;
  manualHomePosition: boolean;
  manualFocalPosition: boolean;
  focalPosition: Strand;
  transitionManager: TransitionManager;
  aggregate: Strand;
  transformBuffer = dna(500);
  lastTarget = dna(5);
  zoomBuffer = dna(5);
  logNextRender = false;
  pendingUpdate = true;
  isCommitting = false;
  firstRender = true;
  lastTime: number;
  stopId?: number;
  mode: ViewerMode = 'explore';
  controllers: RuntimeController[] = [];
  controllersRunning = false;
  controllerStopFunctions: Array<() => void> = [];
  maxScaleFactor = 1;
  _viewerToWorld = { x: 0, y: 0 };
  _lastGoodScale = 1;
  hooks: RuntimeHooks = {
    useFrame: [],
    useBeforeFrame: [],
    useAfterPaint: [],
    useAfterFrame: [],
  };
  fpsLimit: number | undefined;
  options: RuntimeOptions;
  hookOptions: HookOptions = {
    filters: {
      grayscale: 0,
      contrast: 0,
      brightness: 0,
      saturate: 0,
      sepia: 0,
      invert: 0,
      hueRotate: 0,
      blur: 0,
    },
  };


  constructor(
    renderer: Renderer,
    world: World,
    target: Viewer,
    controllers: RuntimeController[] = [],
    options?: Partial<RuntimeOptions>
  ) {
    this.renderer = renderer;
    this.world = world;
    this.options = {
      maxOverZoom: 1,
      maxUnderZoom: 1,
      visibilityRatio: 1.5,
      ...(options || {}),
    };
    this.target = DnaFactory.projection(target);
    this.manualHomePosition = false;
    this.pendingUpdate = true;
    this.homePosition = DnaFactory.projection(this.world);
    this.manualFocalPosition = false;
    this.focalPosition = this.target; // Follow target by default.
    this.updateFocalPosition();
    this.transitionManager = new TransitionManager(this);
    this.aggregate = scale(1);
    this.world.addLayoutSubscriber((type: string) => {
      if (type === 'repaint') {
        this.pendingUpdate = true;
      }
      if (type === 'recalculate-world-size') {
        if (!this.manualHomePosition) {
          this.setHomePosition();
          this.goHome();
        }
        this.updateFocalPosition();
      }
    });
    this.lastTime = performance.now();
    this.controllers = controllers;
    this.render(this.lastTime);
    this.startControllers();
    this.viewport = this.renderer.getRendererScreenPosition();

    this.viewportCenterPoint = this.viewerToWorld((this.viewport?.width || 0) /2, (this.viewport?.height || 0) /2 );

  }


  setHomePosition(position?: Projection) {
    this.homePosition.set(DnaFactory.projection(position ? position : this.world));
    this.pendingUpdate = true;
  }

  startControllers() {
    if (this.controllersRunning) {
      return;
    }
    for (const controller of this.controllers) {
      this.controllerStopFunctions.push(controller.start(this));
    }
    this.controllersRunning = true;
  }

  stopControllers() {
    if (!this.controllersRunning) {
      return;
    }
    for (const controller of this.controllerStopFunctions) {
      controller();
    }
    this.controllersRunning = false;
    this.controllerStopFunctions = [];
  }

  updateControllerPosition() {
    for (const controller of this.controllers) {
      controller.updatePosition(this.x, this.y, this.width, this.height);
    }
  }

  triggerResize() {
    if (this.renderer.triggerResize) {
      this.renderer.triggerResize();
    }
    this.pendingUpdate = true;
  }

  addController(controller: RuntimeController) {
    this.controllers.push(controller);
    if (this.controllersRunning) {
      controller.start(this);
    }
    this.pendingUpdate = true;
  }

  cover() {
    return this.goHome({ cover: true });
  }

  getRendererScreenPosition() {
    return this.renderer.getRendererScreenPosition();
  }

  updateRendererScreenPosition() {
    this.pendingUpdate = true;
    this.renderer.resize();
  }

  setOptions(options: Partial<RuntimeOptions>) {
    this.options = { ...this.options, ...options };
  }

  goHome(options: { cover?: boolean; position?: Strand } = {}) {
    if (this.world.width <= 0 || this.world.height <= 0) return;

    const scaleFactor = this.getScaleFactor();

    const target = options.position
      ? {
          x: options.position[1],
          y: options.position[2],
          width: options.position[3] - options.position[1],
          height: options.position[4] - options.position[2],
        }
      : {
          x: this.homePosition[1],
          y: this.homePosition[2],
          width: this.homePosition[3] - this.homePosition[1],
          height: this.homePosition[4] - this.homePosition[2],
        };

    const width = this.width * scaleFactor;
    const height = this.height * scaleFactor;

    const widthScale = target.width / width;
    const heightScale = target.height / height;
    const ar = width / height;

    if (options.cover ? widthScale > heightScale : widthScale < heightScale) {
      const fullWidth = ar * target.height;
      const space = (fullWidth - target.width) / 2;

      this.target[1] = Math.round(-space + target.x);
      this.target[2] = Math.round(target.y);
      this.target[3] = Math.round(fullWidth - space + target.x);
      this.target[4] = Math.round(target.height + target.y);
    } else {
      const fullHeight = target.width / ar;
      const space = (fullHeight - target.height) / 2;

      this.target[1] = Math.round(target.x);
      this.target[2] = Math.round(target.y - space);
      this.target[3] = Math.round(target.x + target.width);
      this.target[4] = Math.round(target.y + fullHeight - space);
    }

    this.constrainBounds(this.target);

    this.updateControllerPosition();
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
    // Step 1. Do we need to calculate a new focal point?

    if (this.transitionManager.hasPending()) {
      this.transitionManager.stopTransition();
    }

    // @todo figure out if there is some focal point that we can trim, given the resize request.
    //      for example if it expand beyond the world, we can crop the focal point.
    this.updateFocalPosition(fromWidth - toWidth, fromHeight - toHeight);

    const widthRatio = toWidth / fromWidth;
    const heightRatio = toHeight / fromHeight;

    this.target[3] = this.target[1] + (this.target[3] - this.target[1]) * widthRatio;
    this.target[4] = this.target[2] + (this.target[4] - this.target[2]) * heightRatio;

    // console.log('resize -> ', toBox(this.target), toBox(this.focalPosition));
    // 1st bad case
    // 1302 738 500 500
    // {x: 0, y: -352.8966979980469, width: 580.4239501953125, height: 1729.7934265136719}
    // {x: 0, y: 0.0000152587890625, width: 1024, height: 1023.9999847412109}
    // 2nd bad case
    // 738 295.9891062144095 500 500
    // {x: 0, y: 0, width: 295.9891052246094, height: 500}
    // {x: 119, y: 0, width: 500, height: 500}

    this.goHome({ position: this.focalPosition });
    this.renderer.resize(toWidth, toHeight);
    this.pendingUpdate = true;

    this.transitionManager.resumeTransition();
  }

  updateFocalPosition(widthDiff?: number, heightDiff?: number) {
    if (!this.manualFocalPosition) {
      const w = this.width;
      const h = this.height;
      const min = Math.min(w, h);

      const marginTrimWidth = 0;
      const marginTrimHeight = 0;

      // console.log(widthDiff, heightDiff);
      // @todo An way to trim margins - breaks reversible resizing.
      // if (
      //   (widthDiff || widthDiff === 0) &&
      //   this.x + this.width > this.world.width &&
      //   (heightDiff || heightDiff === 0) &&
      //   this.y + this.height > this.world.height
      // ) {
      //   // const maxMarginW = this.width - this.world.width;
      //   // marginTrimWidth = (maxMarginW < widthDiff ? maxMarginW : widthDiff) * 2;
      //   // const maxMarginH = this.height - this.world.height;
      //   // marginTrimHeight = maxMarginH < heightDiff ? maxMarginH : heightDiff;
      //   // console.log('A');
      // }

      const baseX = this.x + marginTrimWidth;
      const baseY = this.y + marginTrimHeight;

      if (w < h) {
        const diff = this.height - this.width;
        // []
        this.focalPosition = DnaFactory.projection({
          x: baseX,
          y: baseY + diff / 2,
          width: min - marginTrimWidth * 2,
          height: min - marginTrimHeight * 2,
        });
        this.pendingUpdate = true;
      } else {
        const diff = this.width - this.height;
        // [   ]
        this.focalPosition = DnaFactory.projection({
          x: baseX + diff / 2,
          y: baseY,
          width: min - marginTrimWidth * 2,
          height: min - marginTrimHeight * 2,
        });
        this.pendingUpdate = true;
      }
    }
  }

  _viewport = { x: 0, y: 0, width: 0, height: 0 };

  /**
   * Get Viewport
   *
   * Returns a projection based on the current target.
   *
   * @todo rename to getProjection.
   * @todo evaluate if we actually need this.
   */
  getViewport(): Projection {
    this._viewport.x = this.target[1];
    this._viewport.y = this.target[2];
    this._viewport.width = this.target[3] - this.target[1];
    this._viewport.height = this.target[4] - this.target[2];
    return this._viewport;
  }

  /**
   * Set Viewport
   *
   * This is a helper for setting the viewport based on x, y, width and height, opposed to the x1, y1, x2, y2 native
   * co-ordinates of the target.
   *
   * @param data
   */
  setViewport = (data: { x?: number; y?: number; width?: number; height?: number }) => {
    const x = Math.round(typeof data.x === 'undefined' ? this.target[1] : data.x);
    const y = Math.round(typeof data.y === 'undefined' ? this.target[2] : data.y);

    if (data.width) {
      this.target[3] = x + data.width;
    } else {
      this.target[3] = this.target[3] - this.target[1] + x;
    }
    if (data.height) {
      this.target[4] = y + data.height;
    } else {
      this.target[4] = this.target[4] - this.target[2] + y;
    }

    if (Math.abs(this.target[1] - x) > 0.01) {
      this.target[1] = x;
    }
    if (Math.abs(this.target[2] - y) > 0.01) {
      this.target[2] = y;
    }

    this.pendingUpdate = true;
  };

  constrainBounds(target: Strand, { panPadding = 0, ref = false }: { ref?: boolean; panPadding?: number } = {}) {
    const { minX, maxX, minY, maxY } = this.getBounds({ target, padding: panPadding });

    let isConstrained = false;
    const constrained = ref ? target : dna(target);
    const width = Math.round(target[3] - target[1]);
    const height = Math.round(target[4] - target[2]);

    if (minX > target[1]) {
      isConstrained = true;
      constrained[1] = minX;
      constrained[3] = minX + width;
    }
    if (minY > target[2]) {
      isConstrained = true;
      constrained[2] = minY;
      constrained[4] = minY + height;
    }
    if (maxX < target[1]) {
      isConstrained = true;
      constrained[1] = maxX;
      constrained[3] = maxX + width;
    }
    if (maxY < target[2]) {
      isConstrained = true;
      constrained[2] = maxY;
      constrained[4] = maxY + height;
    }

    return [isConstrained, constrained] as const;
  }

  /**
   * Get bounds
   *
   * Returns the minimum and maximum bounds. This absolutely needs improved. With the addition of zones this is becoming
   * more of an issue. It has to take into account the current layout. There also needs to be a new method for creating
   * a "home" view  that will fit the content to the view.
   */
  getBounds(options: { padding: number; target?: Strand }) {
    const target = options.target || this.target;
    const padding = options.padding;
    const visRatio = this.options.visibilityRatio;
    const hiddenRatio = Math.abs(1 - visRatio);

    if (this.world.hasActiveZone()) {
      const zone = this.world.getActiveZone();

      if (zone) {
        const xCon = target[3] - target[1] < zone.points[3] - zone.points[1];
        const yCon = target[4] - target[2] < zone.points[4] - zone.points[2];
        return {
          minX: xCon
            ? zone.points[1] - padding
            : zone.points[1] + (zone.points[3] - zone.points[1]) / 2 - (target[3] - target[1]) / 2,
          maxX: yCon
            ? zone.points[2] - padding
            : zone.points[2] + (zone.points[4] - zone.points[2]) / 2 - (target[4] - target[2]) / 2,
          minY: xCon
            ? zone.points[3] + padding
            : zone.points[1] + (zone.points[3] - zone.points[1]) / 2 - (target[3] - target[1]) / 2,
          maxY: yCon
            ? zone.points[4] + padding
            : zone.points[2] + (zone.points[4] - zone.points[2]) / 2 - (target[4] - target[2]) / 2,
        };
      }
    }

    const wt = target[3] - target[1];
    const ww = this.world.width;

    // const addConstraintPaddingX = ww / visRatio < wt;

    // Add constrain padding = false (zoomed in)
    const xB = -wt * hiddenRatio;
    const xD = ww - wt - xB;

    // ADd constrain padding = true (zoomed out)
    // const xA = ww * visRatio - wt;
    // const xC = ww * visRatio;
    // const xA = -500 / this.getScaleFactor(true);
    // const xC = -200 / this.getScaleFactor(true);
    // const xC = Math.min(-((wt - ww) / 2), ww * hiddenRatio);
    // const xA = Math.max(xC, ww - wt);

    // const minX = addConstraintPaddingX ? xA : xB;
    // const maxX = addConstraintPaddingX ? xC : xD;

    const ht = target[4] - target[2];
    const hw = this.world.height;

    // Add constrain padding = false (zoomed in)
    const yB = -ht * hiddenRatio;
    const yD = hw - ht - yB;

    // Add constrain padding = true (zoomed out)
    // const yA = hw * visRatio - ht;
    // const yC = hw * visRatio;
    // const yC = Math.min(-((ht - hw) / 2), hw * hiddenRatio);
    // const yA = Math.max(yC, hw * hiddenRatio - ht);
    //
    // const addConstraintPaddingY = hw / visRatio < ht;

    // const minY = addConstraintPaddingY ? yA : yB;
    // const maxY = addConstraintPaddingY ? yC : yD;

    const maxX = Math.round(Math.max(xB, xD));
    const minX = Math.round(Math.min(xB, xD));
    const maxY = Math.round(Math.max(yB, yD));
    const minY = Math.round(Math.min(yB, yD));

    return { minX, maxX, minY, maxY } as const;
  }

  getScaleFactor(dpi = false) {
    const scale = this.renderer.getScale(this.target[3] - this.target[1], this.target[4] - this.target[2], dpi);
    if (scale === 0) {
      return this._lastGoodScale;
    }
    this._lastGoodScale = scale;
    return scale;
  }

  /**
   * Zoom
   */
  getZoomedPosition(
    factor: number,
    {
      origin,
      fromPos: _fromPos,
    }: {
      origin?: { x: number; y: number };
      fromPos?: Strand;
    }
  ) {
    const fromPos = _fromPos ? { width: _fromPos[3] - _fromPos[1], height: _fromPos[4] - _fromPos[2] } : undefined;
    // Fresh scale factor.
    const scaleFactor = fromPos ? this.renderer.getScale(fromPos.width, fromPos.height) : this.getScaleFactor();
    const w = fromPos ? fromPos.width : this.width;
    const h = fromPos ? fromPos.height : this.height;

    const sWidth = this.getRendererScreenPosition()?.width;
    const wWidth = this.world.width;
    const ratio = sWidth ? sWidth / wWidth : 1;

    const maxUnderZoom = this.options.maxUnderZoom;
    const maxOverZoom = Math.max(ratio || 1, this.options.maxOverZoom);

    const realFactor = 1 / factor;
    const proposedFactor = scaleFactor * realFactor;
    const isZoomingOut = realFactor < 1;

    if (isZoomingOut) {
      const width = w * scaleFactor;
      const height = h * scaleFactor;

      const widthScale = this.world.width / width;
      const heightScale = this.world.height / height;

      if (widthScale > heightScale) {
        // Constrain width
        // If the proposed world display height.
        const proposedWorldDisplayWidth = this.world.width * proposedFactor;
        // Is greater than the display width.
        const displayWidth = ~~(w * scaleFactor);
        const displayWidthAdjusted = displayWidth * maxUnderZoom;

        if (proposedWorldDisplayWidth < displayWidthAdjusted) {
          factor = (this.world.width * scaleFactor) / (w * scaleFactor * maxUnderZoom);
        }
      } else {
        // Constrain height.
        // If the proposed world display height.
        const proposedWorldDisplayHeight = this.world.height * proposedFactor;
        // Is greater than the display height.
        const displayHeight = ~~(h * scaleFactor);
        const displayHeightAdjusted = displayHeight * maxUnderZoom;

        if (proposedWorldDisplayHeight < displayHeightAdjusted) {
          factor = (this.world.height * scaleFactor) / (h * scaleFactor * maxUnderZoom);
        }
      }
    } else {
      // Zooming in.
      if (proposedFactor > maxOverZoom) {
        factor = scaleFactor / maxOverZoom;
      }
    }

    // set the new scale.
    const proposedStrand = transform(
      this.target,
      scaleAtOrigin(
        factor,
        origin ? origin.x : this.target[1] + (this.target[3] - this.target[1]) / 2,
        origin ? origin.y : this.target[2] + (this.target[4] - this.target[2]) / 2
      ),
      this.zoomBuffer
    );

    this.constrainBounds(proposedStrand, { ref: true, panPadding: 100 });

    return proposedStrand;
  }

  clampRegion({
    x,
    y,
    width,
    height,
    padding = 0,
  }: {
    x: number;
    y: number;
    width: number;
    height: number;
    padding?: number;
  }) {
    const w = this.width;
    const h = this.height;
    const matchesHeight = width / w < height / h;

    const rx = x - padding;
    const ry = y - padding;
    const rWidth = width + padding * 2;
    const rHeight = height + padding * 2;

    if (matchesHeight) {
      // pad on the left and right.
      const actualWidth = (rHeight / h) * w;
      return {
        x: rx - (actualWidth - rWidth) / 2,
        y: ry,
        width: actualWidth,
        height: rHeight,
      };
    }
    // pad on the top and bottom.
    const actualHeight = (rWidth / w) * h;
    return {
      x: rx,
      y: ry - (actualHeight - rHeight) / 2,
      width: rWidth,
      height: actualHeight,
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
    const scaleFactor = this.getScaleFactor();
    // is this right?
    const xo = this.target[1] + x / scaleFactor;
    const yo = this.target[2] + y / scaleFactor;

    this._viewerToWorld.x = xo;
    this._viewerToWorld.y = yo;
    return { x: xo, y: yo };
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

    mutate(strand, compose(scale(this.getScaleFactor()), translate(-this.target[1], -this.target[2])));

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
    this.pendingUpdate = true;
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
    this.pendingUpdate = true;

    // Return an unsubscribe.
    return () => {
      this.target = oldTarget;
    };
  }

  /**
   * Stop the runtime
   *
   * Stops the internal clock, where no more updates will occur. Returns a function to restart it.
   */
  stop(): () => void {
    if (typeof this.stopId !== 'undefined') {
      window.cancelAnimationFrame(this.stopId);
      this.stopId = undefined;
    }

    return () => {
      this.render(performance.now());
    };
  }

  reset() {
    this.renderer.reset();
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
      this.hooks[name] = (this.hooks[name] as any[]).filter((e) => e !== (hook as any));
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

    if (this.isCommitting || (this.fpsLimit && delta < 1000 / this.fpsLimit)) {
      this.stopId = window.requestAnimationFrame(this.render);
      return;
    }

    this.lastTime = t;
    // First flush
    this.world.flushSubscriptions();
    // Set up our loop.
    this.stopId = window.requestAnimationFrame(this.render);

    // Called every frame.
    this.hook('useFrame', delta);

    const pendingUpdate = this.pendingUpdate;
    const rendererPendingUpdate = this.renderer.pendingUpdate();

    if (this.transitionManager.hasPending()) {
      this.transitionManager.runTransition(this.target, delta);

      this.pendingUpdate = true;
      this.updateControllerPosition();
    }

    if (
      !this.firstRender &&
      !pendingUpdate &&
      // Check if there was a pending update from the renderer.
      !rendererPendingUpdate &&
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

    // Group.
    // console.groupCollapsed(`Previous frame took ${delta} ${delta > 17 ? '<-' : ''} ${delta > 40 ? '<--' : ''}`);

    this.hook('useBeforeFrame', delta);
    // Before everything kicks off, add a hook.
    this.renderer.beforeFrame(this.world, delta, this.target, this.hookOptions);
    // Calculate a scale factor by passing in the height and width of the target.
    const scaleFactor = this.getScaleFactor();
    // Get the points to render based on this scale factor and the current x,y,w,h in the target buffer.
    const points = this.renderer.getPointsAt(this.world, this.target, this.aggregate, scaleFactor);
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

      // This is the position of the points. We apply the transform that came with the points.
      // The points before the transformation are just points relative to their parent (canvas?)
      // When we apply the transform, they become relative to the viewer. Both of these point
      // values are useful, but for rendering, we want the viewer-points.
      // @todo add option in renderer to omit this transform, instead passing it as a param.
      const position = transformation ? transform(point, transformation, this.transformBuffer) : point;
      // Another hook before painting a layer.

      

      console.log('prepareLayer', {
        rotateFromWorldCenter: this.rotateFromWorldCenter, viewportCenterPoint: this.viewportCenterPoint, width: this.width, height: this.height, world: {
          width: this.world.width,
          height: this.world.height
      }, viewport: this.viewport })
      this.renderer.prepareLayer(
        paint,
        paint.__parent && transformation
          ? transform(paint.__parent.crop || paint.__parent.points, transformation)
          : position,
          this.rotateFromWorldCenter? this.viewportCenterPoint.x :undefined, this.rotateFromWorldCenter? this.viewportCenterPoint.y : undefined
      );

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

      this.renderer.finishLayer(paint, point);
    }
    // A final hook after the entire frame is complete.
    this.renderer.afterFrame(this.world, delta, this.target, this.hookOptions);
    this.hook('useAfterFrame', delta);
    // Finally at the end, we set up the frame we just rendered.
    this.lastTarget[0] = this.target[0];
    this.lastTarget[1] = this.target[1];
    this.lastTarget[2] = this.target[2];
    this.lastTarget[3] = this.target[3];
    this.lastTarget[4] = this.target[4];
    // We've just finished our first render.
    this.firstRender = false;
    this.pendingUpdate = false;
    this.logNextRender = false;
    if (this.renderer.isReady()) {
      this.ready = true;
      this.world.trigger('ready');
    }
    // Flush world subscriptions.
    this.world.flushSubscriptions();
    const updates = this.world.getScheduledUpdates(this.target, scaleFactor);
    const len = updates.length;
    if (len > 0) {
      for (let i = 0; i < len; i++) {
        const update = updates[len - i - 1]();
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

  updateNextFrame() {
    this.pendingUpdate = true;
  }
}
