import { Runtime } from '../../../renderer/runtime';
import { World } from '../../../world';
import { CompositeResource } from '../../../spacial-content/composite-resource';
import { SingleImage } from '../../../spacial-content/single-image';
import { TiledImage } from '../../../spacial-content/tiled-image';
import { WorldObject } from '../../../world-objects/world-object';
import { RuntimeDebugEvent } from './types';

export type RendererSummary = {
  rendererTypes: string[];
  canvas: Array<{
    type: string;
    loadingQueue: number;
    imagesPending: number;
    imagesLoaded: number;
    tasksRunning: number;
    firstMeaningfulPaint: boolean;
  }>;
  webgl: Array<{
    type: string;
  }>;
};

export type ImageDiagnostic = {
  id: string;
  type: string;
  ownerId?: string;
  compositeId?: string;
  canvas?: {
    loading: boolean;
    indices: number;
    loaded: number;
  };
  webgl?: {
    loading: number;
    loaded: number;
    textures: number;
  };
  anomalies: string[];
};

export type CompositeFrameSelection = {
  frame: number;
  composites: Array<{
    compositeId: string;
    layers: Array<{
      paintId: string;
      paintType: string;
      tileIndex: number;
      imageUrl?: string;
    }>;
  }>;
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

function walkLayer(layer: any, out: ImageDiagnostic[], ownerId?: string, compositeId?: string) {
  if (!layer) {
    return;
  }

  if (layer instanceof WorldObject) {
    if (Array.isArray(layer.layers)) {
      for (const child of layer.layers) {
        walkLayer(child, out, layer.id, compositeId);
      }
    }
    return;
  }

  if (layer instanceof CompositeResource) {
    const childCompositeId = layer.id;
    const imageSet = new Set<any>([...layer.allImages, ...layer.images]);
    for (const image of imageSet) {
      walkLayer(image, out, ownerId, childCompositeId);
    }
    return;
  }

  if (layer instanceof SingleImage || layer instanceof TiledImage) {
    const entry: ImageDiagnostic = {
      id: layer.id,
      type: layer.constructor.name,
      ownerId,
      compositeId,
      anomalies: [],
    };

    if (layer.__host?.canvas) {
      entry.canvas = {
        loading: !!layer.__host.canvas.loading,
        indices: layer.__host.canvas.indices?.length || 0,
        loaded: layer.__host.canvas.loaded?.length || 0,
      };

      if (entry.canvas.loading && entry.canvas.indices === 0) {
        entry.anomalies.push('Canvas host marked loading with empty queue.');
      }
      if (entry.canvas.loaded > entry.canvas.indices && entry.canvas.indices > 0) {
        entry.anomalies.push('Canvas loaded count exceeds scheduled indices.');
      }
    }

    if (layer.__host?.webgl) {
      entry.webgl = {
        loading: layer.__host.webgl.loading?.length || 0,
        loaded: layer.__host.webgl.loaded?.length || 0,
        textures: layer.__host.webgl.textures?.filter(Boolean)?.length || 0,
      };

      if (entry.webgl.loading > 0 && entry.webgl.textures === 0 && entry.webgl.loaded === 0) {
        entry.anomalies.push('WebGL has pending loads but no loaded textures.');
      }
    }

    out.push(entry);
  }
}

export function collectImageDiagnostics(world: World): ImageDiagnostic[] {
  const out: ImageDiagnostic[] = [];
  const objects = world.getObjects();

  for (const object of objects) {
    if (!object) {
      continue;
    }
    walkLayer(object, out, object.id, undefined);
  }

  return out;
}

export function getRendererSummary(runtime: Runtime): RendererSummary {
  const renderers = flattenRenderers(runtime.renderer);

  return {
    rendererTypes: renderers.map((renderer) => renderer?.constructor?.name || 'UnknownRenderer'),
    canvas: renderers
      .filter((renderer) => typeof renderer?.loadingQueue !== 'undefined')
      .map((renderer) => ({
        type: renderer?.constructor?.name || 'CanvasRenderer',
        loadingQueue: renderer.loadingQueue?.length || 0,
        imagesPending: renderer.imagesPending || 0,
        imagesLoaded: renderer.imagesLoaded || 0,
        tasksRunning: renderer.tasksRunning || 0,
        firstMeaningfulPaint: !!renderer.firstMeaningfulPaint,
      })),
    webgl: renderers
      .filter((renderer) => typeof renderer?.gl !== 'undefined')
      .map((renderer) => ({
        type: renderer?.constructor?.name || 'WebGLRenderer',
      })),
  };
}

export function getCompositeSelectionsByFrame(
  events: RuntimeDebugEvent[],
  limit = 30
): CompositeFrameSelection[] {
  const frames = new Map<
    number,
    Map<
      string,
      Array<{
        paintId: string;
        paintType: string;
        tileIndex: number;
        imageUrl?: string;
      }>
    >
  >();

  for (const event of events) {
    if (event.type !== 'paint' || !event.compositeId) {
      continue;
    }

    if (!frames.has(event.frame)) {
      frames.set(event.frame, new Map());
    }

    const composites = frames.get(event.frame)!;
    if (!composites.has(event.compositeId)) {
      composites.set(event.compositeId, []);
    }

    composites.get(event.compositeId)!.push({
      paintId: event.paintId,
      paintType: event.paintType,
      tileIndex: event.tileIndex,
      imageUrl: event.imageUrl,
    });
  }

  return Array.from(frames.entries())
    .sort((a, b) => b[0] - a[0])
    .slice(0, limit)
    .map(([frame, composites]) => ({
      frame,
      composites: Array.from(composites.entries()).map(([compositeId, layers]) => ({
        compositeId,
        layers,
      })),
    }));
}
