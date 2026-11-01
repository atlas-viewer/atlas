import { createImageServiceRequest, imageServiceRequestToString, isImageService } from '@atlas-viewer/iiif-image-api';
import type { ImageService } from '@iiif/presentation-3';
import { SingleImage } from '../../spacial-content/single-image';
import { TiledImage } from '../../spacial-content/tiled-image';
import { CompositeResource, type CompositeResourceProps } from '../../spacial-content/composite-resource';
import type { SpacialContent } from '../../spacial-content/spacial-content';

/** Resource loading is independent of a viewer, camera, and scene placement. */
export type ImageResourceOptions = { signal?: AbortSignal; crossOrigin?: boolean; baseUrl?: string };
export type IIIFResourceOptions = ImageResourceOptions & { format?: string; renderOptions?: CompositeResourceProps };
export type LoadedImageResource = { content: SpacialContent; width: number; height: number };

export async function loadImageResource(url: string, options: ImageResourceOptions = {}): Promise<LoadedImageResource> {
  const image = await loadImage(url, options);
  const size = { width: image.naturalWidth, height: image.naturalHeight };
  return { content: SingleImage.fromImage(url, size), ...size };
}

/** Load Image API 2/3 metadata, or reuse metadata already fetched by an application. */
export async function loadIIIFImageResource(
  input: string | ImageService,
  options: IIIFResourceOptions = {}
): Promise<LoadedImageResource> {
  options.signal?.throwIfAborted();
  let service: ImageService;
  if (typeof input === 'string') {
    const infoUrl = new URL(input, options.baseUrl ?? globalThis.document?.baseURI);
    infoUrl.pathname = infoUrl.pathname.replace(/\/$/, '');
    if (!infoUrl.pathname.endsWith('/info.json')) infoUrl.pathname += '/info.json';
    const response = await fetch(infoUrl.href, { signal: options.signal });
    if (!response.ok) throw new Error(`Could not load IIIF image service: HTTP ${response.status}`);
    service = await response.json();
  } else service = input;
  options.signal?.throwIfAborted();
  if (!service || !isImageService(service)) throw new Error('Expected an IIIF Image API service, not a manifest');
  const id = service.id || service['@id'];
  const { width, height } = service;
  if (
    typeof id !== 'string' ||
    !id ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error('IIIF image service must have an id and positive width and height');
  }
  const base = id.replace(/\/(?:info\.json)?$/, '');
  const contexts = Array.isArray(service['@context']) ? service['@context'] : [service['@context']];
  const version3 = service.type === 'ImageService3' || contexts.includes('http://iiif.io/api/image/3/context.json');
  const format = options.format ?? 'jpg';
  const size = { width, height };
  const images: SpacialContent[] = [];
  for (const tile of service.tiles ?? []) {
    if (
      !Number.isFinite(tile.width) ||
      tile.width <= 0 ||
      (tile.height !== undefined && (!Number.isFinite(tile.height) || tile.height <= 0)) ||
      !Array.isArray(tile.scaleFactors)
    ) {
      throw new Error('Invalid IIIF tile dimensions or scale factors');
    }
    for (const factor of tile.scaleFactors) {
      if (!Number.isFinite(factor) || factor <= 0) throw new Error('Invalid IIIF tile scale factor');
      images.push(TiledImage.fromTile(base, size, tile, factor, service, format, false, version3));
    }
  }
  // Fixed-size services can still be viewed, with detail limited to the advertised sizes.
  if (!images.length) {
    for (const display of service.sizes ?? []) {
      if (
        !Number.isFinite(display.width) ||
        !Number.isFinite(display.height) ||
        display.width <= 0 ||
        display.height <= 0
      ) {
        throw new Error('Invalid IIIF image size');
      }
      const parameter = version3 ? `${display.width},${display.height}` : `${display.width},`;
      images.push(SingleImage.fromImage(`${base}/full/${parameter}/0/default.${format}`, size, display));
    }
    if (!images.length) {
      const request = createImageServiceRequest({ ...service, id: base });
      if (request.type !== 'image') throw new Error('Could not construct an IIIF image request');
      request.format = format;
      const imageUrl = imageServiceRequestToString(request, service);
      const image = await loadImage(imageUrl, options);
      images.push(SingleImage.fromImage(imageUrl, size, { width: image.naturalWidth, height: image.naturalHeight }));
    }
  }
  return {
    content: new CompositeResource({ id: base, ...size, images, renderOptions: options.renderOptions }),
    ...size,
  };
}

function loadImage(url: string, options: ImageResourceOptions): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    options.signal?.throwIfAborted();
    const image = new Image();
    if (options.crossOrigin) image.crossOrigin = 'anonymous';
    const cleanup = () => {
      image.onload = image.onerror = null;
      options.signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      image.removeAttribute('src');
      reject(options.signal!.reason);
    };
    image.onload = () => {
      cleanup();
      if (image.naturalWidth > 0 && image.naturalHeight > 0) resolve(image);
      else reject(new Error(`Image has no usable dimensions: ${url}`));
    };
    image.onerror = () => {
      cleanup();
      reject(new Error(`Could not load image: ${url}`));
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    image.src = url;
  });
}
