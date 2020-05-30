import React, { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Renderer } from '../../renderer/renderer';
import { World } from '../../world';
import { DnaFactory, Strand } from '@atlas-viewer/dna';
import { RuntimeController } from '../../types';
import { ReactAtlas } from './reconciler';
import { popmotionController } from '../popmotion-controller/popmotion-controller';
import { CanvasRenderer } from '../canvas-renderer/canvas-renderer';
import { Runtime } from '../../renderer/runtime';
import { Paintable } from '../../world-objects/paint';

const AtlasContext = React.createContext<
  | {
      runtime: Runtime;
      canvas: { current: HTMLCanvasElement };
    }
  | undefined
>(undefined);

type AtlasProps = {
  width: number;
  height: number;
  onCreated?: (ctx: RuntimeContext) => void | Promise<void>;
};

type RuntimeContext = any;

type _RuntimeContext = {
  renderer: Renderer;
  world: World;
  target: Strand;
  aggregate: Strand;
  scaleFactor: number;
  transformBuffer: Strand;
  lastTarget: Strand;
  pendingUpdate: boolean;
  firstRender: boolean;
  lastTime: number;
  stopId?: number;
  controllers: RuntimeController[];
  controllersRunning: boolean;
};

export const useAtlas = () => {
  const ctx = useContext(AtlasContext);

  if (typeof ctx === 'undefined') {
    throw new Error('Cannot useAtlas outside of Atlas component');
  }

  return ctx;
};

export const useRuntime = () => {
  const { runtime } = useAtlas();
  return runtime;
};

export const useFrame = (callback: (time: number) => void) => {
  const runtime = useRuntime();

  useEffect(() => {
    return runtime.registerHook('useFrame', callback);
  }, []);
};

export const useBeforeFrame = (callback: (time: number) => void) => {
  const runtime = useRuntime();

  useEffect(() => {
    return runtime.registerHook('useBeforeFrame', callback);
  }, []);
};

export const useAfterPaint = (callback: (paint: Paintable) => void) => {
  const runtime = useRuntime();

  useEffect(() => {
    return runtime.registerHook('useAfterPaint', callback);
  }, []);
};

export const useAfterFrame = (callback: (time: number) => void) => {
  const runtime = useRuntime();

  useEffect(() => {
    return runtime.registerHook('useAfterFrame', callback);
  }, []);
};

export const useCanvas = () => {
  const { canvas } = useAtlas();
  return canvas.current;
};

export const Atlas: React.FC<AtlasProps> = ({ onCreated, children, ...restProps }) => {
  const canvasRef = useRef<HTMLCanvasElement>();
  const [ready, setReady] = useState(false);
  const state: React.MutableRefObject<RuntimeContext> = useRef<any>({
    ready: ready,
    viewport: { width: restProps.width, height: restProps.height, x: 0, y: 0, scale: 1 },
    renderer: undefined,
    runtime: undefined,
    controller: undefined,
    canvas: canvasRef,
    canvasPosition: undefined,
  });

  const Canvas = useCallback(function Canvas(props: { children: React.ReactElement }): JSX.Element {
    const activate = () => setReady(true);

    useEffect(() => {
      const result = onCreated && onCreated(state.current);
      return void (result && result.then ? result.then(activate) : activate());
    }, []);

    return props.children;
  }, []);

  const handleClick = useCallback(e => {
    const { pageX, pageY } = e;
    if (state.current.click) {
      const { x, y } = state.current.runtime.viewerToWorld(
        pageX - state.current.canvasPosition.left,
        pageY - state.current.canvasPosition.top
      );
      e.atlas = { x, y };

      const point = DnaFactory.singleBox(1, 1, x, y);
      e.atlasTarget = state.current.runtime.world;
      state.current.runtime.world.dispatchEvent('onClick', e);
      const worldObjects = state.current.runtime.world.getObjectsAt(point, true);
      if (worldObjects.length) {
        for (const [obj, images] of worldObjects) {
          e.atlasTarget = obj;
          obj.dispatchEvent('onClick', e);
          if (images.length) {
            for (const image of images) {
              e.atlasTarget = image;
              image.dispatchEvent('onClick', e);
            }
          }
        }
      }
    }
  }, []);

  const handleMouseDown = useCallback(e => {
    state.current.click = true;
    setTimeout(() => {
      state.current.click = false;
    }, 200);
  }, []);

  // Render v-dom into scene
  useLayoutEffect(() => {
    if (!canvasRef.current) {
      throw new Error('Something went wrong mounting canvas.');
    }

    state.current.controller = popmotionController(canvasRef.current as any, {
      maxZoomFactor: 1,
      enableClickToZoom: false,
    });
    state.current.renderer = new CanvasRenderer(canvasRef.current as any, { debug: false });
    state.current.runtime = new Runtime(state.current.renderer, new World(0, 0), state.current.viewport, [
      state.current.controller,
    ]);
    state.current.canvasPosition = canvasRef.current.getBoundingClientRect();

    ReactAtlas.render(
      <Canvas>
        <AtlasContext.Provider value={state.current}>{children}</AtlasContext.Provider>
      </Canvas>,
      state.current.runtime
    );
  }, []);

  return <canvas {...restProps} onClick={handleClick} onMouseDown={handleMouseDown} ref={canvasRef as any} />;
};
