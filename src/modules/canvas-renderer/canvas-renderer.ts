import { Strand } from '@atlas-viewer/dna';
import Stats from 'stats.js';
import { Paint } from '../../world-objects';
import { PositionPair } from '../../types';
import { distance } from '@popmotion/popcorn';
import { Text } from '../../objects/text';
import { CanvasTextWrapper } from 'canvas-text-wrapper';
import { SingleImage } from '../../spacial-content/single-image';
import { SpacialContent } from '../../spacial-content/spacial-content';
import { TiledImage } from '../../spacial-content/tiled-image';
import { Renderer } from '../../renderer/renderer';
import { World } from '../../world';

export type CanvasRendererOptions = {
  beforeFrame?: (delta: number) => void;
  debug?: boolean;
};

export type ImageBuffer = {
  canvas: HTMLCanvasElement;
  indices: number[];
  loaded: number[];
  fallback?: ImageBuffer;
};

export class CanvasRenderer implements Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  imageCache: { [url: string]: HTMLImageElement } = {};
  localCanvases: { [id: string]: HTMLCanvasElement } = {};
  options: CanvasRendererOptions;
  hasPendingUpdate = false;
  imagesPending = 0;
  imagesLoaded = 0;
  frameIsRendering = false;
  firstMeaningfulPaint = false;
  parallelTasks = 5; // @todo configuration.
  readonly configuration = {
    segmentRendering: true,
  };
  imageBuffers: {
    [id: string]: {
      [scale: string]: ImageBuffer;
    };
  } = {};
  loadingQueueOrdered = true;
  loadingQueue: Array<{
    id: string;
    distance: number;
    task: () => Promise<any>;
  }> = [];
  currentTask: Promise<any> = Promise.resolve();
  tasksRunning = 0;
  stats?: Stats;
  visibleIds: string[] = [];

  averageJobTime = 1000; // ms

  constructor(canvas: HTMLCanvasElement, options?: CanvasRendererOptions) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
    this.ctx.imageSmoothingEnabled = true;
    this.options = options || {};
    // Testing fade in.
    // @todo definitely make this config.
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

  createImage(url: string) {
    // This is part of the alternative rendering pipeline.
    // Create an image tag.
    const image = document.createElement('img');
    // Keep track of pending images, so we can continue the render loop.
    this.imagesPending++;
    image.addEventListener('load', () => {
      this.imagesLoaded++;
    });
    image.addEventListener('error', () => {
      this.imagesLoaded++;
    });
    image.src = url;
    return image;
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
    // Some off-screen work might need done, like loading new images in.
    this.doOffscreenWork();
    // Stats
    if (this.options.debug && this.stats) {
      this.stats.end();
    }
  }

  doOffscreenWork() {
    // This is our worker. It is called every 1ms (roughly) and will usually be
    // an async task that can run without blocking the frame. Because of
    // there is a configuration for parallel task count.
    const worker = () => {
      // First we check if there is work to do.
      if (this.loadingQueue.length && this.tasksRunning < this.parallelTasks) {
        // Let's pop something off the loading queue.
        const next = this.loadingQueue.pop();
        if (next) {
          const startTime = performance.now();
          // We will increment the task count
          this.tasksRunning++;
          // And kick it off. We don't care if it succeeded or not.
          // A task that needs to retry should just add a new task.
          this.currentTask = next
            .task()
            .then(() => {
              this.averageJobTime = Math.min((this.averageJobTime + performance.now() / startTime) / 2, 2000);
              this.tasksRunning--;
            })
            .catch(() => {
              this.tasksRunning--;
            });
        }
      }
    };
    if (this.loadingQueue.length) {
      // First call immediately.
      worker();
      // Here's our clock for scheduling tasks, every 1ms it will try to call.
      const scheduled = setInterval(() => {
        // Here is the shut down, no more work to do.
        if (this.frameIsRendering || (this.loadingQueue.length === 0 && this.tasksRunning === 0)) {
          clearInterval(scheduled);
        }
        // And here's our working being called. Since JS is blocking, this will complete
        // before the next tick, so its possible that this could be more than 1ms.
        worker();
      }, this.averageJobTime);
    }
  }

  getScale(width: number, height: number): number {
    // It shouldn't happen, but it will. If the canvas is a different shape
    // to the viewport, then this will choose the largest scale to use.
    const w = this.canvas.width / width;
    const h = this.canvas.height / height;
    return w < h ? h : w;
  }

  beforeFrame(world: World, delta: number): void {
    if (this.options.debug && this.stats) {
      this.stats.begin();
    }
    this.frameIsRendering = true;
    this.visibleIds = [];
    // User-facing hook for before frame, contains timing information for
    // animations that might be happening, such as pan/drag.
    if (this.options.beforeFrame) {
      this.options.beforeFrame(delta);
    }
    // But we also need to clear the canvas.
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  paint(paint: SpacialContent | Text, index: number, x: number, y: number, width: number, height: number): void {
    // Only supporting single and tiled images at the moment.
    if (paint instanceof SingleImage || paint instanceof TiledImage) {
      this.visibleIds.push(`${paint.id}--${paint.display.scale}`);
      try {
        // More complex draw here.

        // @todo larger rough pass in the runtime.
        // @todo outer edge rough pass
        //
        // So the viewport (plus some padding) is loaded at full quality
        // and in an outer ring lower quality is pre-loaded.
        //   +---------------------------------+
        //   |       Low quality loaded        |
        //   |    +-----------------------+    |
        //   |    |                       |    |
        //   |    |     high quality      |    |
        //   |    |       loaded          |    |
        //   |    |                       |    |
        //   |    +-----------------------+    |
        //   |                                 |
        //   +---------------------------------+
        // The low quality would be accessible as a cache before high quality
        // images are loaded.

        // 1) Find cached image buffer.
        const imageBuffer = this.getImageBuffer(paint);

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

        // 3) Paint the current buffer onto the target, this probably
        //  won't have an image on the first frame, unless the buffer pulled
        // from a previously loaded image, but once an image is there, it will
        // start loading it.
        // @todo once these are fixed tiles (say 512 or 1024) paint the entire tile and skip over
        //       any additional tile calls. Should reduce the paint count to 9 or less, more likely 4.

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

        // Simple draw of the (hopefully cached) image.
        // Ignore this for now.
        // this.ctx.drawImage(this.getImage(paint, index), x, y, width + 0.5, height + 0.5);
      } catch (err) {
        // nothing to do here, likely that the image isn't loaded yet.
      }
    }

    if (paint instanceof Text) {
      if (!this.textCache[paint.id]) {
        const canvas = document.createElement('canvas');
        canvas.width = paint.display.width;
        canvas.height = paint.display.height;
        this.textCache[paint.id] = {
          revision: -1,
          canvas,
        };
      }

      if (paint.__revision !== this.textCache[paint.id].revision) {
        const canvas = this.textCache[paint.id].canvas;
        const ctx = canvas.getContext('2d');
        if (paint.backgroundColor) {
          ctx.fillStyle = paint.backgroundColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        ctx.fillStyle = paint.color;
        CanvasTextWrapper(canvas, paint.text, paint.props);
      }

      // do nothing.
      this.ctx.drawImage(
        this.textCache[paint.id].canvas,
        0,
        0,
        paint.display.width,
        paint.display.height,
        x,
        y,
        width + 0.8,
        height + 0.8
      );
      // CanvasTextWrapper(this.canvas, paint.text, paint.props);
    }
  }

  textCache: any = {};

  loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise(resolve => {
      const image = document.createElement('img');
      image.style.transform = 'translate3d(0,0,0)';
      image.decoding = 'async';
      image.src = url;
      image.addEventListener('load', () => {
        resolve(image);
      });
    });
  }

  schedulePaintToCanvas(imageBuffer: ImageBuffer, paint: SingleImage | TiledImage, index: number, priority: number) {
    // This happens during a frame render, and these are most likely to happen in batches,
    // so it has to be quick.
    // We increment the images pending, so that we continue getting renders.
    this.imagesPending++;
    // We push the index we want to load onto the image buffer.
    imageBuffer.indices.push(index);
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
        new Promise(resolve => {
          if (this.visibleIds.indexOf(id) === -1) {
            this.imagesPending--;
            imageBuffer.indices.splice(imageBuffer.indices.indexOf(index), 1);
            resolve();
            return;
          }
          // When this is task is finally chosen to be done, we
          const url = paint.getImageUrl(index);
          // Load our image.
          this.loadImage(url)
            .then(image => {
              this.imagesLoaded++;
              imageBuffer.loaded.push(index);
              const points = paint.display.points.slice(index * 5, index * 5 + 5);
              const ctx = imageBuffer.canvas.getContext('2d') as CanvasRenderingContext2D;
              ctx.drawImage(image, points[1], points[2], points[3] - points[1], points[4] - points[2]);
              resolve();
            })
            .catch(err => {
              this.imagesPending--;
              imageBuffer.indices.splice(imageBuffer.indices.indexOf(index), 1);
              console.log('Error loading image', err);
              resolve();
            });
        }),
    });
  }

  getImageBuffer(paint: SpacialContent): ImageBuffer {
    // Okay, so an image buffer, in this instance, is an offscreen canvas that contains
    // the image, at the specific scale. So for each image in the world, there will be
    // a buffer for each size.
    if (!this.imageBuffers[paint.id] || !this.imageBuffers[paint.id][paint.display.scale]) {
      // Fallback buffers are the siblings of the image at different levels. They are used to
      // create a fallback to view when the image is not yet ready to view.
      const fallbackBuffers = this.imageBuffers[paint.id] ? Object.keys(this.imageBuffers[paint.id]) : [];
      // If the family of buffers doesn't exist, i.e. this is the first paint, then we wait. In the future
      // we wil need to purge these from memory, as they are large. A few options:
      // - purge based on distance
      // - purge based on count
      // - purge based on access frequency
      // - combination of the above
      // For now, all of the images buffers are stored.
      this.imageBuffers[paint.id] = this.imageBuffers[paint.id] ? this.imageBuffers[paint.id] : {};
      // We'll create our canvas element, this can be simply appended onto the end of the document
      // to see the cache in action.
      const canvas = document.createElement('canvas');
      canvas.width = paint.display.width;
      canvas.height = paint.display.height;
      // document.body.appendChild(canvas);
      // We'll add our canvas to the list of buffers, adding empty lists of image indices and loaded image indices.
      this.imageBuffers[paint.id][paint.display.scale] = { canvas, indices: [], loaded: [] };
      // Now we have a blank canvas, with nothing on it. We'll look to see if there are any existing buffers
      // that have scaled up or scaled down versions of our buffer.
      if (fallbackBuffers.length) {
        // We will find the largest, this could be smarter to find the closest size.
        const largestBuffer = fallbackBuffers[0];
        // We grab that buffer.
        const toPaint = this.imageBuffers[paint.id][`${largestBuffer}`];
        this.imageBuffers[paint.id][paint.display.scale].fallback = toPaint;
        // And paint the whole thing on, this may have empty white spots where no image
        // has been loaded in this buffer either. A more aggressive fallback could find these gaps
        // and fill them with other buffers, but that's overkill of the interactions typical in a viewer.
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        // @todo need to render this better. The fallback should be drawn in the main render perhaps. Using a fallback
        //      if the specific tile isn't loaded. This does not scale and performs terribly at deeper zooms.
        ctx.drawImage(toPaint.canvas, 0, 0, paint.display.width, paint.display.height);
      }
    }
    return this.imageBuffers[paint.id][paint.display.scale];
  }

  getImage(paint: SingleImage | TiledImage, index: number) {
    // This is an alternative rendering pipeline, much simpler.
    // It may be good to switch to this one for very very large
    // worlds, or worlds without any deep zoom.
    const url = paint.getImageUrl(index);
    // Very simple image cache wrapper.
    if (!this.imageCache[url]) {
      this.imageCache[url] = this.createImage(url);
    }

    // We could make this into a fixed size, with least-accessed items
    // removed, allowing them to be GC'd. Can be configurable,
    // but will act like a disk-flush, falling back to the browsers
    // image cache, which itself might be flushed.
    return this.imageCache[url];
  }

  afterPaintLayer(paint: SpacialContent, transform: Strand): void {
    // No-op
  }

  prepareLayer(paint: SpacialContent): void {
    // create it if it does not exist.
    this.getImageBuffer(paint);
  }

  getPointsAt(world: World, target: Strand, aggregate: Strand, scaleFactor: number): Paint[] {
    return world.getPointsAt(target, aggregate, scaleFactor);
  }

  // getActiveZone(world: World): ZoneInterface | null {
  //   const len = world.zones.length;
  //   for (let i = 0; i < len; i++) {
  //     if (world.zones[i].id === this.selectedZone) {
  //       return world.zones[i];
  //     }
  //   }
  //   return null;
  // }
  //
  // hasActiveZone(): boolean {
  //   return !!this.selectedZone;
  // }

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
    const ready = this.imagesPending === 0 && this.loadingQueue.length === 0 && this.tasksRunning === 0;
    if (!this.firstMeaningfulPaint && ready) {
      // Fade in the canvas?
      this.canvas.style.opacity = '1';
      // We've not rendered yet, can we render this frame?
      this.firstMeaningfulPaint = ready;
      // We need to return true here to ensure our update is done.
      return true;
    }

    if (this.options.debug) {
      return true;
    }

    return !ready || this.hasPendingUpdate;
  }
}
