import { Atlas, AtlasProps } from '../Atlas';
import React, { memo, useEffect, useId, useMemo } from 'react';
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
> = memo(function AtlasAuto({ resizeHash, aspectRatio, containerProps = {}, htmlChildren, ...props }) {
  const [ref, _bounds, forceRefresh] = useMeasure();
  const autoId = useId();
  const { className: containerPropsClassName, ...restContainerProps } = containerProps;

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

  const autoClassName = useMemo(() => `atlas-auto-${autoId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [autoId]);
  const combinedClassName = useMemo(
    () => ['atlas-container', autoClassName, containerPropsClassName].filter(Boolean).join(' ').trim(),
    [autoClassName, containerPropsClassName]
  );
  const inlineStyle = useMemo(
    () => `.${autoClassName} {
            display: var(--atlas-container-display, block);
            flex: var(--atlas-container-flex, none);
            width: var(--atlas-container-width, ${toPx(width ?? '100%')});
            height: var(--atlas-container-height, ${toPx(height ? height : aspectRatio ? bounds.height : 512)})
          }`,
    [aspectRatio, autoClassName, bounds.height, height, width]
  );

  return (
    <Container ref={ref} {...restContainerProps} className={combinedClassName}>
      {bounds.width ? (
        <Atlas width={bounds.width || 100} height={bounds.height || 100} {...restProps}>
          {props.children}
        </Atlas>
      ) : null}
      {props.hideInlineStyle ? null : <style>{inlineStyle}</style>}
      {htmlChildren}
    </Container>
  );
});
