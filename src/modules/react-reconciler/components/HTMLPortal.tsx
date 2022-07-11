import React, { ReactNode, useLayoutEffect, useRef } from 'react';
import { Box } from '../../../objects/box';
import { createRoot, Root } from 'react-dom/client';
import { useFrame } from '../hooks/use-frame';
import { useRuntime } from '../hooks/use-runtime';

export const HTMLPortal: React.FC<
  {
    children?: ReactNode;
    backgroundColor?: string;
    interactive?: boolean;
    relative?: boolean;
    target?: { x: number; y: number; width: number; height: number };
  } & React.RefAttributes<Box>
> = React.forwardRef<
  Box,
  {
    children?: ReactNode;
    backgroundColor?: string;
    interactive?: boolean;
    relative?: boolean;
    target?: { x: number; y: number; width: number; height: number };
    style?: any;
  }
>(({ children, ...props }, fwdRef) => {
  const ref = useRef<HTMLDivElement>();
  const runtime = useRuntime();
  const lastScale = useRef(0);
  const boxRef = useRef<Box>();
  const root = useRef<Root>();

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

    function render() {
      if (box && box.__host) {
        if (!root.current) {
          root.current = createRoot(box.__host.element);
        }

        if (props.relative) {
          root.current.render(<div ref={ref as any}>{children}</div>);
        } else {
          root.current.render(children as any);
        }
      }
    }

    if (box && box.__host) {
      render();
    } else if (box) {
      box.__onCreate = render;
    }
  }, [fwdRef, children, boxRef, props.relative]);

  return <box html {...props} ref={boxRef} />;
});
