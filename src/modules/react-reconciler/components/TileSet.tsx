import React from 'react';
import { GetTile } from '../../iiif/get-tiles';

export const TileSet: React.FC<{
  tiles: GetTile;
  x: number;
  y: number;
  width: number;
  height: number;
}> = props => {
  const scale = props.width / props.tiles.width;

  return (
    <worldObject
      key={props.tiles.imageService.id}
      scale={scale}
      height={props.tiles.height}
      width={props.tiles.width}
      x={props.x}
      y={props.y}
    >
      <compositeImage
        key={props.tiles.imageService.id}
        id={props.tiles.imageService.id}
        width={props.tiles.width}
        height={props.tiles.height}
      >
        {props.tiles.thumbnail ? (
          <worldImage
            uri={props.tiles.thumbnail.id}
            target={{ width: props.tiles.width, height: props.tiles.height }}
            display={{ width: props.tiles.thumbnail.width, height: props.tiles.thumbnail.height }}
          />
        ) : null}
        {(props.tiles.imageService.tiles || []).map((tile: any) =>
          (tile.scaleFactors || []).map((size: number) => (
            <tiledImage
              key={`${tile}-${size}`}
              uri={props.tiles.imageService.id}
              display={{ width: props.tiles.width, height: props.tiles.height }}
              tile={tile}
              scaleFactor={size}
            />
          ))
        )}
      </compositeImage>
    </worldObject>
  );
};
