import React, { useCallback } from 'react';
import { useMode } from '../hooks/use-mode';
import { ResizeWorldItem } from './ResizeWorldItem';

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
  background?: string;
  border?: string;
}> = ({ region, onClick, onSave, isEditing, border = 'none', background = 'rgba(0,0,0,.4)' }) => {
  const mode = useMode();

  const saveCallback = useCallback(
    bounds => {
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
        onClick={
          mode === 'explore'
            ? e => {
                e.preventDefault();
                e.stopPropagation();
                onClick(region);
              }
            : () => void 0
        }
        target={{ x: 0, y: 0, width: region.width, height: region.height }}
        backgroundColor={background}
        border={border}
      />
    </ResizeWorldItem>
  );
};
