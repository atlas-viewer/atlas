import React, { useEffect, useState } from 'react';
import { GetTile } from '../../iiif/shared';
import { TileSet } from './TileSet';
import { getTileFromImageService } from '../../iiif/get-tiles';

export const ImageService: React.FC<{ id: string; width: number; height: number; x?: number; y?: number }> = (
  props
) => {
  const [tiles, setTile] = useState<GetTile | undefined>();

  useEffect(() => {
    getTileFromImageService(props.id, props.width, props.height).then((s) => {
      setTile(s);
    });
  }, [props.height, props.id, props.width]);

  return (
    <world-object x={props.x || 0} y={props.y || 0} width={props.width} height={props.height}>
      {tiles ? <TileSet tiles={tiles} x={0} y={0} width={props.width} height={props.height} /> : null}
    </world-object>
  );
};
