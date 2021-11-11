import { Atlas } from '../Atlas';
import React, { useEffect } from 'react';
import useMeasure from 'react-use-measure';
import { ViewerMode } from '../../../renderer/runtime';
import { PopmotionControllerConfig } from '../../popmotion-controller/popmotion-controller';

export const AtlasAuto: React.FC<{
  mode?: ViewerMode;
  onCreated?: (ctx: any) => void | Promise<void>;
  style?: React.CSSProperties;
  resizeHash?: number;
  unstable_webglRenderer?: boolean;
  unstable_noReconciler?: boolean;
  controllerConfig?: PopmotionControllerConfig;
}> = ({ style, resizeHash, ...props }) => {
  const [ref, bounds, forceRefresh] = useMeasure();

  const { width, height } = style || {};

  useEffect(() => {
    forceRefresh();
  }, [width, height, resizeHash, forceRefresh]);

  return (
    <div ref={ref} style={{ width: '100%', height: 600, ...style }}>
      <Atlas width={bounds.width || 100} height={bounds.height || 100} {...props}>
        {props.children}
      </Atlas>
    </div>
  );
};
