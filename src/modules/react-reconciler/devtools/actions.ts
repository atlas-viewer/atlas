import { Runtime } from '../../../renderer/runtime';
import { World } from '../../../world';
import { CompositeResource } from '../../../spacial-content/composite-resource';
import { SingleImage } from '../../../spacial-content/single-image';
import { TiledImage } from '../../../spacial-content/tiled-image';
import { WorldObject } from '../../../world-objects/world-object';

export type ImageRecoveryResult = {
  imageHostsReset: number;
  renderersReset: number;
};

function flattenRenderers(renderer: any, out: any[] = []) {
  if (!renderer) {
    return out;
  }

  if (Array.isArray(renderer.renderers)) {
    for (const child of renderer.renderers) {
      flattenRenderers(child, out);
    }
    return out;
  }

  out.push(renderer);
  return out;
}

function walkImages(layer: any, out: Array<SingleImage | TiledImage>) {
  if (!layer) {
    return;
  }

  if (layer instanceof SingleImage || layer instanceof TiledImage) {
    out.push(layer);
    return;
  }

  if (layer instanceof CompositeResource) {
    const imageSet = new Set<any>([...layer.allImages, ...layer.images]);
    for (const image of imageSet) {
      walkImages(image, out);
    }
    return;
  }

  if (layer instanceof WorldObject && Array.isArray(layer.layers)) {
    for (const child of layer.layers) {
      walkImages(child, out);
    }
  }
}

export function collectWorldImagePaintables(world: World): Array<SingleImage | TiledImage> {
  const out: Array<SingleImage | TiledImage> = [];
  const objects = world.getObjects();

  for (const object of objects) {
    if (!object) {
      continue;
    }
    walkImages(object, out);
  }

  return out;
}

export function resetImageLoadingState(runtime: Runtime): ImageRecoveryResult {
  const images = collectWorldImagePaintables(runtime.world);
  let imageHostsReset = 0;

  for (const image of images) {
    imageHostsReset++;

    if (!image.__host) {
      image.__host = {};
    }

    image.__host.canvas = {
      canvas: undefined,
      canvases: [],
      indices: [],
      loaded: [],
      loading: false,
    };

    if (image.__host.webgl) {
      image.__host.webgl.loading = [];
      image.__host.webgl.loaded = [];
      if (Array.isArray(image.__host.webgl.textures)) {
        image.__host.webgl.textures = [...new Array(image.points.length / 5)];
      }
    }
  }

  const renderers = flattenRenderers(runtime.renderer);
  let renderersReset = 0;

  for (const renderer of renderers) {
    renderersReset++;

    if (Array.isArray(renderer.loadingQueue)) {
      renderer.loadingQueue = [];
    }

    if (Array.isArray(renderer.drawCalls)) {
      renderer.drawCalls = [];
    }

    if (Array.isArray(renderer.invalidated)) {
      renderer.invalidated = [];
    }

    if (Array.isArray(renderer.imageIdsLoaded)) {
      renderer.imageIdsLoaded = [];
    }

    if (renderer.hostCache?.clear) {
      renderer.hostCache.clear();
    }

    if (typeof renderer.tasksRunning === 'number') {
      renderer.tasksRunning = 0;
    }

    if (typeof renderer.imagesPending === 'number') {
      renderer.imagesPending = 0;
    }

    if (typeof renderer.imagesLoaded === 'number') {
      renderer.imagesLoaded = 0;
    }

    if (typeof renderer.pendingDrawCall === 'boolean') {
      renderer.pendingDrawCall = false;
    }

    if (typeof renderer.loadingQueueOrdered === 'boolean') {
      renderer.loadingQueueOrdered = true;
    }

    if (typeof renderer.reset === 'function') {
      renderer.reset();
    }
  }

  runtime.updateNextFrame();

  return {
    imageHostsReset,
    renderersReset,
  };
}
