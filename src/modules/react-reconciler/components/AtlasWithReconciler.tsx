import React, { ReactNode, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { ReactAtlas } from '../reconciler';
import { ModeContext } from '../hooks/use-mode';
import { AtlasContext, BoundsContext } from './AtlasContext';
import { ViewerMode } from '../../../renderer/runtime';
import { Preset } from '../presets/_types';
import { RectReadOnly } from 'react-use-measure';
import { useIsomorphicLayoutEffect } from '../utility/react';

type AtlasWithReconcilerProps = {
  onCreated?: (ctx: Preset) => void | Promise<void>;
  setIsReady: (value: boolean) => void;
  mode?: ViewerMode;
  bounds: RectReadOnly;
  preset: Preset | null;
  children?: ReactNode;
};

export const AtlasWithReconciler: React.FC<AtlasWithReconcilerProps> = React.memo(
  ({ children, setIsReady, onCreated, bounds, preset, mode = 'explore' }) => {
    const AtlasRoot = useCallback(
      function AtlasRoot(props: { children: React.ReactElement }): JSX.Element {
        const strictModeDoubleRender = useRef(false);

        const activate = () => {
          setIsReady(true);
        };

        useEffect(() => {
          if (preset && !strictModeDoubleRender.current) {
            preset.runtime.goHome();

            const result = onCreated && onCreated(preset);
            return void (result && result.then ? result.then(activate) : activate());
          }
          return () => {
            // no-op
          };
        }, []);

        useEffect(() => {
          strictModeDoubleRender.current = true;
        }, []);

        return props.children;
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [preset]
    );

    useIsomorphicLayoutEffect(() => {
      if (preset) {
        const runtime = preset.runtime;
        if (mode !== runtime.mode) {
          runtime.mode = mode;
        }

        ReactAtlas.render(
          <React.StrictMode>
            <AtlasRoot>
              <BoundsContext.Provider value={bounds}>
                <ModeContext.Provider value={mode}>
                  <AtlasContext.Provider value={preset}>{children}</AtlasContext.Provider>
                </ModeContext.Provider>
              </BoundsContext.Provider>
            </AtlasRoot>
          </React.StrictMode>,
          runtime
        );
      }
    }, [preset, mode, children]);

    useIsomorphicLayoutEffect(() => {
      if (preset) {
        const runtime = preset.runtime;

        return () => {
          ReactAtlas.unmountComponentAtNode(runtime);
        };
      }
      return () => {
        // no-op
      };
    }, [preset]);

    return null;
  }
);
