import { Atlas } from '../Atlas';
import React from 'react';
import useMeasure from 'react-use-measure';
import { ViewerMode } from '../../../renderer/runtime';

export const AtlasAuto: React.FC<{
  mode?: ViewerMode;
  onCreated?: (ctx: any) => void | Promise<void>;
  style?: React.CSSProperties;
}> = ({ style, ...props }) => {
  const [ref, bounds] = useMeasure();

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', ...style }}>
      <Atlas width={bounds.width || 100} height={bounds.height || 100} {...props}>
        {props.children}
      </Atlas>
    </div>
  );
};
