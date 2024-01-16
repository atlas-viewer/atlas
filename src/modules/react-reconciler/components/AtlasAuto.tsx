import { Atlas, AtlasProps } from '../Atlas';
import React, { useEffect, useMemo } from 'react';
import useMeasure from 'react-use-measure';
import { Container } from './Container';
import { toPx } from '../utility/to-px';

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
    <Container ref={ref} className="atlas-container" {...containerProps}>
      {bounds.width ? (
        <Atlas width={bounds.width || 100} height={bounds.height || 100} {...restProps}>
          {props.children}
        </Atlas>
      ) : null}
      {props.hideInlineStyle ? null : (
        <style>{`
          .atlas-container { 
            display: var(--atlas-container-display, block);
            flex: var(--atlas-container-flex, none);
            width: var(--atlas-container-width, ${width ? `${width}px` : '100%'});
            height: var(--atlas-container-height, ${toPx(height ? height : aspectRatio ? bounds.height : 512)})  
          }
      `}</style>
      )}
      {props.htmlChildren}
    </Container>
  );
};
