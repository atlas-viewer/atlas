import React, { useCallback } from 'react';
import { useMode } from '../hooks/use-mode';
import { ResizeWorldItem } from './ResizeWorldItem';
import { BoxStyle } from '../../../objects/box';

type RegionHighlightType = {
  id: any;
  x: number;
  y: number;
  width: number;
  height: number;
};

export const RegionHighlight: React.FC<{
  id?: string;
  region: RegionHighlightType;
  isEditing: boolean;
  onSave: (annotation: RegionHighlightType) => void;
  onClick: (annotation: RegionHighlightType) => void;
  interactive?: boolean;
  style?: BoxStyle;
}> = ({ interactive, region, onClick, onSave, isEditing, style = { backgroundColor: 'rgba(0,0,0,.5)' } }) => {
  const mode = useMode();

  const saveCallback = useCallback(
    (bounds) => {
      onSave({ id: region.id, x: region.x, y: region.y, height: region.height, width: region.width, ...bounds });
    },
    [onSave, region.id, region.x, region.y, region.height, region.width]
  );

  return (
    <ResizeWorldItem
      x={region.x}
      y={region.y}
      width={region.width}
      height={region.height}
      resizable={isEditing}
      onSave={saveCallback}
    >
      <box
        interactive={interactive}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick(region);
        }}
        target={{ x: 0, y: 0, width: region.width, height: region.height }}
        style={style}
      />
    </ResizeWorldItem>
  );
};
