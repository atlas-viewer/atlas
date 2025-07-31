import React, { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Runtime, RuntimeOptions, ViewerFilters, ViewerMode } from '../../renderer/runtime';
import { PopmotionControllerConfig } from '../popmotion-controller/popmotion-controller';
import { ModeContext } from './hooks/use-mode';
import useMeasure from 'react-use-measure';
import { AtlasContext, BoundsContext } from './components/AtlasContext';
import { AtlasWithReconciler } from './components/AtlasWithReconciler';
import { PresetNames, Presets } from './presets';
import { Preset } from './presets/_types';
import { usePreset } from './hooks/use-preset';
import { Projection } from '@atlas-viewer/dna';
import { useClassname } from './hooks/use-classname';
import { Container } from './components/Container';
import { useIsomorphicLayoutEffect } from './utility/react';

export type AtlasProps = {
  debug?: boolean;
  mode?: ViewerMode;
  onCreated?: (ctx: Preset) => void | Promise<void>;
  resetWorldOnChange?: boolean;
  unstable_webglRenderer?: boolean;
  unstable_noReconciler?: boolean;
  overlayStyle?: any;
  containerStyle?: any;
  containerProps?: any;
  controllerConfig?: PopmotionControllerConfig;
  renderPreset?: PresetNames | Presets;
  hideInlineStyle?: boolean;
  homeCover?: true | false | 'start' | 'end';
  homeOnResize?: boolean;
  homePosition?: Projection;
  className?: string;
  background?: string;
  enableNavigator?: boolean;
  htmlChildren?: ReactNode;
  children: ReactNode;
  runtimeOptions?: Partial<RuntimeOptions>;
  filters?: Partial<ViewerFilters>;
};

const filterProperties = [
  'brightness',
  'contrast',
  'grayscale',
  'hueRotate',
  'invert',
  'saturate',
  'sepia',
  'blur',
] as const;

export const Atlas: React.FC<
  AtlasProps & {
    width: number;
    height: number;
  }
> = ({
  htmlChildren,
  renderPreset: _renderPreset,
  onCreated,
  mode: _mode = 'explore',
  resetWorldOnChange = true,
  // eslint-disable-next-line
  unstable_webglRenderer = false,
  // eslint-disable-next-line
  unstable_noReconciler = false,
  hideInlineStyle = false,
  controllerConfig,
  children,
  overlayStyle,
  containerStyle,
  enableNavigator,
  className,
  containerProps = {},
  homePosition,
  homeOnResize,
  homeCover,
  background,
  runtimeOptions,
  debug,
  filters,
  ...restProps
}) => {
  const [mode, setMode] = useState(_mode);
  // Reference to the current HTML Canvas element
  // Set by React by passing <canvas ref={...} />
  // Used to instantiate the controller and viewer with the correct HTML element.
  const [isReady, setIsReady] = useState(false);
  const strictModeDoubleRender = useRef(false);

  const renderPreset = useMemo<PresetNames | Presets>(() => {
    if (typeof _renderPreset === 'string') {
      _renderPreset = [_renderPreset, {}] as Presets;
    }
    if (debug) {
      if (_renderPreset) {
        return [_renderPreset[0], { debug, ...(_renderPreset[1] || {}) }];
      }
      return ['default-preset', { debug }];
    }
    return _renderPreset || 'default-preset';
  }, [_renderPreset, debug]);

  // This is an HTML element that sits above the Canvas element that is passed to the controller.
  // Additional non-canvas drawn elements can be placed here and positioned. CSS is applied to this
  // element by this component to absolutely position it. The overlay is updated if the "bounds" change
  // on the parent element and matches the size of it.

  // This measures the height and width of the Atlas element.
  const [_ref, bounds, forceRefresh] = useMeasure({ scroll: true });
  const outerContainerRef = useRef<HTMLDivElement>();
  const ref = (component: HTMLDivElement) => {
    outerContainerRef.current = component;
    _ref(component);
  };

  const [presetName, preset, viewport, refs] = usePreset(renderPreset, {
    width: restProps.width,
    height: restProps.height,
    forceRefresh,
    unstable_webglRenderer,
  });

  // This holds the class name for the container. This is changes when the
  // editing mode changes.
  const [containerClassName, setContainerClassName] = useState('');

  useEffect(() => {
    setMode(_mode);
  }, [_mode]);

  // This changes the mutable state object with the position (top/left/width/height) of the
  // canvas element on the page. This is used in the editing tools such as BoxDraw for comparing
  // positions.
  useEffect(() => {
    if (preset && preset.em) {
      preset.em.updateBounds();
    }
  }, [preset, bounds]);

  useEffect(() => {
    preset?.runtime.setOptions(runtimeOptions || {});
  }, [runtimeOptions]);

  // This changes the mode in the state object when the prop passed in changes. This will
  // be picked up by the renderer on the next method. There is not current way to detect this change.
  // @todo create a mode change event.
  useEffect(() => {
    if (preset && preset.runtime) {
      preset.runtime.mode = mode;
    }
    if (isReady && preset) {
      preset.ready = true;
    }
  }, [preset, isReady, mode]);

  useEffect(() => {
    if (preset) {
      // Home cover handled separately.
      if (!homeCover) {
        preset.runtime.manualHomePosition = !!homePosition;
        preset.runtime.setHomePosition(homePosition);
      }
    }
  }, [preset, homeCover, homePosition]);

  // When the width and height change this will resize the viewer and then reset the view to fit the element.
  // @todo improve or make configurable.
  // @todo resize event.
  useEffect(() => {
    if (preset) {
      const rt: Runtime = preset.runtime;

      rt.resize(viewport.current.width, restProps.width, viewport.current.height, restProps.height);
      viewport.current.width = restProps.width;
      viewport.current.height = restProps.height;
      rt.updateNextFrame();
      viewport.current.didUpdate = true;
    }
  }, [preset, restProps.width, restProps.height]);

  useEffect(() => {
    if (filters && preset) {
      const rt: Runtime = preset.runtime;
      let didUpdate = false;
      rt.hookOptions.enableFilters = true;

      for (const property of filterProperties) {
        if (filters[property]) {
          if (filters[property] !== preset.runtime.hookOptions.filters[property]) {
            rt.hookOptions.filters[property] = filters[property] as number;
            didUpdate = true;
          }
        } else if (rt.hookOptions.filters[property]) {
          rt.hookOptions.filters[property] = 0;
          didUpdate = true;
        }
      }

      if (didUpdate) {
        rt.updateNextFrame();
      }
    } else {
      if (preset) {
        const rt: Runtime = preset.runtime;
        for (const property of filterProperties) {
          rt.hookOptions.filters[property] = 0;
        }
        rt.hookOptions.enableFilters = false;
        rt.updateNextFrame();
      }
    }
  }, [preset, filters]);

  // When the bounds of the container change, we need to reflect those changes in the overlay.
  // @todo move to canvas.
  useIsomorphicLayoutEffect(() => {
    if (preset) {
      if (preset.overlay) {
        preset.overlay.style.width = `${bounds.width}px`;
        preset.overlay.style.height = `${bounds.height}px`;
      }

      if (preset.container) {
        preset.container.style.width = `${bounds.width}px`;
        preset.container.style.height = `${bounds.height}px`;
      }

      if (homeCover) {
        const w = preset.runtime.world.width;
        const h = preset.runtime.world.height;
        const ratio = w / h;

        const viewportWidth = viewport.current.width;
        const viewportHeight = viewport.current.height;
        let viewportRatio = viewportWidth / viewportHeight;

        if (ratio > viewportRatio) {
          viewportRatio = viewportHeight / viewportWidth;
          // Viewport too tall.
          preset.runtime.manualHomePosition = true;
          let x = (w - h / viewportRatio) / 2;
          if (homeCover === 'start') {
            x = 0;
          }
          if (homeCover === 'end') {
            x = w - h / viewportRatio;
          }
          preset.runtime.setHomePosition({
            x,
            y: 0,
            width: h / viewportRatio,
            height: h,
          });
        } else {
          let y = (h - w / viewportRatio) / 2;
          if (homeCover === 'start') {
            y = 0;
          }
          if (homeCover === 'end') {
            y = h - w / viewportRatio;
          }
          // Viewport too wide. Need to make the home position cover the entire width.
          preset.runtime.manualHomePosition = true;
          preset.runtime.setHomePosition({
            x: 0,
            y,
            width: w,
            height: w / viewportRatio,
          });
        }
        if (homeOnResize) {
          preset.runtime.goHome({});
        }
      }
    }
  }, [preset, bounds.height, bounds.width, homeCover]);

  // When the window resizes we need to recalculate the width.
  // @todo possibly move to controller.
  useIsomorphicLayoutEffect(() => {
    const windowResizeCallback = () => {
      if (preset) {
        const rt: Runtime = preset.runtime;
        if (viewport.current.width !== restProps.width && viewport.current.height !== restProps.height) {
          rt.resize(viewport.current.width, restProps.width, viewport.current.height, restProps.height);
          viewport.current.width = restProps.width;
          viewport.current.height = restProps.height;
          rt.updateNextFrame();
          viewport.current.didUpdate = true;
        }
      }
    };

    window.addEventListener('resize', windowResizeCallback);

    return () => window.removeEventListener('resize', windowResizeCallback);
  }, [preset, restProps.height, restProps.width]);

  const navigatorOptions = {
    width: 120,
  };

  const recalculateNavigatorDimensions = () => {
    if (preset && preset.navigator) {
      const wHeight = preset.runtime.world.height;
      const wWidth = preset.runtime.world.width;

      const ratio = window.devicePixelRatio || 1;
      const canvasWidth = navigatorOptions.width;
      const canvasHeight = (navigatorOptions.width / wWidth) * wHeight;

      preset.navigator.width = canvasWidth * ratio;
      preset.navigator.height = canvasHeight * ratio;
      preset.navigator.style.width = canvasWidth + 'px';
      preset.navigator.style.height = canvasHeight + 'px';
    }
  };

  useIsomorphicLayoutEffect(() => {
    if (preset) {
      recalculateNavigatorDimensions();
      const rt = preset.runtime;
      return rt.world.addLayoutSubscriber((type) => {
        if (type === 'recalculate-world-size') {
          recalculateNavigatorDimensions();
          rt.resize(viewport.current.width, restProps.width, viewport.current.height, restProps.height);
        }
      });
    }
    return () => {
      // no-op
    };
  }, [preset, restProps.width, restProps.height]);

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
        } else {
          throw new Error('Invalid configuration - no runtime found');
        }
      }, []);

      return props.children;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preset]
  );

  useEffect(() => {
    if (preset) {
      const rt = preset.runtime;
      if (resetWorldOnChange) {
        return rt.world.addLayoutSubscriber((type) => {
          if (type === 'recalculate-world-size') {
            rt.goHome();
          }
        });
      }
    }
    return () => {
      // no-op
    };
  }, [preset, resetWorldOnChange]);

  useEffect(() => {
    if (preset) {
      const rt = preset.runtime;
      return rt.registerHook('useBeforeFrame', () => {
        if (viewport.current.didUpdate && preset.canvas) {
          const ratio = window.devicePixelRatio || 1;
          const canvasWidth = viewport.current.width;
          const canvasHeight = viewport.current.height;

          preset.canvas.width = canvasWidth * ratio;
          preset.canvas.height = canvasHeight * ratio;
          preset.canvas.style.width = canvasWidth + 'px';
          preset.canvas.style.height = canvasHeight + 'px';

          preset.canvas.getContext('2d')?.scale(ratio, ratio);

          if (preset && preset.em) {
            preset.em.updateBounds();
          }

          viewport.current.didUpdate = false;
        }
      });
    }
    return () => {
      // no-op
    };
  }, [preset, resetWorldOnChange]);

  // @todo move to controller.
  useEffect(() => {
    const keyupSpace = () => {
      if (preset) {
        setMode('sketch');
        setContainerClassName('mode-sketch');
      }
      window.removeEventListener('keyup', keyupSpace);
    };

    const keydownSpace = (e: KeyboardEvent) => {
      if (e.code === 'Space' && preset && preset.runtime.mode === 'sketch') {
        const tagName = (e.target as any)?.tagName?.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea') return;
        // Check if content-editable
        if ((e.target as any)?.isContentEditable) return;
        
        e.preventDefault();
        setMode('explore');
        setContainerClassName('mode-explore');
        window.addEventListener('keyup', keyupSpace);
      }
    };

    window.addEventListener('keydown', keydownSpace);

    return () => {
      // no-op
      window.removeEventListener('keydown', keydownSpace);
      window.removeEventListener('keyup', keyupSpace);
    };
  }, [preset]);

  strictModeDoubleRender.current = true;

  const { height: _, width: __, ...canvasProps } = restProps;
  const widthClassName = useClassname([restProps.width, restProps.height]);
  let isInteractive = true;
  // if we have a render preset and that render preset sets interactive to false, then... disable it
  if (renderPreset && Array.isArray(renderPreset) && renderPreset.length > 1 && (renderPreset[1] as any).interactive === false) {
    isInteractive = false;
  }

  // use css custom prop if set, otherwise background prop, or default
  background = background ?? "#000";
  if (outerContainerRef.current){
    const computed = getComputedStyle(outerContainerRef.current);
    background = computed.getPropertyValue('--atlas-background') || background;
  }

  return (
    <Container
      ref={ref}
      className={[
        'atlas',
        hideInlineStyle ? '' : `atlas-width-${widthClassName}`,
        containerClassName,
        className,
        `atlas-${presetName}`,
      ]
        .filter(Boolean)
        .join(' ')
        .trim()}
      style={{
        ...containerStyle,
        ...(hideInlineStyle ? {} : { width: restProps.width, height: restProps.height }),
      }}
    >
      {presetName === 'static-preset' ? (
        <Container
          className="atlas-static-container"
          ref={refs.container as any}
          tabIndex={0}
          {...containerProps}
        />
      ) : (
        <canvas
          className="atlas-canvas"
          /*@ts-ignore*/
          part="atlas-canvas"
          tabIndex={0}
          {...canvasProps}
          {...containerProps}
          ref={refs.canvas as any}
          data-background={background}
        />
      )}

      <Container className={['atlas-overlay', isInteractive ? 'atlas-overlay--interactive' : '']
        .filter(Boolean)
        .join(' ')
        .trim()} style={{ ...(overlayStyle || {}) }} ref={refs.overlay as any}>
        {unstable_noReconciler ? (
          <Canvas>
            <BoundsContext.Provider value={bounds}>
              <ModeContext.Provider value={mode}>
                <AtlasContext.Provider value={preset}>{children}</AtlasContext.Provider>
              </ModeContext.Provider>
            </BoundsContext.Provider>
          </Canvas>
        ) : (
          <AtlasWithReconciler
            bounds={bounds}
            preset={preset}
            mode={mode}
            setIsReady={setIsReady}
            onCreated={onCreated}
          >
            {children}
          </AtlasWithReconciler>
        )}
      </Container>
      {enableNavigator ? (
        <Container className="atlas-navigator">
          <canvas
            className="atlas-navigator-canvas"
            /*@ts-ignore*/
            part="atlas-navigator-canvas"
            ref={refs.navigator as any}
          />
        </Container>
      ) : null}
      {hideInlineStyle ? (
        // We still need this, even if inline styles are hidden, this classname is unique to this viewport.
        <style>{`.atlas-width-${widthClassName} { width: ${restProps.width}px; height: ${restProps.height}px; }`}</style>
      ) : (
        <style>{`
        .atlas { position: relative; display: flex; background: ${background}; z-index: var(--atlas-z-index, 10); -webkit-touch-callout: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; }
        .atlas-width-${widthClassName} { width: ${restProps.width}px; height: ${restProps.height}px; }
        .atlas-canvas { flex: 1 1 0px; }
        .atlas-canvas:focus, .atlas-static-container:focus { outline: none }
        .atlas-canvas:focus-visible, .atlas-canvas-container:focus-visible { outline: var(--atlas-focus, 2px solid darkorange) }
        .atlas-static-preset { touch-action: inherit; }
        .atlas-static-container { position: relative; overflow: hidden; flex: 1 1 0px; }
        .atlas-overlay { position: absolute; top: 0; left: 0; none; overflow: hidden; }
        /** setting the pointer events to none means that Atlas will own the touch and mousewheel events **/
        .atlas-overlay--interactive { pointer-events: none; }
        .atlas-static-image { position: absolute; user-select: none; transform-origin: 0px 0px; }
        .atlas-navigator { position: absolute; top: var(--atlas-navigator-top, 10px); right: var(--atlas-navigator-bottom, 10px); left: var(--atlas-navigator-left); bottom: var(--atlas-navigator-bottom); opacity: .8 }
        .atlas-navigator-canvas { width: 100%; }
      `}</style>
      )}
      {htmlChildren}
    </Container>
  );
};
