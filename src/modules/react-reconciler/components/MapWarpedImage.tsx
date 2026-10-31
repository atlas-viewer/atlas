/* @refresh skip */
import React, { useEffect, useMemo, useState } from 'react';
import { createWarpTransformer } from '../../maps/warped/transformer';
import { validateResourceMask, type WarpMeshOptions } from '../../maps/warped/mesh';
import type { WarpControlPoint, WarpTransformationType, WarpTransformer } from '../../maps/warped/types';
import type { WarpAdapterController } from '../../maps/warped/adapter';
import type { CompositeResourceProps } from '../../../spacial-content/composite-resource';
import { TiledImage } from '../../../spacial-content/tiled-image';
import type { WarpedImageTile } from '../../../spacial-content/warped-image';
import { useMapProjectionContext } from '../hooks/use-map-projection';

export type MapWarpedImageService = {
  /** Image service id (without `/info.json`). */
  id: string;
  width: number;
  height: number;
  tiles?: Array<{ width: number; height?: number; scaleFactors: number[] }>;
  /** IIIF Image API 3 services use `w,h` sizes in tile requests. */
  version3?: boolean;
  format?: string;
};

export type MapWarpedImageProps = {
  /** Single clipping polygon in full-resolution image pixels; concave and closed rings are supported. */
  resourceMask?: WarpMeshOptions['resourceMask'];
  id?: string;
  /** Georeferencing control points (image pixels <-> lng/lat). */
  controlPoints?: WarpControlPoint[];
  transformationType?: WarpTransformationType;
  /**
   * A ready made transformer, e.g. `fromAllmapsTransformer(new GcpTransformer(...))`. Takes
   * precedence over `controlPoints`.
   */
  transformer?: WarpTransformer;
  /** Drives control points / type from a `WarpAdapterController` and re-renders on change. */
  controller?: WarpAdapterController;

  /** A single image. `width` / `height` are its full resolution pixel size. */
  uri?: string;
  width?: number;
  height?: number;
  /** Decoded size of `uri` when it is a downscaled version of the `width` x `height` image. */
  pixelWidth?: number;
  pixelHeight?: number;
  /** A tiled IIIF image service, limited to 30,000 tile meshes across all levels. */
  service?: MapWarpedImageService;

  opacity?: number;
  /** Mesh cells along the image's longest side. Higher is smoother for non-affine transformations. */
  resolution?: number;
  renderOptions?: CompositeResourceProps;
  /** Called when source dimensions, mesh options or the transformation are invalid. */
  onError?: (error: Error) => void;
};

type Level = {
  key: string;
  scaleFactor: number;
  tiles: WarpedImageTile[];
};

function buildServiceLevels(service: MapWarpedImageService): Level[] {
  const levels: Level[] = [];
  const tiles = service.tiles || [];
  const tileCount = tiles.reduce(
    (sum, tile) =>
      sum +
      (tile.scaleFactors || []).reduce(
        (n, scale) =>
          n +
          Math.ceil(service.width / (tile.width * scale)) *
            Math.ceil(service.height / ((tile.height ?? tile.width) * scale)),
        0
      ),
    0
  );
  if (!Number.isFinite(tileCount) || tileCount > 30000)
    throw new Error('Warped image services support at most 30,000 tile meshes');
  for (const tile of tiles) {
    for (const scaleFactor of tile.scaleFactors || []) {
      const tiled = TiledImage.fromTile(
        service.id,
        { width: service.width, height: service.height },
        tile,
        scaleFactor,
        undefined,
        service.format,
        undefined,
        service.version3
      );
      const count = tiled.columns * tiled.rows;
      const levelTiles: WarpedImageTile[] = [];
      for (let i = 0; i < count; i++) {
        // Large TiledImages allocate only visible windows; descriptors must not read their buffers.
        const x1 = (i % tiled.columns) * tiled.tileWidth * scaleFactor;
        const y1 = Math.floor(i / tiled.columns) * tiled.tileHeight * scaleFactor;
        const x2 = Math.min(service.width, x1 + tiled.tileWidth * scaleFactor);
        const y2 = Math.min(service.height, y1 + tiled.tileHeight * scaleFactor);
        levelTiles.push({
          x1,
          y1,
          x2,
          y2,
          pixelWidth: Math.ceil((x2 - x1) / scaleFactor),
          pixelHeight: Math.ceil((y2 - y1) / scaleFactor),
          url: tiled.getImageUrl(i),
        });
      }
      levels.push({
        key: `${tile.width}x${tile.height || tile.width}-${scaleFactor}`,
        scaleFactor,
        tiles: levelTiles,
      });
    }
  }
  return levels;
}

/**
 * Draws an image georeferenced onto the enclosing `MapObject`, warping it with the given control
 * points. Works with single images and IIIF image services.
 */
export const MapWarpedImage: React.FC<MapWarpedImageProps> = ({
  resourceMask,
  id,
  controlPoints,
  transformationType = 'affine',
  transformer: transformerProp,
  controller,
  uri,
  width,
  height,
  pixelWidth,
  pixelHeight,
  service,
  opacity,
  resolution,
  renderOptions,
  onError,
}) => {
  const map = useMapProjectionContext();

  // Re-render when an external controller changes.
  const [, setRevision] = useState(0);
  useEffect(() => {
    if (!controller) {
      return;
    }
    return controller.subscribe(() => setRevision((value) => value + 1));
  }, [controller]);

  const state = controller ? controller.getState() : null;
  const effectivePoints = state ? state.controlPoints : controlPoints;
  const effectiveType = state ? state.transformationType : transformationType;

  const { transformer, error } = useMemo((): {
    transformer: WarpTransformer | null;
    error: Error | null;
  } => {
    try {
      validateResourceMask(resourceMask);
    } catch (error) {
      return { transformer: null, error: error instanceof Error ? error : new Error(String(error)) };
    }
    if (transformerProp) {
      return { transformer: transformerProp, error: null };
    }
    if (controller) {
      const fromController = controller.getTransformer();
      return { transformer: fromController, error: controller.getError() };
    }
    try {
      return {
        transformer: createWarpTransformer(effectivePoints || [], effectiveType),
        error: null,
      };
    } catch (e) {
      return {
        transformer: null,
        error: e instanceof Error ? e : new Error(String(e)),
      };
    }
    // `controller` mutates in place, so its revision is not part of the deps; the state
    // snapshot above is what changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transformerProp, controller, effectivePoints, effectiveType, state, resourceMask]);

  const { levels, sourceError } = useMemo(() => {
    try {
      if (resolution !== undefined && (!Number.isInteger(resolution) || resolution < 1 || resolution > 256)) {
        throw new Error('Warp resolution must be an integer between 1 and 256');
      }
      for (const size of [service?.width ?? width, service?.height ?? height, pixelWidth, pixelHeight]) {
        if (size !== undefined && (!Number.isFinite(size) || size <= 0))
          throw new Error('Image dimensions must be finite and greater than zero');
      }
      const build = (): Level[] => {
        if (service) {
          return buildServiceLevels(service);
        }
        if (uri && width && height) {
          const decodedWidth = pixelWidth || width;
          const decodedHeight = pixelHeight || height;
          return [
            {
              key: 'image',
              scaleFactor: width / decodedWidth,
              tiles: [
                {
                  x1: 0,
                  y1: 0,
                  x2: width,
                  y2: height,
                  pixelWidth: decodedWidth,
                  pixelHeight: decodedHeight,
                  url: uri,
                },
              ],
            },
          ];
        }
        return [];
      };
      return { levels: build(), sourceError: null };
    } catch (error) {
      return { levels: [], sourceError: error instanceof Error ? error : new Error(String(error)) };
    }
  }, [service, uri, width, height, pixelWidth, pixelHeight, resolution]);

  useEffect(() => {
    const reason = error || sourceError;
    if (reason) {
      if (onError) onError(reason);
      else console.error(`[MapWarpedImage] ${reason.message}`);
    }
  }, [error, sourceError, onError]);

  const imageWidth = service ? service.width : width;
  const imageHeight = service ? service.height : height;

  const compositeOptions = useMemo<CompositeResourceProps>(
    () => ({
      minScaleGap: 0,
      ...(renderOptions || {}),
    }),
    [renderOptions]
  );

  if (!transformer || !imageWidth || !imageHeight || !levels.length) {
    return null;
  }

  const baseId = id || service?.id || uri || 'warped-image';
  // Instances are not re-fitted for new tiles, so changes to the source must remount them.
  const sourceKey = service
    ? `${service.id}|${service.width}x${service.height}|${service.format || 'jpg'}|${!!service.version3}`
    : `${uri}|${width}x${height}|${pixelWidth || ''}x${pixelHeight || ''}`;
  const style = typeof opacity === 'number' ? { opacity } : undefined;

  return React.createElement(
    'composite-image',
    {
      id: `${baseId}-composite`,
      width: map.width,
      height: map.height,
      renderOptions: compositeOptions,
    },
    levels.map((level) =>
      React.createElement('warped-image', {
        key: `${baseId}-${sourceKey}-${level.key}`,
        id: `${baseId}-${level.key}`,
        tiles: level.tiles,
        imageWidth,
        imageHeight,
        scaleFactor: level.scaleFactor,
        transformer,
        lngLatToWorld: map.projection.lngLatToWorld,
        transformationType: transformer.type,
        resolution,
        resourceMask,
        style,
      })
    )
  );
};
