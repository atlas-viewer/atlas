import React, { MutableRefObject, useCallback, useEffect, useLayoutEffect } from 'react';
import { ReactAtlas } from '../reconciler';
import { ModeContext } from '../hooks/use-mode';
import { AtlasContext, BoundsContext } from './AtlasContext';
import { ViewerMode } from '../../../renderer/runtime';
import { Preset } from '../presets/_types';
import { RectReadOnly } from 'react-use-measure';

type AtlasWithReconcilerProps = {
  onCreated?: (ctx: Preset) => void | Promise<void>;
  setIsReady: (value: boolean) => void;
  mode?: ViewerMode;
  bounds: RectReadOnly;
  preset: Preset | null;
};

export const AtlasWithReconciler: React.FC<AtlasWithReconcilerProps> = React.memo(
  ({ children, setIsReady, onCreated, bounds, preset, mode = 'explore' }) => {
    const Canvas = useCallback(
      function Canvas(props: { children: React.ReactElement }): JSX.Element {
        const activate = () => {
          setIsReady(true);
        };

        useEffect(() => {
          if (preset) {
            preset.runtime.goHome();

            const result = onCreated && onCreated(preset);
            return void (result && result.then ? result.then(activate) : activate());
          }
          return () => {
            // no-op
          };
        }, []);

        return props.children;
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [preset]
    );

    useLayoutEffect(() => {
      if (preset) {
        const runtime = preset.runtime;
        if (mode !== runtime.mode) {
          runtime.mode = mode;
        }

        ReactAtlas.render(
          <React.StrictMode>
            <Canvas>
              <BoundsContext.Provider value={bounds}>
                <ModeContext.Provider value={mode}>
                  <AtlasContext.Provider value={preset}>{children}</AtlasContext.Provider>
                </ModeContext.Provider>
              </BoundsContext.Provider>
            </Canvas>
          </React.StrictMode>,
          runtime
        );
      }
    }, [preset, mode, children]);

    return null;
  }
);
