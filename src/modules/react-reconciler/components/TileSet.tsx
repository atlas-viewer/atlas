import React, { ReactNode, useMemo } from 'react';
import { GetTile } from '../../iiif/shared';
import { CompositeResourceProps } from '../../../spacial-content';

export const TileSet: React.FC<{
  tiles: GetTile;
  x?: number;
  y?: number;
  width: number;
  height: number;
  rotation?: number;
  crop?: any;
  children?: ReactNode;
  enableThumbnail?: boolean;
  enableSizes?: boolean;
  onClick?: (e: any) => void;
  renderOptions?: CompositeResourceProps;
}> = (props) => {
  const scale = props.width / (props.crop?.width || props.tiles.width);
  const sizes = props.tiles.imageService.sizes || [];
  const enableThumbnail = props.enableThumbnail;
  const enableSizes = props.enableSizes;
  const canonicalId = useMemo(() => {
    const id = props.tiles.imageService.id || (props.tiles.imageService['@id'] as string);
    if (id && id.endsWith('/info.json')) {
      return id.slice(0, -1 * '/info.json'.length);
    }
    return id;
  }, [props.tiles.imageService.id]);

  const tiles = useMemo(() => {
    const tiles = props.tiles.imageService.tiles || [];

    if (!tiles.length) {
      const width = props.width;
      let scaleFactors = [1];
      let last = 1;
      while (Math.pow(2, last) < width) {
        last = last * 2;
        scaleFactors.push(last);
      }

      return [
        // {
        //   width: 256,
        //   height: 256,
        //   scaleFactors: [1, 2, 4, 8],
        // },
      ];
    }

    return tiles;
  }, [props.tiles.imageService]);

  return (
    <world-object
      rotation={props.rotation}
      key={props.tiles.imageService.id}
      scale={scale}
      height={props.crop?.height || props.tiles.height}
      width={props.crop?.width || props.tiles.width}
      x={props.x}
      y={props.y}
      onClick={props.onClick}
    >
      <composite-image
        key={props.tiles.imageService.id}
        id={props.tiles.imageService.id}
        width={props.crop?.width || props.tiles.width}
        height={props.crop?.height || props.tiles.height}
        crop={props.crop}
        renderOptions={props.renderOptions}
      >
        {enableThumbnail && props.tiles.thumbnail ? (
          <world-image
            priority
            uri={props.tiles.thumbnail.id}
            target={{ width: props.tiles.width, height: props.tiles.height }}
            display={{ width: props.tiles.thumbnail.width, height: props.tiles.thumbnail.height }}
            crop={props.crop}
          />
        ) : null}
        {enableSizes &&
          sizes.map((size, n) => (
            <world-image
              key={n}
              uri={`${canonicalId}/full/${size.width},${size.height}/0/default.jpg`}
              target={{ width: props.tiles.width, height: props.tiles.height }}
              display={{ width: size.width, height: size.height }}
              crop={props.crop}
            />
          ))}
        {tiles.map((tile: any) =>
          (tile.scaleFactors || []).map((size: number) => {
            return (
              <tiled-image
                key={`${props.tiles.imageService.id}-tile-${size}`}
                uri={props.tiles.imageService.id}
                display={{ width: props.tiles.width, height: props.tiles.height }}
                tile={tile}
                scaleFactor={size}
                crop={props.crop}
              />
            );
          })
        )}
      </composite-image>
    </world-object>
  );
};
