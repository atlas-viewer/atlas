import React, { ReactNode, useLayoutEffect, useRef } from 'react';
import { Box } from '../../../objects/box';
import { useFrame } from '../hooks/use-frame';
import { useRuntime } from '../hooks/use-runtime';
import { renderReactDom } from '../utility/react-dom';

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
  const root = useRef<any>();

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
          if (ref.current && boxRef.current?.__owner.value?.rotation) {
            relativeBox.style.transform = `scale(${1 / lastScale.current}) translate(50%, 50%) rotate(${
              boxRef.current?.__owner.value?.rotation || 0
            }deg)  translate(-50%, -50%)`;
          }
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
    async function renderHost() {
      if (box && box.__host) {
        const toRender = props.relative ? <div ref={ref as any}>{children as any}</div> : (children as any);

        await renderReactDom(box.__host.element, toRender, root);
      }
    }

    if (box && box.__host) {
      renderHost();
    } else if (box) {
      box.__onCreate = renderHost;
    }
  }, [fwdRef, children, boxRef, props.relative]);

  useLayoutEffect(() => {
    return () => {
      if (root.current) {
        setTimeout(() => {
          root.current.unmount();
        }, 0);
      }
    };
  }, []);

  return <box html {...props} ref={boxRef} />;
});

HTMLPortal.displayName = 'HTMLPortal';
