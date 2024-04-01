import { Strand } from '@atlas-viewer/dna';
import { Paint, Paintable, WorldObject } from '../../world-objects';
import { PositionPair } from '../../types';
import { distance } from '../../utils';
import { Text } from '../../objects/text';
import { SingleImage } from '../../spacial-content/single-image';
import { SpacialContent } from '../../spacial-content/spacial-content';
import { TiledImage } from '../../spacial-content/tiled-image';
import { Renderer } from '../../renderer/renderer';
import { World } from '../../world';
import { Box } from '../../objects/box';
import { h } from '../../clean-objects/runtime/h';
import LRUCache from 'lru-cache';
import { Geometry } from '../../objects/geometry';
import { HookOptions } from 'src/standalone';

const shadowRegex =
  /(-?[0-9]+(px|em)\s+|0\s+)(-?[0-9]+(px|em)\s+|0\s+)(-?[0-9]+(px|em)\s+|0\s+)?(-?[0-9]+(px|em)\s+|0\s+)?(.*)/g;
const shadowRegexCache: any = {};

export type CanvasRendererOptions = {
  beforeFrame?: (delta: number) => void;
  debug?: boolean;
  htmlContainer?: HTMLDivElement;
  crossOrigin?: boolean;
  dpi?: number;
  box?: boolean;
  polygon?: boolean;
  background?: string;
  lruCache?: boolean;
};

export type ImageBuffer = {
  canvas: HTMLCanvasElement;
  canvases: string[];
  indices: number[];
  loaded: number[];
  fallback?: ImageBuffer;
  loading: boolean;
};

// @todo be smarter.
const imageCache: { [id: string]: HTMLImageElement } = {};
const hostCache: Record<string, any> = {};

export class CanvasRenderer implements Renderer {
  /**
   * The primary viewing space for the viewer.
   */
  canvas: HTMLCanvasElement;

  /**
   * Canvas context for `this.canvas`
   */
  ctx: CanvasRenderingContext2D;

  /**
   * Rendering options added in the constructor.
   */
  options: CanvasRendererOptions;

  /**
   * Number of images loading.
   */
  imagesPending = 0;

  /**
   * Number of completed images, used to calculate pending images.
   */
  imagesLoaded = 0;

  /**
   * Can be used to avoid or stop work when frame is or isn't rendering outside of the main loop.
   */
  frameIsRendering = false;
  pendingDrawCall = false;
  firstMeaningfulPaint = false;
  parallelTasks = 8; // @todo configuration.
  frameTasks = 0;
  loadingQueueOrdered = true;
  loadingQueue: Array<{
    id: string;
    scale: number;
    network?: boolean;
    distance: number;
    shifted?: boolean;
    task: () => Promise<any>;
  }> = [];
  currentTask: Promise<any> = Promise.resolve();
  tasksRunning = 0;
  stats?: Stats;
  averageJobTime = 1000; // ms
  lastKnownScale = 1;
  visible: Array<SpacialContent> = [];
  previousVisible: Array<SpacialContent> = [];
  rendererPosition: DOMRect;
  dpi: number;
  drawCalls: Array<() => void> = [];
  lastPaintedObject?: WorldObject;
  hostCache: LRUCache<string, HTMLCanvasElement>;
  invalidated: string[] = [];

  constructor(canvas: HTMLCanvasElement, options?: CanvasRendererOptions) {
    this.canvas = canvas;
    this.rendererPosition = canvas.getBoundingClientRect();
    // Not working as expected.
    // this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) as CanvasRenderingContext2D;
    this.ctx = canvas.getContext('2d', { alpha: true }) as CanvasRenderingContext2D;
    this.ctx.imageSmoothingEnabled = true;
    this.options = options || {};
    // Testing fade in.
    this.canvas.style.opacity = '0';
    this.canvas.style.transition = 'opacity .3s';
    this.dpi = options?.dpi || 1;

    this.hostCache = options?.lruCache
      ? new LRUCache<string, HTMLCanvasElement>({
          maxSize: 1024 * 512 * 512, // 250MB total.
          dispose: (value, key, reason) => {
            this.invalidated.push(key);
            value.width = 0;
            value.height = 0;
          },
          sizeCalculation: (value, key) => {
            return value.width * value.height;
          },
        })
      : ({
          store: {},
          get(id: string) {
            return this.store[id];
          },
          set(id: string, value: any) {
            this.store[id] = value;
          },
        } as any);

    if (process.env.NODE_ENV !== 'production' && this.options.debug) {
      import('stats.js')
        .then((s) => new s.default())
        .then((stats) => {
          this.stats = stats;
          this.stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
          if (document && document.body) {
            document.body.appendChild(this.stats.dom);
          }
        });
    }
  }

  getCanvasDims() {
    return { width: this.canvas.width / this.dpi, height: this.canvas.height / this.dpi };
  }

  resize() {
    this.rendererPosition = this.canvas.getBoundingClientRect();
  }

  isReady(): boolean {
    return this.firstMeaningfulPaint;
  }

  afterFrame(world: World): void {
    // this.lastPaintedObject = paint.__owner.value;
    this.clearTransform();
    this.lastPaintedObject = undefined;
    // this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    // this.ctx.rotate((90 * Math.PI) / 180);
    // this.ctx.translate(-this.canvas.width / 2, -this.canvas.height / 2);
    this.frameIsRendering = false;
    // After we've rendered, we'll set the pending and loading to correct values.
    this.imagesPending = this.imagesPending - this.imagesLoaded;
    this.imagesLoaded = 0;
    if (!this.loadingQueueOrdered /*&& this.loadingQueue.length > this.parallelTasks*/) {
      this.loadingQueue = this.loadingQueue.sort((a, b) => {
        if (a.network) {
          if (a.scale === b.scale) {
            return b.distance - a.distance;
          }
        }

        return a.scale < b.scale ? -1 : 1;
      });
      this.loadingQueueOrdered = true;
    }
    // Set them.
    this.previousVisible = this.visible;
    this.pendingDrawCall = !!this.drawCalls.length;
    if (this.pendingDrawCall) {
      for (let i = 0; i < this.drawCalls.length; i++) {
        const nextCall = this.drawCalls.shift();
        if (nextCall) nextCall();
      }
    }
    // Some off-screen work might need done, like loading new images in.
    this.doOffscreenWork();
    // Stats
    if (this.options.debug && this.stats) {
      this.stats.end();
    }
  }

  doOffscreenWork() {
    this.frameTasks = 0;
    // This is our worker. It is called every 1ms (roughly) and will usually be
    // an async task that can run without blocking the frame. Because of
    // there is a configuration for parallel task count.
    if (this.loadingQueue.length) {
      // First call immediately.
      this._worker();
      if (this.loadingQueue.length /*&& this.tasksRunning < this.parallelTasks*/) {
        // Here's our clock for scheduling tasks, every 1ms it will try to call.
        if (!this._scheduled) {
          this._scheduled = setInterval(this._doWork, 0);
        }
      }
    }
  }

  _worker = () => {
    if (
      // First we check if there is work to do.
      this.loadingQueue.length /*&&
      this.tasksRunning < this.parallelTasks &&
      this.frameTasks < this.parallelTasks*/
    ) {
      // Let's pop something off the loading queue.
      const next = this.loadingQueue.pop();

      if (next) {
        // @todo removed for now, while a nice optimisation it was breaking the "renderSmallestFallback"
        // const outOfBounds = !next.shifted && Math.abs(1 - next.scale / (1 / this.lastKnownScale)) >= 1;
        // if (outOfBounds && !next.shifted) {
        //   next.shifted = true;
        //   this.loadingQueue.unshift(next);
        //   return;
        // }
        // We will increment the task count
        this.tasksRunning++;
        this.frameTasks++;
        // And kick it off. We don't care if it succeeded or not.
        // A task that needs to retry should just add a new task.
        this.currentTask = next
          .task()
          .then(() => {
            this.tasksRunning--;
          })
          .catch(() => {
            this.tasksRunning--;
          });
      }
    }
  };
  _scheduled: any = 0;
  _doWork = () => {
    // Here is the shut down, no more work to do.
    if (this.loadingQueue.length === 0 && this.tasksRunning === 0 && this._scheduled) {
      clearInterval(this._scheduled);
      this._scheduled = 0;
    }
    // And here's our working being called. Since JS is blocking, this will complete
    // before the next tick, so its possible that this could be more than 1ms.
    this._worker();
  };

  getScale(width: number, height: number, dpi?: boolean): number {
    // It shouldn't happen, but it will. If the canvas is a different shape
    // to the viewport, then this will choose the largest scale to use.
    if (Number.isNaN(width) || Number.isNaN(height)) {
      return this.lastKnownScale;
    }

    const canvas = this.getCanvasDims();
    const w = canvas.width / width;
    const h = canvas.height / height;
    const scale = (w < h ? h : w) * (dpi ? this.dpi || 1 : 1);

    if (!Number.isNaN(scale)) {
      this.lastKnownScale = scale;
    }

    return this.lastKnownScale;
  }

  beforeFrame(world: World, delta: number, target: Strand, options: HookOptions): void {
    // const scale = this.getScale(target[3] - target[1], target[4] - target[1]);
    // this.ctx.setTransform(scale, 0, 0, scale, -target[1], -target[2]);

    if (this.options.debug && this.stats) {
      this.stats.begin();
    }
    this.frameIsRendering = true;
    this.visible = [];
    // User-facing hook for before frame, contains timing information for
    // animations that might be happening, such as pan/drag.
    if (this.options.beforeFrame) {
      this.options.beforeFrame(delta);
    }

    const canvas = this.getCanvasDims();
    // But we also need to clear the canvas.
    this.ctx.globalAlpha = 1;
    this.ctx.fillStyle = this.options.background || 'rgb(0, 0, 0)';
    this.ctx.fillRect(0, 0, canvas.width, canvas.height);
    // this.ctx.translate(this.canvas.width / 2, this.canvas.height / 2);
    // this.ctx.rotate((-90 * Math.PI) / 180);
    // this.ctx.translate(-this.canvas.width / 2, -this.canvas.height / 2);

    if (
      options.enableFilters &&
      (options.filters.brightness ||
        options.filters.contrast ||
        options.filters.grayscale ||
        options.filters.invert ||
        options.filters.sepia ||
        options.filters.saturate ||
        options.filters.hueRotate ||
        options.filters.blur)
    ) {
      let filter = '';
      if (options.filters.brightness) {
        filter += `brightness(${~~(100 + options.filters.brightness * 100)}%) `;
      }
      if (options.filters.contrast) {
        filter += `contrast(${~~(100 + options.filters.contrast * 100)}%) `;
      }
      if (options.filters.grayscale) {
        filter += `grayscale(${~~(options.filters.grayscale * 100)}%) `;
      }
      if (options.filters.invert) {
        filter += `invert(${~~(options.filters.invert * 100)}%) `;
      }
      if (options.filters.sepia) {
        filter += `sepia(${~~(options.filters.sepia * 100)}%) `;
      }
      if (options.filters.saturate) {
        filter += `saturate(${~~(100 + options.filters.saturate * 100)}%) `;
      }
      if (options.filters.hueRotate) {
        filter += `hue-rotate(${options.filters.hueRotate}deg) `;
      }
      if (options.filters.blur) {
        filter += `blur(${options.filters.blur}px) `;
      }

      this.ctx.filter = filter;
    } else {
      this.ctx.filter = 'none';
    }
  }

  applyTransform(paint: Paintable, x: number, y: number, width: number, height: number) {
    const owner = paint.__owner.value;
    if (owner && owner.rotation) {
      this.ctx.save();
      const moveX = x + width / 2;
      const moveY = y + height / 2;

      this.ctx.translate(moveX, moveY);
      this.ctx.rotate((owner.rotation * Math.PI) / 180);
      this.ctx.translate(-moveX, -moveY);
      this.lastPaintedObject = owner;
    }
  }
  clearTransform() {
    // Do something with last object.
    if (this.lastPaintedObject) {
      if (this.lastPaintedObject.rotation) {
        this.ctx.restore();
      }
      this.lastPaintedObject = undefined;
    }
  }

  paint(paint: SpacialContent | Text | Box, index: number, x: number, y: number, width: number, height: number): void {
    const ga = this.ctx.globalAlpha;

    // Only supporting single and tiled images at the moment.
    if (paint instanceof SingleImage || paint instanceof TiledImage) {
      if (paint.display.rotation) {
        this.ctx.save();
        let moveX = x + width / 2;
        let moveY = y + height / 2;
        if (paint.crop) {
          moveX -= paint.crop[index * 5 + 1];
          moveY -= paint.crop[index * 5 + 2];
        }
        this.ctx.translate(moveX, moveY);
        this.ctx.rotate((paint.display.rotation * Math.PI) / 180);
        this.ctx.translate(-moveX, -moveY);
      }

      this.visible.push(paint);
      if (typeof paint.style && (paint.style as any).opacity !== 'undefined') {
        if (!paint.style.opacity) {
          return;
        }
        this.ctx.globalAlpha = paint.style.opacity;
      }

      try {
        // 1) Find cached image buffer.
        const imageBuffer: ImageBuffer = paint.__host.canvas;
        const canvas = this.getCanvasDims();

        // 2) Schedule paint onto local buffer (async, yay!)
        if (imageBuffer.indices.indexOf(index) === -1 || this.invalidated.indexOf(imageBuffer.canvases[index]) !== -1) {
          // we need to schedule a paint.
          this.schedulePaintToCanvas(
            imageBuffer,
            paint,
            index,
            distance({ x: x + width / 2, y: y + width / 2 }, { x: canvas.width / 2, y: canvas.height / 2 })
          );
        }

        // If we've not prepared an initial "meaningful paint", then skip the
        // rendering to avoid tiles loading in, breaking the illusion a bit!
        if (!this.firstMeaningfulPaint) {
          return;
        }

        const canvasToPaint = this.hostCache.get(imageBuffer.canvases[index]);
        if (canvasToPaint) {
          if (paint.crop && paint.cropData) {
            if (paint.crop[index * 5]) {
              const source = [
                paint.crop[index * 5 + 1] / paint.display.scale - paint.display.points[index * 5 + 1],
                paint.crop[index * 5 + 2] / paint.display.scale - paint.display.points[index * 5 + 2],
                1 + (paint.crop[index * 5 + 3] - paint.crop[index * 5 + 1]) / paint.display.scale,
                1 + (paint.crop[index * 5 + 4] - paint.crop[index * 5 + 2]) / paint.display.scale,
              ];

              source[0] += paint.cropData.x / paint.display.scale;
              source[1] += paint.cropData.y / paint.display.scale;

              const translationDeltaX = paint.x * this.lastKnownScale;
              const translationDeltaY = paint.y * this.lastKnownScale;
              const target = [x + translationDeltaX, y + translationDeltaY, width, height];

              // What we need?
              target[0] += translationDeltaX;
              target[1] += translationDeltaY;

              this.ctx.drawImage(
                canvasToPaint,
                source[0],
                source[1],
                source[2],
                source[3],
                //
                target[0],
                target[1],
                target[2] + 1,
                target[3] + 1
              );
            }
          } else {
            console.log('writing image', {
              x,
              width: width + Number.MIN_VALUE,
              y,
              height: height + Number.MIN_VALUE,
            });
            this.ctx.drawImage(
              canvasToPaint,
              0, // paint.display.points[index * 5 + 1],
              0, // paint.display.points[index * 5 + 2],
              paint.display.points[index * 5 + 3] - paint.display.points[index * 5 + 1],
              paint.display.points[index * 5 + 4] - paint.display.points[index * 5 + 2],
              x,
              y,
              width + Number.MIN_VALUE + 1,
              height + Number.MIN_VALUE + 1
            );
          }
        }
      } catch (err) {
        // nothing to do here, likely that the image isn't loaded yet.
      }

      if (paint.display.rotation) {
        this.ctx.restore();
      }
    }

    const isBox = paint instanceof Box && this.options.box;
    const isGeometry = paint instanceof Geometry && this.options.polygon;
    if ((isBox || isGeometry) && !paint.props.className && !paint.props.html && !paint.props.href) {
      if (paint.props.style) {
        const style = Object.assign(
          //
          {},
          paint.props.style || {},
          paint.hovering ? paint.props.hoverStyles : {},
          paint.pressing ? paint.props.pressStyles : {}
        );

        const scale = paint.props.relativeStyle ? 1 : width / paint.width;

        if (typeof style.opacity !== 'undefined') {
          this.ctx.globalAlpha = style.opacity;
        }

        let bw = 0;
        if (typeof style.borderWidth !== 'undefined') {
          bw = parseInt(style.borderWidth, 10) * scale;
        }

        let ow = 0;
        if (typeof style.outlineWidth !== 'undefined') {
          ow = parseInt(style.outlineWidth, 10) * scale;
        }

        let oo = 0;
        if (typeof style.outlineOffset !== 'undefined') {
          oo = parseInt(style.outlineOffset, 10) * scale;
        }

        if (style.borderColor) {
          this.ctx.strokeStyle = style.borderColor;
        }

        // Box shadow
        if (style.boxShadow) {
          const shadows = style.boxShadow.split(/,(?![^(]*\))/);
          for (const shadow of shadows) {
            const parsed = shadowRegexCache[shadow] || shadowRegex.exec(shadow) || shadowRegex.exec(shadow);
            shadowRegexCache[shadow] = parsed;
            if (parsed) {
              this.ctx.save();
              this.ctx.shadowOffsetX = parseInt(parsed[1]) * this.dpi * scale;
              this.ctx.shadowOffsetY = parseInt(parsed[3]) * this.dpi * scale;
              this.ctx.shadowBlur = parseInt(parsed[5]) * this.dpi * scale;
              this.ctx.shadowColor = parsed[9];
              this.ctx.fillStyle = 'rgba(0,0,0,1)';
              this.ctx.fillRect(x + bw, y + bw, width, height);
              this.ctx.restore();
            }
          }
        }

        this.ctx.fillStyle = style.backgroundColor || 'transparent';
        this.ctx.lineWidth = bw;

        if (isGeometry) {
          const shape = (paint as any).shape;
          const points = shape.points || [];
          const len = points.length;
          this.ctx.beginPath();
          for (let i = 0; i < len; i++) {
            this.ctx.lineTo(x + points[i][0] * this.lastKnownScale, y + points[i][1] * this.lastKnownScale);
          }
          if (!shape.open) {
            this.ctx.closePath();
          }
          if (bw) {
            this.ctx.stroke();
          }
          if (!shape.open) {
            this.ctx.fill();
          }
        } else {
          if (bw) {
            this.ctx.strokeRect(x + bw / 2, y + bw / 2, width + bw, height + bw);
          }
          this.ctx.fillRect(x + bw, y + bw, width, height);
        }

        if (ow) {
          if (style.outlineColor) {
            this.ctx.strokeStyle = style.outlineColor;
          }
          this.ctx.lineWidth = ow;
          // Outline
          this.ctx.strokeRect(
            //
            x - ow / 2 - oo,
            y - ow / 2 - oo,
            width + bw * 2 + ow + oo * 2,
            height + bw * 2 + ow + oo * 2
          );
        }
      }

      this.ctx.globalAlpha = ga;
    }
  }

  loadImage(url: string, callback: (image: HTMLImageElement) => void, err: (e: any) => void, retry = false): void {
    if (imageCache[url] && imageCache[url].naturalWidth > 0) {
      callback(imageCache[url]);
      return;
    }

    try {
      let loaded = false;

      if (!retry) {
        setTimeout(() => {
          if (!loaded) {
            this.loadImage(url, callback, err, true);
          }
        }, 3000);
      }
      const image = document.createElement('img');
      image.decoding = 'auto';
      image.onload = function () {
        loaded = true;
        callback(image);
        imageCache[url] = image;
        image.onload = null;
      };
      if (this.options.crossOrigin) {
        image.crossOrigin = 'anonymous';
      }
      image.src = url;
      if (image.complete) {
        image.onload({} as any);
      }
      if (image.width === 0) {
        // no-op, just want to query width. (possibly bug with browsers)
      }
    } catch (e) {
      console.log('image error', e);
      err(e);
    }
  }

  schedulePaintToCanvas(imageBuffer: ImageBuffer, paint: SingleImage | TiledImage, index: number, priority: number) {
    // This happens during a frame render, and these are most likely to happen in batches,
    // so it has to be quick.
    // We increment the images pending, so that we continue getting renders.
    this.imagesPending++;
    // We push the index we want to load onto the image buffer.
    imageBuffer.indices.push(index);
    // Unique id for paint.
    const id = `${paint.id}--${paint.display.scale}-${index}`;

    const idx = this.invalidated.indexOf(id);
    if (idx !== -1) {
      this.invalidated.splice(idx, 1);
    }

    imageBuffer.canvases[index] = id;
    // Mark as loading.
    paint.__host.canvas.loading = true;
    // Set loading queue ordering to false to trigger re-order.
    this.loadingQueueOrdered = false;
    // And we push a "unit of work" to perform between frame renders.
    this.loadingQueue.push({
      id,
      scale: paint.display.scale,
      network: true,
      distance: priority,
      task: () =>
        // The only overhead of creating this is the allocation of the lexical scope. So not much, at all.
        new Promise<void>((resolve) => {
          // @todo this is a little slow.
          if (this.visible.indexOf(paint) === -1) {
            this.imagesPending--;
            imageBuffer.indices.splice(imageBuffer.indices.indexOf(index), 1);
            resolve();
            return;
          }
          // When this is task is finally chosen to be done, we
          const url = paint.getImageUrl(index);
          // Load our image.
          this.loadImage(
            url,
            (image) => {
              this.loadingQueue.push({
                id,
                scale: paint.display.scale,
                distance: priority,
                task: () => {
                  return new Promise<void>((innerResolve) => {
                    this.imagesLoaded++;
                    imageBuffer.loaded.push(index);
                    if (imageBuffer.loaded.length === imageBuffer.indices.length) {
                      imageBuffer.loading = false;
                    }
                    const points = paint.display.points.slice(index * 5, index * 5 + 5);

                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
                    canvas.width = points[3] - points[1];
                    canvas.height = points[4] - points[2];
                    // document.body.append(canvas);
                    this.hostCache.set(imageBuffer.canvases[index], canvas);
                    this.drawCalls.push(() => {
                      ctx.drawImage(image, 0, 0, points[3] - points[1], points[4] - points[2]);
                      innerResolve();
                    });
                  });
                },
              });
              resolve();
            },
            (err) => {
              this.imagesPending--;
              imageBuffer.indices.splice(imageBuffer.indices.indexOf(index), 1);
              resolve();
            }
          );
        }),
    });
  }

  afterPaintLayer(paint: SpacialContent, transform: Strand): void {
    // No-op
  }

  prepareLayer(paint: SpacialContent, points: Strand): void {
    if (paint.__owner.value) {
      if (paint.cropData) {
        const scale = this.lastKnownScale * (1 / paint.display.scale);
        this.applyTransform(paint, points[1], points[2], points[3] - points[1], points[4] - points[2]);
        // this.applyTransform(
        //   paint,
        //   points[1] - paint.cropData.x * scale + paint.points[1] * scale,
        //   points[2] - paint.cropData.y * scale + paint.points[2] * scale,
        //   paint.cropData.width * this.lastKnownScale,
        //   paint.cropData.height * this.lastKnownScale
        // );
      } else {
        this.applyTransform(paint, points[1], points[2], points[3] - points[1], points[4] - points[2]);
      }
    }

    if (!paint.__host || !paint.__host.canvas) {
      if (paint instanceof SingleImage || paint instanceof TiledImage) {
        // create it if it does not exist.
        this.createImageHost(paint);
      }
    }
  }

  finishLayer() {
    if (this.lastPaintedObject) {
      this.clearTransform();
    }
  }

  createImageHost(paint: SingleImage | TiledImage) {
    // const canvas = document.createElement('canvas');
    // canvas.width = paint.display.width;
    // canvas.height = paint.display.height;
    // canvas.getContext('2d')?.clearRect(0, 0, paint.display.width, paint.display.height);
    paint.__host = paint.__host ? paint.__host : {};
    paint.__host.canvas = { canvas: undefined, canvases: [], indices: [], loaded: [], loading: false };
    // hostCache[paint.id] = paint.__host;
  }

  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    return world.getPointsAt(target, aggregate, scaleFactor);
  }

  getViewportBounds(world: World, target: Strand, padding: number): PositionPair | null {
    const zone = world.getActiveZone();

    if (zone) {
      const xCon = target[3] - target[1] < zone.points[3] - zone.points[1];
      const yCon = target[4] - target[2] < zone.points[4] - zone.points[2];
      return {
        x1: xCon
          ? zone.points[1] - padding
          : zone.points[1] + (zone.points[3] - zone.points[1]) / 2 - (target[3] - target[1]) / 2,
        y1: yCon
          ? zone.points[2] - padding
          : zone.points[2] + (zone.points[4] - zone.points[2]) / 2 - (target[4] - target[2]) / 2,
        x2: xCon
          ? zone.points[3] + padding
          : zone.points[1] + (zone.points[3] - zone.points[1]) / 2 - (target[3] - target[1]) / 2,
        y2: yCon
          ? zone.points[4] + padding
          : zone.points[2] + (zone.points[4] - zone.points[2]) / 2 - (target[4] - target[2]) / 2,
      };
    }
    return null;
  }

  pendingUpdate(): boolean {
    const ready =
      !this.pendingDrawCall &&
      this.drawCalls.length === 0 &&
      this.imagesPending === 0 &&
      this.loadingQueue.length === 0 &&
      this.tasksRunning === 0; /*&& this.visible.length > 0*/
    if (!this.firstMeaningfulPaint && ready) {
      // Fade in the canvas?
      this.canvas.style.opacity = '1';
      // We've not rendered yet, can we render this  frame?
      this.firstMeaningfulPaint = ready;
      // We need to return true here to ensure our update is done.
      return true;
    }

    if (this.options.debug) {
      return true;
    }

    return !ready;
  }

  getRendererScreenPosition() {
    return this.rendererPosition;
  }

  reset() {
    this.loadingQueue = [];
    this.drawCalls = [];
  }
}
