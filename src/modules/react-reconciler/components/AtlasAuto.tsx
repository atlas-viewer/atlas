import { Atlas, AtlasProps } from '../Atlas';
import React, { useEffect, useMemo } from 'react';
import useMeasure from 'react-use-measure';

export const AtlasAuto: React.FC<
  AtlasProps & {
    height?: number | string;
    width?: number | string;
    resizeHash?: number;
    containerProps?: any;
    aspectRatio?: number;
  }
> = ({ resizeHash, aspectRatio, containerProps = {}, ...props }) => {
  const [ref, _bounds, forceRefresh] = useMeasure();

  const { height, width, ...restProps } = props as any;

  useEffect(() => {
    forceRefresh();
  }, [width, height, resizeHash, forceRefresh]);

  const bounds = useMemo(() => {
    if (!aspectRatio) {
      return _bounds;
    }

    // Need to find the case where this is not the solution.
    return {
      width: _bounds.width,
      height: _bounds.width * (1 / aspectRatio),
    };
  }, [_bounds, aspectRatio]);

  return (
    <div
      ref={ref}
      style={{
        width: width || '100%',
        height: height ? height : aspectRatio ? bounds.height : 512,
      }}
      {...containerProps}
    >
      {bounds.width ? (
        <Atlas width={bounds.width || 100} height={bounds.height || 100} {...restProps}>
          {props.children}
        </Atlas>
      ) : null}
    </div>
  );
};
