import React, { useLayoutEffect, useRef } from 'react';
import { Box } from '../../../objects/box';
import { render } from 'react-dom';
import { useFrame } from '../hooks/use-frame';
import { useRuntime } from '../hooks/use-runtime';

export const HTMLPortal: React.FC<
  {
    backgroundColor?: string;
    interactive?: boolean;
    relative?: boolean;
    target?: { x: number; y: number; width: number; height: number };
  } & React.RefAttributes<Box>
> = React.forwardRef<
  Box,
  {
    backgroundColor?: string;
    interactive?: boolean;
    relative?: boolean;
    target?: { x: number; y: number; width: number; height: number };
  }
>(({ children, ...props }, fwdRef) => {
  const ref = useRef<HTMLDivElement>();
  const runtime = useRuntime();
  const lastScale = useRef(0);
  const boxRef = useRef<Box>();

  useFrame(() => {
    if (props.relative) {
      const relativeBox = ref.current;
      if (relativeBox && runtime) {
        const scaleFactor = runtime.getScaleFactor();
        if (lastScale.current !== scaleFactor) {
          lastScale.current = scaleFactor;
          relativeBox.style.transformOrigin = '0 0';
          relativeBox.style.transform = `scale(${1 / lastScale.current})`;
          relativeBox.style.width = `${lastScale.current * 100}%`;
          relativeBox.style.height = `${lastScale.current * 100}%`;
        }
      }
    }
  }, [props.relative]);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (fwdRef && box) {
      if (typeof fwdRef === 'function') {
        fwdRef(box);
      } else {
        fwdRef.current = box;
      }
    }
    if (box && box.__host) {
      if (props.relative) {
        render(<div ref={ref as any}>{children}</div>, box.__host.element);
      } else {
        render(children as any, box.__host.element);
      }
    } else if (box) {
      box.__onCreate = () => {
        if (props.relative) {
          render(<div ref={ref as any}>{children}</div>, box.__host.element);
        } else {
          render(children as any, box.__host.element);
        }
      };
    }
  }, [fwdRef, children, boxRef, props.relative]);

  return <box html {...props} ref={boxRef} />;
});
