import React, { useEffect, useState } from 'react';
import { GetTile, getTileFromImageService } from '../../iiif/get-tiles';
import { TileSet } from './TileSet';

export const ImageService: React.FC<{ id: string; width: number; height: number; x?: number; y?: number }> = props => {
  const [tiles, setTile] = useState<GetTile | undefined>();

  useEffect(() => {
    getTileFromImageService(props.id, props.width, props.height).then(s => {
      setTile(s);
    });
  }, [props.height, props.id, props.width]);

  if (!tiles) {
    return <></>;
  }

  return <TileSet tiles={tiles} x={props.x || 0} y={props.y || 0} width={props.width} height={props.height} />;
};
