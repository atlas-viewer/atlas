import React, { ReactNode, useLayoutEffect, useRef } from 'react';
import { Box } from '../../../objects/box';
import { useFrame } from '../hooks/use-frame';
import { useRuntime } from '../hooks/use-runtime';
import { renderReactDom } from '../utility/react-dom';

// Flip `globalThis.ATLAS_DEBUG_HTML_PORTAL = true` (e.g. in the browser console)
// to trace the portal lifecycle. Left off by default so it's silent in prod.
function portalDebug(...args: any[]) {
  if (typeof globalThis !== 'undefined' && (globalThis as any).ATLAS_DEBUG_HTML_PORTAL) {
    // eslint-disable-next-line no-console
    console.debug('[HTMLPortal]', ...args);
  }
}

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
    children?: any;
  }
>(({ children, ...props }, fwdRef) => {
  const ref = useRef<HTMLDivElement>();
  const runtime = useRuntime();
  const lastScale = useRef(0);
  const boxRef = useRef<Box>();
  const root = useRef<any>();
  // Tracks whether this component instance has been torn down. The render below
  // is async (dynamic import of react-dom + the reconciler can create the host
  // lazily, e.g. while the viewer waits for images to load), so a render can
  // otherwise be attempted after unmount, which previously reused a dead root
  // and threw "Cannot update an unmounted root".
  const disposed = useRef(false);
  // Handle for a deferred root unmount so a quick re-render (e.g. React
  // StrictMode's mount/unmount/remount, or children changing right after a
  // teardown) can cancel it and keep reusing the same live root instead of
  // tearing it down and re-creating a second root on the same host element.
  const unmountTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // The renderHost callback we last handed to the box via `__onCreate`, so we
  // can detach it on cleanup and avoid a stale closure being invoked later.
  const pendingOnCreate = useRef<(() => void) | undefined>(undefined);

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
    // (Re)mounting: this effect runs before the teardown effect's setup, so it's
    // the safe place to clear the disposed flag for this render pass.
    disposed.current = false;
    // If a teardown scheduled an unmount but we're rendering again before it
    // fired, cancel it and reuse the live root.
    if (unmountTimer.current !== undefined) {
      clearTimeout(unmountTimer.current);
      unmountTimer.current = undefined;
    }

    const box = boxRef.current;
    if (fwdRef && box) {
      if (typeof fwdRef === 'function') {
        fwdRef(box);
      } else {
        fwdRef.current = box;
      }
    }

    async function renderHost() {
      const box = boxRef.current;
      if (!box || !box.__host) {
        return;
      }
      if (disposed.current) {
        portalDebug('renderHost skipped: disposed before render', box.__id);
        return;
      }
      const toRender = props.relative ? <div ref={ref as any}>{children as any}</div> : (children as any);

      portalDebug('renderHost start', box.__id);
      await renderReactDom(box.__host.element, toRender, root);

      // The await above yields to the microtask queue; if the component was torn
      // down while we were rendering (and not re-mounted), clean up the root we
      // just created so it doesn't leak.
      if (disposed.current && root.current && !root.current.unmounted) {
        portalDebug('renderHost disposed during render, unmounting', box.__id);
        const dead = root.current;
        root.current = undefined;
        dead.unmount();
      } else {
        portalDebug('renderHost done', box.__id);
      }
    }

    if (box && box.__host) {
      renderHost();
    } else if (box) {
      portalDebug('host not ready, deferring render via __onCreate', box.__id);
      pendingOnCreate.current = renderHost;
      box.__onCreate = renderHost;
    }
  }, [fwdRef, children, boxRef, props.relative]);

  useLayoutEffect(() => {
    return () => {
      disposed.current = true;

      const box = boxRef.current;
      // Detach our deferred host callback so it can't fire after teardown.
      if (box && pendingOnCreate.current && box.__onCreate === pendingOnCreate.current) {
        box.__onCreate = undefined;
      }
      pendingOnCreate.current = undefined;

      // Defer the unmount: React warns if a root is unmounted synchronously
      // while it's already rendering. A re-mount before this fires will cancel
      // it (see the render effect above) so the live root is reused.
      if (root.current && !root.current.unmounted) {
        unmountTimer.current = setTimeout(() => {
          unmountTimer.current = undefined;
          const currentRoot = root.current;
          root.current = undefined;
          if (currentRoot) {
            portalDebug('deferred unmount', box?.__id);
            currentRoot.unmount();
          }
        }, 0);
      }
    };
  }, []);

  return <box html {...props} ref={boxRef} />;
});

HTMLPortal.displayName = 'HTMLPortal';
