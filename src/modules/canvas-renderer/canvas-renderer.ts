import { Strand } from '@atlas-viewer/dna';
import Stats from 'stats.js';
import { Paint } from '../../world-objects';
import { PositionPair } from '../../types';
import { distance } from '@popmotion/popcorn';
import { Text } from '../../objects/text';
import { SingleImage } from '../../spacial-content/single-image';
import { SpacialContent } from '../../spacial-content/spacial-content';
import { TiledImage } from '../../spacial-content/tiled-image';
import { Renderer } from '../../renderer/renderer';
import { World } from '../../world';
import { Box } from '../../objects/box';

export type CanvasRendererOptions = {
  beforeFrame?: (delta: number) => void;
  debug?: boolean;
  htmlContainer?: HTMLDivElement;
  crossOrigin?: boolean;
};

export type ImageBuffer = {
  canvas: HTMLCanvasElement;
  indices: number[];
  loaded: number[];
  fallback?: ImageBuffer;
  loading: boolean;
};

// @todo be smarter.
const imageCache: { [id: string]: HTMLImageElement } = {};

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

  firstMeaningfulPaint = false;
  parallelTasks = 8; // @todo configuration.
  frameTasks = 3;
  isGPUBusy = false;
  loadingQueueOrdered = true;
  loadingQueue: Array<{
    id: string;
    distance: number;
    task: () => Promise<any>;
  }> = [];
  currentTask: Promise<any> = Promise.resolve();
  tasksRunning = 0;
  stats?: Stats;
  averageJobTime = 1000; // ms
  visible: Array<SpacialContent> = [];
  previousVisible: Array<SpacialContent> = [];

  constructor(canvas: HTMLCanvasElement, options?: CanvasRendererOptions) {
    this.canvas = canvas;
    // Not working as expected.
    // this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) as CanvasRenderingContext2D;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    this.ctx.imageSmoothingEnabled = true;
    this.options = options || {};
    // Testing fade in.
    this.canvas.style.opacity = '0';
    this.canvas.style.transition = 'opacity .3s';

    if (this.options.debug) {
      this.stats = new Stats();
      this.stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
      if (document && document.body) {
        document.body.appendChild(this.stats.dom);
      }
    }
  }

  resize() {
    // no-op.
  }

  isReady(): boolean {
    return this.firstMeaningfulPaint;
  }

  afterFrame(world: World): void {
    this.frameIsRendering = false;
    // After we've rendered, we'll set the pending and loading to correct values.
    this.imagesPending = this.imagesPending - this.imagesLoaded;
    this.imagesLoaded = 0;
    if (!this.loadingQueueOrdered && this.loadingQueue.length > this.parallelTasks) {
      this.loadingQueue = this.loadingQueue.sort((a, b) => {
        return b.distance - a.distance;
      });
      this.loadingQueueOrdered = true;
    }
    // Set them.
    this.previousVisible = this.visible;
    // Some off-screen work might need done, like loading new images in.
    this.doOffscreenWork();
    // Stats
    if (this.options.debug && this.stats) {
      this.stats.end();
    }
  }

  doOffscreenWork() {
    this.frameTasks = 0;
    this.isGPUBusy = false;
    // This is our worker. It is called every 1ms (roughly) and will usually be
    // an async task that can run without blocking the frame. Because of
    // there is a configuration for parallel task count.
    if (this.loadingQueue.length) {
      // First call immediately.
      this._worker();
      if (this.loadingQueue.length && this.tasksRunning < this.parallelTasks) {
        // Here's our clock for scheduling tasks, every 1ms it will try to call.
        if (!this._scheduled) {
          this._scheduled = setInterval(this._doWork, 6);
        }
      }
    }
  }

  _worker = () => {
    // First we check if there is work to do.
    if (
      this.loadingQueue.length &&
      this.tasksRunning < this.parallelTasks &&
      this.frameTasks < this.parallelTasks &&
      !this.isGPUBusy
    ) {
      // Let's pop something off the loading queue.
      const next = this.loadingQueue.pop();
      if (next) {
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
    if (this.frameIsRendering || (this.loadingQueue.length === 0 && this.tasksRunning === 0 && this._scheduled)) {
      clearInterval(this._scheduled);
      this._scheduled = 0;
    }
    // And here's our working being called. Since JS is blocking, this will complete
    // before the next tick, so its possible that this could be more than 1ms.
    this._worker();
  };

  getScale(width: number, height: number): number {
    // It shouldn't happen, but it will. If the canvas is a different shape
    // to the viewport, then this will choose the largest scale to use.
    const w = this.canvas.width / width;
    const h = this.canvas.height / height;
    return w < h ? h : w;
  }

  beforeFrame(world: World, delta: number, target: Strand): void {
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
    // But we also need to clear the canvas.
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  paint(paint: SpacialContent | Text | Box, index: number, x: number, y: number, width: number, height: number): void {
    // Only supporting single and tiled images at the moment.
    if (paint instanceof SingleImage || paint instanceof TiledImage) {
      this.visible.push(paint);

      try {
        // 1) Find cached image buffer.
        const imageBuffer: ImageBuffer = paint.__host.canvas;

        // 2) Schedule paint onto local buffer (async, yay!)
        if (imageBuffer.indices.indexOf(index) === -1) {
          // we need to schedule a paint.
          this.schedulePaintToCanvas(
            imageBuffer,
            paint,
            index,
            distance({ x: x + width / 2, y: y + width / 2 }, { x: this.canvas.width / 2, y: this.canvas.height / 2 })
          );
        }

        // If we've not prepared an initial "meaningful paint", then skip the
        // rendering to avoid tiles loading in, breaking the illusion a bit!
        if (!this.firstMeaningfulPaint) {
          return;
        }

        if (paint.crop) {
          if (paint.crop[0]) {
            this.ctx.drawImage(
              imageBuffer.canvas,
              paint.crop[index * 5 + 1],
              paint.crop[index * 5 + 2],
              paint.crop[index * 5 + 3] - paint.crop[index * 5 + 1] - 1,
              paint.crop[index * 5 + 4] - paint.crop[index * 5 + 2] - 1,
              x,
              y,
              width + 0.8,
              height + 0.8
            );
          }
        } else {
          this.ctx.drawImage(
            imageBuffer.canvas,
            paint.display.points[index * 5 + 1],
            paint.display.points[index * 5 + 2],
            paint.display.points[index * 5 + 3] - paint.display.points[index * 5 + 1] - 1,
            paint.display.points[index * 5 + 4] - paint.display.points[index * 5 + 2] - 1,
            x,
            y,
            width + 0.8,
            height + 0.8
          );
        }
      } catch (err) {
        // nothing to do here, likely that the image isn't loaded yet.
      }
    }
  }

  loadImage(url: string, callback: (image: HTMLImageElement) => void, err: (e: any) => void): void {
    if (imageCache[url]) {
      callback(imageCache[url]);
      return;
    }

    try {
      const image = document.createElement('img');
      image.decoding = 'async';
      image.onload = function () {
        callback(image);
        imageCache[url] = image;
        image.onload = null;
      };
      if (this.options.crossOrigin) {
        image.crossOrigin = 'anonymous';
      }
      image.src = url;
    } catch (e) {
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
    // Mark as loading.
    paint.__host.canvas.loading = true;
    // Unique id for paint.
    const id = `${paint.id}--${paint.display.scale}`;
    // Set loading queue ordering to false to trigger re-order.
    this.loadingQueueOrdered = false;
    // And we push a "unit of work" to perform between frame renders.
    this.loadingQueue.push({
      id,
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
                distance: priority,
                task: () => {
                  return new Promise<void>((innerResolve) => {
                    this.imagesLoaded++;
                    imageBuffer.loaded.push(index);
                    if (imageBuffer.loaded.length === imageBuffer.indices.length) {
                      imageBuffer.loading = false;
                    }
                    const points = paint.display.points.slice(index * 5, index * 5 + 5);
                    const ctx = imageBuffer.canvas.getContext('2d') as CanvasRenderingContext2D;
                    ctx.drawImage(image, points[1], points[2], points[3] - points[1], points[4] - points[2]);
                    this.isGPUBusy = !this.firstMeaningfulPaint && true;
                    innerResolve();
                  });
                },
              });
              resolve();
            },
            (err) => {
              this.imagesPending--;
              imageBuffer.indices.splice(imageBuffer.indices.indexOf(index), 1);
              console.log('Error loading image', err);
              resolve();
            }
          );
        }),
    });
  }

  afterPaintLayer(paint: SpacialContent, transform: Strand): void {
    // No-op
  }

  prepareLayer(paint: SpacialContent): void {
    if (!paint.__host || !paint.__host.canvas) {
      if (paint instanceof SingleImage || paint instanceof TiledImage) {
        // create it if it does not exist.
        this.createImageHost(paint);
      }
    }
  }

  createImageHost(paint: SingleImage | TiledImage) {
    const canvas = document.createElement('canvas');
    canvas.width = paint.display.width;
    canvas.height = paint.display.height;

    paint.__host = paint.__host ? paint.__host : {};
    paint.__host.canvas = { canvas, indices: [], loaded: [], loading: false };
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
}
