import React, { type ReactNode, useEffect, useRef } from 'react';
import type { RectReadOnly } from 'react-use-measure';
import type { ViewerMode } from '../../../renderer/runtime';
import { ModeContext } from '../hooks/use-mode';
import type { Preset } from '../presets/_types';
import { ReactAtlas } from '../reconciler';
import { useIsomorphicLayoutEffect } from '../utility/react';
import { AtlasContext, BoundsContext } from './AtlasContext';

type AtlasWithReconcilerProps = {
  onCreated?: (ctx: Preset) => void | Promise<void>;
  setIsReady: (value: boolean) => void;
  mode?: ViewerMode;
  interactionMode?: 'popmotion' | 'pdf-scroll-zone';
  bounds: RectReadOnly;
  preset: Preset | null;
  children?: ReactNode;
};

export const AtlasWithReconciler: React.FC<AtlasWithReconcilerProps> = React.memo(
  ({ children, setIsReady, onCreated, bounds, preset, mode = 'explore', interactionMode = 'popmotion' }) => {
    const initializedPresetsRef = useRef(new WeakSet<Preset>());

    useEffect(() => {
      if (!preset) {
        return;
      }
      if (initializedPresetsRef.current.has(preset)) {
        return;
      }

      initializedPresetsRef.current.add(preset);

      if (interactionMode !== 'pdf-scroll-zone') {
        preset.runtime.goHome();
      }

      let cancelled = false;
      Promise.resolve(onCreated?.(preset)).then(() => {
        if (!cancelled) {
          setIsReady(true);
        }
      });

      return () => {
        cancelled = true;
      };
    }, [interactionMode, onCreated, preset, setIsReady]);

    useIsomorphicLayoutEffect(() => {
      if (preset) {
        const runtime = preset.runtime;
        if (mode !== runtime.mode) {
          runtime.mode = mode;
        }

        ReactAtlas.render(
          <React.StrictMode>
            <BoundsContext.Provider value={bounds}>
              <ModeContext.Provider value={mode}>
                <AtlasContext.Provider value={preset}>{children}</AtlasContext.Provider>
              </ModeContext.Provider>
            </BoundsContext.Provider>
          </React.StrictMode>,
          runtime
        );
      }
    }, [preset, mode, bounds, children]);

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
