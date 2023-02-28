import React, { ReactNode, useMemo } from 'react';
import { GetTile } from '../../iiif/shared';

export const TileSet: React.FC<{
  tiles: GetTile;
  x?: number;
  y?: number;
  width: number;
  height: number;
  rotation?: number;
  crop?: any;
  children?: ReactNode;
  onClick?: (e: any) => void;
}> = (props) => {
  const scale = props.width / props.tiles.width;
  const tiles = props.tiles.imageService.tiles || [];
  const sizes = props.tiles.imageService.sizes || [];
  const canonicalId = useMemo(() => {
    const id = props.tiles.imageService.id || (props.tiles.imageService['@id'] as string);
    if (id && id.endsWith('/info.json')) {
      return id.slice(0, -1 * '/info.json'.length);
    }
    return id;
  }, [props.tiles.imageService.id]);

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
      >
        {(false as boolean) && props.tiles.thumbnail ? (
          <world-image
            priority
            uri={props.tiles.thumbnail.id}
            target={{ width: props.tiles.width, height: props.tiles.height }}
            display={{ width: props.tiles.thumbnail.width, height: props.tiles.thumbnail.height }}
            crop={props.crop}
          />
        ) : null}
        {(false as boolean) &&
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
