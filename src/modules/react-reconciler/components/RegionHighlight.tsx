import React from 'react';
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
  region: RegionHighlightType;
  isEditing: boolean;
  onSave: (annotation: RegionHighlightType) => void;
  onClick: (annotation: RegionHighlightType) => void;
}> = ({ region, onClick, onSave, isEditing }) => {
  const mode = useMode();

  return (
    <ResizeWorldItem
      key={region.id}
      x={region.x}
      y={region.y}
      width={region.width}
      height={region.height}
      resizable={isEditing}
      onSave={bounds => {
        onSave({ ...region, ...bounds });
      }}
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
        backgroundColor={'rgba(0,0,0,.4)'}
      />
    </ResizeWorldItem>
  );
};
