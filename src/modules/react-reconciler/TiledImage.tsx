import React from 'react';
import { GetTile } from '../iiif/get-tiles';

export const TiledImage: React.FC<{
  tile: GetTile;
  x: number;
  y: number;
  width: number;
  height: number;
}> = props => {
  const scale = props.width / props.tile.width;

  return (
    <worldObject scale={scale} height={props.tile.height} width={props.tile.width} x={props.x} y={props.y}>
      <compositeImage
        key={props.tile.imageService.id}
        id={props.tile.imageService.id}
        width={props.tile.width}
        height={props.tile.height}
      >
        {props.tile.thumbnail ? (
          <worldImage
            uri={props.tile.thumbnail.id}
            target={{ width: props.tile.width, height: props.tile.height }}
            display={{ width: props.tile.thumbnail.width, height: props.tile.thumbnail.height }}
          />
        ) : null}
        {(props.tile.imageService.tiles || []).map((tile: any) =>
          (tile.scaleFactors || []).map((size: number) => (
            <tiledImage
              key={`${tile}-${size}`}
              uri={props.tile.imageService.id}
              display={{ width: props.tile.width, height: props.tile.height }}
              tile={tile}
              scaleFactor={size}
            />
          ))
        )}
      </compositeImage>
    </worldObject>
  );
};
