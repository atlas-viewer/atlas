import { DnaFactory, type Projection } from '@atlas-viewer/dna';
import type React from 'react';
import { memo, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RectReadOnly } from 'react-use-measure';
import type { Runtime, RuntimeOptions, ViewerFilters, ViewerMode } from '../../../renderer/runtime';
import {
  getNavigatorVisibleZoneIdSet,
  getNavigatorWorldRegion,
  getNavigatorWorldTransform,
  type NavigatorDebugEvent,
  type NavigatorRendererStyle,
  type NavigatorZoneWindowOptions,
  navigatorToWorldPoint,
} from '../../navigator-renderer/navigator-renderer';
import type { PdfScrollZoneControllerConfig } from '../../pdf-scroll-zone-controller/pdf-scroll-zone-controller';
import type { PopmotionControllerConfig } from '../../popmotion-controller/popmotion-controller';
import type { AtlasImageLoadErrorEvent } from '../../shared/image-load-events';
import type { ImageLoadingConfig } from '../../shared/image-loading-config';
import type { AtlasReadyEvent, AtlasReadyRenderer } from '../../shared/ready-events';
import type { AtlasWebGLFallbackEvent } from '../../webgl-renderer/types';
import type { AtlasOnCreated, AtlasWorldKey } from '../atlas-shared';
import { AtlasContext, BoundsContext } from './AtlasContext';
import { AtlasWithReconciler } from './AtlasWithReconciler';
import { Container } from './Container';
import { DevTools, type DevToolsProps } from './DevTools';
import { registerAtlasRuntime } from '../devtools/registry';
import { ModeContext } from '../hooks/use-mode';
import { useDiffProps } from '../hooks/use-diff-props';
import { usePreset } from '../hooks/use-preset';
import type { PresetNames, Presets } from '../presets';
import type { Preset } from '../presets/_types';
import { useIsomorphicLayoutEffect } from '../utility/react';

function getReadyRenderer(renderer: unknown): AtlasReadyRenderer {
  const maybeRenderer = renderer as {
    renderers?: unknown[];
    constructor?: { name?: string };
  };
  if (Array.isArray(maybeRenderer?.renderers)) {
    return 'composite';
  }
  const constructorName = maybeRenderer?.constructor?.name || '';
  if (constructorName === 'CanvasRenderer') {
    return 'canvas';
  }
  if (constructorName === 'WebGLRenderer') {
    return 'webgl';
  }
  if (constructorName === 'StaticRenderer') {
    return 'static';
  }
  return 'unknown';
}

const NAVIGATOR_HOME_TOLERANCE = 1;

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

export type AtlasSurfaceProps = {
  debug?: boolean;
  mode?: ViewerMode;
  onCreated?: AtlasOnCreated;
  resetWorldOnChange?: boolean;
  unstable_webglRenderer?: boolean;
  onWebGLFallback?: (event: AtlasWebGLFallbackEvent) => void;
  onReady?: (event: AtlasReadyEvent) => void;
  onImageError?: (event: AtlasImageLoadErrorEvent) => void;
  readyResetKey?: string | number;
  webglFallbackOnImageLoadError?: boolean;
  webglReadiness?: 'first-meaningful-paint' | 'immediate';
  imageLoading?: Partial<ImageLoadingConfig>;
  unstable_noReconciler?: boolean;
  overlayStyle?: any;
  containerProps?: any;
  controllerConfig?: PopmotionControllerConfig | PdfScrollZoneControllerConfig;
  interactionMode?: 'popmotion' | 'pdf-scroll-zone';
  renderPreset?: PresetNames | Presets;
  homeCover?: true | false | 'start' | 'end';
  homeOnResize?: boolean;
  homePosition?: Projection;
  homePaddingPx?: number | { left?: number; right?: number; top?: number; bottom?: number };
  background?: string;
  enableNavigator?: boolean;
  navigatorOptions?: {
    width?: number;
    idleFade?: boolean;
    idleMs?: number;
    fadeDurationMs?: number;
    opacityActive?: number;
    opacityIdle?: number;
    style?: Partial<NavigatorRendererStyle>;
    pdfScrollZoneZoneWindow?: NavigatorZoneWindowOptions;
  };
  children: ReactNode;
  devTools?: boolean | DevToolsProps;
  runtimeOptions?: Partial<RuntimeOptions>;
  filters?: Partial<ViewerFilters>;
  width: number;
  height: number;
  bounds: RectReadOnly;
  forceRefresh: () => void;
  stage: 'active' | 'staging';
  visible: boolean;
  surfaceId: string;
  worldKey?: AtlasWorldKey;
  onStageReady?: (event: { surfaceId: string; mountId: number; worldKey?: AtlasWorldKey }) => void;
  mountId: number;
};

export const AtlasSurface: React.FC<AtlasSurfaceProps> = memo(function AtlasSurface(props) {
  let {
    renderPreset: _renderPreset,
    onCreated,
    mode = 'explore',
    resetWorldOnChange = true,
    unstable_webglRenderer = false,
    onWebGLFallback,
    onReady,
    onImageError,
    readyResetKey,
    webglFallbackOnImageLoadError = false,
    webglReadiness,
    imageLoading,
    unstable_noReconciler = false,
    controllerConfig,
    interactionMode = 'popmotion',
    children,
    overlayStyle,
    enableNavigator = false,
    containerProps = {},
    homePosition,
    homeOnResize,
    homeCover,
    background,
    navigatorOptions,
    runtimeOptions,
    debug,
    filters,
    homePaddingPx,
    devTools,
    width,
    height,
    bounds,
    forceRefresh,
    stage,
    visible,
    surfaceId,
    worldKey,
    onStageReady,
    mountId,
  } = props;

  useDiffProps(props, `AtlasSurface:${surfaceId}`, debug);

  const isActiveStage = stage === 'active';
  const [activeWebGL, setActiveWebGL] = useState(unstable_webglRenderer);
  const fallbackLockedRef = useRef(false);
  const pendingRestoreViewportRef = useRef<Projection | null>(null);
  const currentRuntimeRef = useRef<Runtime | null>(null);
  const onCreatedRef = useRef(onCreated);
  const createdMetaRef = useRef<{ stage: 'active' | 'staging'; worldKey?: AtlasWorldKey }>({
    stage,
    worldKey,
  });
  const readyResetBaselineRef = useRef<string | number | undefined>(undefined);
  const lastReadyNotifiedCycleRef = useRef<number | undefined>(undefined);
  const lastStageReadyCycleRef = useRef<number | undefined>(undefined);
  const [isReady, setIsReady] = useState(false);
  const navigatorIdleTimer = useRef<number | undefined>(undefined);
  const [isNavigatorIdle, setIsNavigatorIdle] = useState(false);
  const [isNavigatorDragging, setIsNavigatorDragging] = useState(false);
  const [isNavigatorHiddenAtHome, setIsNavigatorHiddenAtHome] = useState(false);
  const navigatorDraggingRef = useRef(false);

  const navigatorStyleBackground = navigatorOptions?.style?.background;
  const navigatorStyleObjectFill = navigatorOptions?.style?.objectFill;
  const navigatorStyleObjectStroke = navigatorOptions?.style?.objectStroke;
  const navigatorStyleViewportFill = navigatorOptions?.style?.viewportFill;
  const navigatorStyleViewportStroke = navigatorOptions?.style?.viewportStroke;
  const navigatorStyleViewportLineWidth = navigatorOptions?.style?.viewportLineWidth;
  const navigatorZoneWindowTotal = navigatorOptions?.pdfScrollZoneZoneWindow?.total;
  const navigatorZoneWindowBefore = navigatorOptions?.pdfScrollZoneZoneWindow?.before;
  const navigatorZoneWindowAfter = navigatorOptions?.pdfScrollZoneZoneWindow?.after;

  const resolvedNavigatorStyle = useMemo(() => {
    if (
      typeof navigatorStyleBackground === 'undefined' &&
      typeof navigatorStyleObjectFill === 'undefined' &&
      typeof navigatorStyleObjectStroke === 'undefined' &&
      typeof navigatorStyleViewportFill === 'undefined' &&
      typeof navigatorStyleViewportStroke === 'undefined' &&
      typeof navigatorStyleViewportLineWidth === 'undefined'
    ) {
      return undefined;
    }

    return {
      background: navigatorStyleBackground,
      objectFill: navigatorStyleObjectFill,
      objectStroke: navigatorStyleObjectStroke,
      viewportFill: navigatorStyleViewportFill,
      viewportStroke: navigatorStyleViewportStroke,
      viewportLineWidth: navigatorStyleViewportLineWidth,
    };
  }, [
    navigatorStyleBackground,
    navigatorStyleObjectFill,
    navigatorStyleObjectStroke,
    navigatorStyleViewportFill,
    navigatorStyleViewportStroke,
    navigatorStyleViewportLineWidth,
  ]);

  const resolvedNavigatorZoneWindow = useMemo(() => {
    if (interactionMode !== 'pdf-scroll-zone') {
      return undefined;
    }
    return {
      total: navigatorZoneWindowTotal ?? 9,
      before: navigatorZoneWindowBefore,
      after: navigatorZoneWindowAfter,
    };
  }, [interactionMode, navigatorZoneWindowAfter, navigatorZoneWindowBefore, navigatorZoneWindowTotal]);

  const handleNavigatorDebugEvent = useCallback(
    (event: NavigatorDebugEvent) => {
      if (debug) {
        console.debug('[Atlas navigator]', event);
      }
    },
    [debug]
  );

  onCreatedRef.current = onCreated;
  createdMetaRef.current = {
    stage,
    worldKey,
  };

  const resolvedNavigatorOptions = useMemo(
    () => ({
      width: navigatorOptions?.width ?? 120,
      idleFade: navigatorOptions?.idleFade ?? true,
      idleMs: navigatorOptions?.idleMs ?? 800,
      fadeDurationMs: navigatorOptions?.fadeDurationMs ?? 250,
      opacityActive: navigatorOptions?.opacityActive ?? 0.94,
      opacityIdle: navigatorOptions?.opacityIdle ?? 0,
      style: resolvedNavigatorStyle,
      zoneWindow: resolvedNavigatorZoneWindow,
    }),
    [
      navigatorOptions?.fadeDurationMs,
      navigatorOptions?.idleFade,
      navigatorOptions?.idleMs,
      navigatorOptions?.opacityActive,
      navigatorOptions?.opacityIdle,
      navigatorOptions?.width,
      resolvedNavigatorStyle,
      resolvedNavigatorZoneWindow,
    ]
  );

  const renderPreset = useMemo<PresetNames | Presets>(() => {
    let presetName: PresetNames = 'default-preset';
    let presetOptions: Record<string, unknown> = {};
    let hasExplicitPresetOptions = false;

    if (Array.isArray(_renderPreset)) {
      presetName = _renderPreset[0];
      presetOptions = { ...(_renderPreset[1] || {}) };
      hasExplicitPresetOptions = true;
    } else if (typeof _renderPreset === 'string') {
      presetName = _renderPreset;
    }

    if (debug) {
      presetOptions.debug = debug;
      hasExplicitPresetOptions = true;
    }

    if (presetName === 'default-preset') {
      const injectedNavigatorRendererOptions: Record<string, unknown> = {};
      if (resolvedNavigatorOptions.style) {
        injectedNavigatorRendererOptions.style = resolvedNavigatorOptions.style;
      }
      if (resolvedNavigatorOptions.zoneWindow) {
        injectedNavigatorRendererOptions.zoneWindow = resolvedNavigatorOptions.zoneWindow;
      }
      if (debug) {
        injectedNavigatorRendererOptions.onDebugEvent = handleNavigatorDebugEvent;
      }

      if (Object.keys(injectedNavigatorRendererOptions).length > 0) {
        const existingNavigatorRendererOptions = (presetOptions.navigatorRendererOptions || {}) as Record<
          string,
          unknown
        >;
        presetOptions.navigatorRendererOptions = {
          ...existingNavigatorRendererOptions,
          ...injectedNavigatorRendererOptions,
        };
        hasExplicitPresetOptions = true;
      }
    }

    if (hasExplicitPresetOptions) {
      return [presetName, presetOptions as any] as Presets;
    }

    return _renderPreset || 'default-preset';
  }, [
    _renderPreset,
    debug,
    handleNavigatorDebugEvent,
    resolvedNavigatorOptions.style,
    resolvedNavigatorOptions.zoneWindow,
  ]);

  const [presetName, preset, viewport, refs] = usePreset(renderPreset, {
    width,
    height,
    forceRefresh,
    controllerConfig,
    interactionMode,
    unstable_webglRenderer: activeWebGL,
    onWebGLFallback: (event) => {
      if (fallbackLockedRef.current) {
        return;
      }

      fallbackLockedRef.current = true;
      if (currentRuntimeRef.current) {
        pendingRestoreViewportRef.current = currentRuntimeRef.current.getViewport();
      }
      setActiveWebGL(false);
      if (isActiveStage && onWebGLFallback) {
        onWebGLFallback(event);
      }
    },
    onImageError: isActiveStage ? onImageError : undefined,
    webglFallbackOnImageLoadError,
    webglReadiness,
    imageLoading,
    runtimeOptions,
    staging: !isActiveStage,
  });

  useEffect(() => {
    if (!preset) {
      return;
    }
    if (!isActiveStage) {
      return;
    }
    return registerAtlasRuntime(preset);
  }, [preset, isActiveStage]);

  useEffect(() => {
    setIsReady(false);
    currentRuntimeRef.current = preset ? preset.runtime : null;
    readyResetBaselineRef.current = undefined;
    lastReadyNotifiedCycleRef.current = undefined;
    lastStageReadyCycleRef.current = undefined;
  }, [preset]);

  useEffect(() => {
    if (!unstable_webglRenderer) {
      setActiveWebGL(false);
      return;
    }

    if (!fallbackLockedRef.current) {
      setActiveWebGL(true);
    }
  }, [unstable_webglRenderer]);

  useEffect(() => {
    if (!preset) {
      return;
    }
    preset.setInteractivity?.(isActiveStage);
    if (isActiveStage && preset.em) {
      preset.em.updateBounds();
    }
  }, [preset, isActiveStage, bounds]);

  const handleCreated = useCallback(
    (ctx: Preset) => {
      if (pendingRestoreViewportRef.current) {
        ctx.runtime.setViewport(pendingRestoreViewportRef.current);
        ctx.runtime.updateNextFrame();
        pendingRestoreViewportRef.current = null;
      }

      if (onCreatedRef.current) {
        return onCreatedRef.current(ctx, {
          stage: createdMetaRef.current.stage,
          worldKey: createdMetaRef.current.worldKey === undefined ? undefined : createdMetaRef.current.worldKey,
        });
      }
    },
    []
  );

  useEffect(() => {
    if (!preset || !onStageReady) {
      return;
    }

    const runtime = preset.runtime;
    const notifyStageReady = () => {
      const readyState = runtime.getReadyState();
      if (!readyState.ready) {
        return;
      }
      if (lastStageReadyCycleRef.current === readyState.cycle) {
        return;
      }
      lastStageReadyCycleRef.current = readyState.cycle;
      onStageReady({
        surfaceId,
        mountId,
        worldKey,
      });
    };

    notifyStageReady();

    return runtime.world.addLayoutSubscriber((type) => {
      if (type === 'ready') {
        notifyStageReady();
      }
    });
  }, [preset, onStageReady, surfaceId, mountId, worldKey]);

  useEffect(() => {
    if (!preset || !onReady || !isActiveStage || !visible) {
      return;
    }

    const runtime = preset.runtime;
    const notifyReady = () => {
      const readyState = runtime.getReadyState();
      if (!readyState.ready || !readyState.timestamp) {
        return;
      }
      if (lastReadyNotifiedCycleRef.current === readyState.cycle) {
        return;
      }
      lastReadyNotifiedCycleRef.current = readyState.cycle;
      onReady({
        runtimeId: runtime.id,
        cycle: readyState.cycle,
        reason: readyState.reason,
        renderer: getReadyRenderer(runtime.renderer),
        timestamp: readyState.timestamp,
      });
    };

    notifyReady();

    return runtime.world.addLayoutSubscriber((type) => {
      if (type === 'ready') {
        notifyReady();
      }
    });
  }, [preset, onReady, isActiveStage, visible]);

  useEffect(() => {
    if (!preset || !isActiveStage) {
      return;
    }
    if (typeof readyResetKey === 'undefined') {
      readyResetBaselineRef.current = undefined;
      return;
    }

    if (typeof readyResetBaselineRef.current === 'undefined') {
      readyResetBaselineRef.current = readyResetKey;
      return;
    }

    if (readyResetBaselineRef.current !== readyResetKey) {
      readyResetBaselineRef.current = readyResetKey;
      lastReadyNotifiedCycleRef.current = undefined;
      preset.runtime.resetReadyState('ready-reset-key-change');
    }
  }, [preset, readyResetKey, isActiveStage]);

  useEffect(() => {
    if (preset && preset.em) {
      preset.em.updateBounds();
    }
  }, [preset, bounds]);

  useEffect(() => {
    if (!preset) {
      return;
    }
    preset.runtime.setOptions(runtimeOptions || {});
  }, [preset, runtimeOptions]);

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
      if (!homeCover) {
        preset.runtime.manualHomePosition = interactionMode === 'pdf-scroll-zone' || !!homePosition;
        preset.runtime.setHomePosition(homePosition);
      }
    }
  }, [preset, homeCover, homePosition, interactionMode]);

  useEffect(() => {
    if (preset) {
      preset.runtime.setHomePaddingPx(homePaddingPx);
    }
  }, [preset, homePaddingPx]);

  useEffect(() => {
    if (preset) {
      const rt: Runtime = preset.runtime;
      const didDimensionChange = viewport.current.width !== width || viewport.current.height !== height;

      if (didDimensionChange) {
        rt.resize(viewport.current.width, width, viewport.current.height, height);
        viewport.current.width = width;
        viewport.current.height = height;
        viewport.current.didUpdate = true;
        rt.updateNextFrame();
      }
    }
  }, [preset, width, height, viewport]);

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
    } else if (preset) {
      const rt: Runtime = preset.runtime;
      for (const property of filterProperties) {
        rt.hookOptions.filters[property] = 0;
      }
      rt.hookOptions.enableFilters = false;
      rt.updateNextFrame();
    }
  }, [preset, filters]);

  function recalculateHomeCover() {
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
  }

  useIsomorphicLayoutEffect(() => {
    recalculateHomeCover();
  }, [preset, props.runtimeOptions?.maxOverZoom, bounds.height, bounds.width, homeCover]);

  useIsomorphicLayoutEffect(() => {
    const windowResizeCallback = () => {
      if (preset) {
        const rt: Runtime = preset.runtime;
        if (viewport.current.width !== width || viewport.current.height !== height) {
          rt.resize(viewport.current.width, width, viewport.current.height, height);
          viewport.current.width = width;
          viewport.current.height = height;
          rt.updateNextFrame();
          viewport.current.didUpdate = true;
        }
      }
    };

    window.addEventListener('resize', windowResizeCallback);

    return () => window.removeEventListener('resize', windowResizeCallback);
  }, [preset, height, width, viewport]);

  const getNavigatorRenderer = () => {
    if (!preset) {
      return undefined;
    }
    const renderer = preset.renderer as {
      renderers?: Array<{ invalidateWorldLayer?: () => void }>;
    };
    if (!Array.isArray(renderer.renderers)) {
      return undefined;
    }
    return renderer.renderers.find((item) => typeof item.invalidateWorldLayer === 'function');
  };

  const getRendererDpi = useCallback(() => {
    if (!preset) {
      return window.devicePixelRatio || 1;
    }
    const renderer = preset.renderer as {
      dpi?: number;
      renderers?: Array<{ dpi?: number }>;
    };
    const primaryRenderer = Array.isArray(renderer.renderers) ? renderer.renderers[0] : renderer;
    const dpi = primaryRenderer?.dpi;
    if (typeof dpi === 'number' && Number.isFinite(dpi) && dpi > 0) {
      return dpi;
    }
    return window.devicePixelRatio || 1;
  }, [preset]);

  const getNavigatorRegion = useCallback(
    (runtime: Runtime) =>
      getNavigatorWorldRegion(runtime.world, {
        target: runtime.getViewport(),
        zoneWindow: resolvedNavigatorOptions.zoneWindow,
      }),
    [resolvedNavigatorOptions.zoneWindow]
  );

  const shouldHideNavigatorAtHome = useCallback(
    (runtime: Runtime) => runtime.isViewportAtHome({ cover: !!homeCover, tolerance: NAVIGATOR_HOME_TOLERANCE }),
    [homeCover]
  );

  const recalculateNavigatorDimensions = () => {
    if (preset && preset.navigator) {
      const region = getNavigatorRegion(preset.runtime);
      const wHeight = region.height;
      const wWidth = region.width;
      const ratio = getRendererDpi();
      const safeWorldWidth = Math.max(1, wWidth);
      const safeWorldHeight = Math.max(1, wHeight);
      const configuredWidth = Math.max(1, resolvedNavigatorOptions.width);
      const maxNavigatorHeight = Math.max(1, height - 20);
      let canvasWidth = configuredWidth;
      let canvasHeight = (configuredWidth / safeWorldWidth) * safeWorldHeight;

      if (canvasHeight > maxNavigatorHeight) {
        const scale = maxNavigatorHeight / canvasHeight;
        canvasHeight = maxNavigatorHeight;
        canvasWidth = Math.max(1, configuredWidth * scale);
      }

      preset.navigator.width = canvasWidth * ratio;
      preset.navigator.height = canvasHeight * ratio;
      preset.navigator.style.width = canvasWidth + 'px';
      preset.navigator.style.height = canvasHeight + 'px';

      const navigatorRenderer = getNavigatorRenderer();
      if (navigatorRenderer && navigatorRenderer.invalidateWorldLayer) {
        navigatorRenderer.invalidateWorldLayer();
      }
    }
  };

  useIsomorphicLayoutEffect(() => {
    if (preset) {
      recalculateNavigatorDimensions();
      const rt = preset.runtime;
      return rt.world.addLayoutSubscriber((type) => {
        if (type === 'repaint') {
          const navigatorRenderer = getNavigatorRenderer();
          if (navigatorRenderer && navigatorRenderer.invalidateWorldLayer) {
            navigatorRenderer.invalidateWorldLayer();
          }
        }
        if (type === 'recalculate-world-size' || type === 'zone-changed') {
          recalculateNavigatorDimensions();
          recalculateHomeCover();
          if (type === 'recalculate-world-size' && (viewport.current.width !== width || viewport.current.height !== height)) {
            rt.resize(viewport.current.width, width, viewport.current.height, height);
          }
        }
      });
    }
    return () => {
      // no-op
    };
  }, [preset, width, height, resolvedNavigatorOptions.width, getNavigatorRegion, getRendererDpi]);

  useEffect(() => {
    if (!preset || !enableNavigator || !isActiveStage) {
      setIsNavigatorHiddenAtHome(false);
      return;
    }

    const runtime = preset.runtime;
    const syncNavigatorVisibility = () => {
      const hideAtHome = shouldHideNavigatorAtHome(runtime);
      setIsNavigatorHiddenAtHome((prev) => (prev === hideAtHome ? prev : hideAtHome));
    };

    syncNavigatorVisibility();
    return runtime.world.addLayoutSubscriber(() => {
      syncNavigatorVisibility();
    });
  }, [preset, enableNavigator, shouldHideNavigatorAtHome, isActiveStage]);

  const Canvas = useCallback(
    function Canvas(props: { children: React.ReactElement }): JSX.Element {
      const activate = () => {
        setIsReady(true);
      };

      useEffect(() => {
        if (!preset) {
          return;
        }

        if (interactionMode !== 'pdf-scroll-zone') {
          preset.runtime.goHome();
        }

        const result = handleCreated(preset);
        return void (result && result.then ? result.then(activate) : activate());
      }, []);

      return props.children;
    },
    [preset, handleCreated, interactionMode]
  );

  useEffect(() => {
    if (preset) {
      const rt = preset.runtime;
      if (resetWorldOnChange) {
        return rt.world.addLayoutSubscriber((type) => {
          if (type === 'recalculate-world-size' && interactionMode !== 'pdf-scroll-zone') {
            rt.goHome();
          }
        });
      }
    }
    return () => {
      // no-op
    };
  }, [preset, resetWorldOnChange, interactionMode]);

  useEffect(() => {
    if (preset) {
      const rt = preset.runtime;
      return rt.registerHook('useBeforeFrame', () => {
        if (viewport.current.didUpdate && preset.canvas) {
          const ratio = getRendererDpi();
          const canvasWidth = viewport.current.width;
          const canvasHeight = viewport.current.height;

          preset.canvas.width = canvasWidth * ratio;
          preset.canvas.height = canvasHeight * ratio;
          preset.canvas.style.width = canvasWidth + 'px';
          preset.canvas.style.height = canvasHeight + 'px';

          const context = preset.canvas.getContext('2d');
          if (context) {
            context.setTransform(1, 0, 0, 1, 0, 0);
            context.scale(ratio, ratio);
          }

          if (preset.parityCanvas) {
            preset.parityCanvas.width = canvasWidth * ratio;
            preset.parityCanvas.height = canvasHeight * ratio;
            preset.parityCanvas.style.width = canvasWidth + 'px';
            preset.parityCanvas.style.height = canvasHeight + 'px';

            const parityContext = preset.parityCanvas.getContext('2d');
            if (parityContext) {
              parityContext.setTransform(1, 0, 0, 1, 0, 0);
              parityContext.scale(ratio, ratio);
            }
          }

          if (preset.em) {
            preset.em.updateBounds();
          }

          viewport.current.didUpdate = false;
        }
      });
    }
    return () => {
      // no-op
    };
  }, [preset, resetWorldOnChange, getRendererDpi]);

  const markNavigatorActive = useCallback(() => {
    if (!enableNavigator || !resolvedNavigatorOptions.idleFade || !isActiveStage) {
      return;
    }
    setIsNavigatorIdle(false);
    if (typeof navigatorIdleTimer.current !== 'undefined') {
      window.clearTimeout(navigatorIdleTimer.current);
    }
    navigatorIdleTimer.current = window.setTimeout(() => {
      if (!navigatorDraggingRef.current) {
        setIsNavigatorIdle(true);
      }
    }, resolvedNavigatorOptions.idleMs);
  }, [enableNavigator, resolvedNavigatorOptions.idleFade, resolvedNavigatorOptions.idleMs, isActiveStage]);

  useEffect(
    () => () => {
      if (typeof navigatorIdleTimer.current !== 'undefined') {
        window.clearTimeout(navigatorIdleTimer.current);
        navigatorIdleTimer.current = undefined;
      }
    },
    []
  );

  useEffect(() => {
    if (!preset?.canvas || !enableNavigator || !resolvedNavigatorOptions.idleFade || !isActiveStage) {
      return;
    }

    const element = preset.canvas;
    const activate = () => markNavigatorActive();
    const eventNames = ['pointerdown', 'pointermove', 'pointerup', 'touchstart', 'touchmove', 'touchend', 'wheel'] as const;

    for (const eventName of eventNames) {
      element.addEventListener(eventName, activate, { passive: true });
    }
    markNavigatorActive();

    return () => {
      for (const eventName of eventNames) {
        element.removeEventListener(eventName, activate);
      }
    };
  }, [preset, enableNavigator, resolvedNavigatorOptions.idleFade, markNavigatorActive, isActiveStage]);

  useEffect(() => {
    if (!preset?.navigator || !enableNavigator || !isActiveStage) {
      return;
    }

    const navigatorCanvas = preset.navigator;
    const runtime = preset.runtime;
    const drag = {
      active: false,
      pointerId: -1,
      offsetX: 0,
      offsetY: 0,
      startClientX: 0,
      startClientY: 0,
      startWorldX: 0,
      startWorldY: 0,
    };

    const setDragging = (dragging: boolean) => {
      navigatorDraggingRef.current = dragging;
      setIsNavigatorDragging(dragging);
    };

    const getWorldPointFromEvent = (event: PointerEvent) => {
      const rect = navigatorCanvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return { x: 0, y: 0 };
      }
      const localX = event.clientX - rect.left;
      const localY = event.clientY - rect.top;
      const region = getNavigatorRegion(runtime);
      const transform = getNavigatorWorldTransform(
        region.width,
        region.height,
        rect.width,
        rect.height,
        region.x,
        region.y
      );
      return navigatorToWorldPoint(transform, localX, localY);
    };

    const moveViewport = (
      worldX: number,
      worldY: number,
      { preserveOffset = true, constrainAfterMove = false }: { preserveOffset?: boolean; constrainAfterMove?: boolean } = {}
    ) => {
      const viewportRect = runtime.getViewport();
      const nextX = preserveOffset ? worldX - drag.offsetX : worldX - viewportRect.width / 2;
      const nextY = preserveOffset ? worldY - drag.offsetY : worldY - viewportRect.height / 2;
      const proposed = DnaFactory.singleBox(viewportRect.width, viewportRect.height, nextX, nextY);
      const [, constrained] = runtime.constrainBounds(proposed, { ref: true });

      runtime.setViewport({
        x: constrained[1],
        y: constrained[2],
        width: constrained[3] - constrained[1],
        height: constrained[4] - constrained[2],
      });
      runtime.updateControllerPosition();
      runtime.updateNextFrame();

      if (constrainAfterMove) {
        runtime.world.constraintBounds(true);
      }
    };

    const getZoneAtWorldPoint = (worldX: number, worldY: number) => {
      const visibleZoneIds = getNavigatorVisibleZoneIdSet(runtime.world, {
        target: runtime.getViewport(),
        zoneWindow: resolvedNavigatorOptions.zoneWindow,
      });
      for (const zone of runtime.world.zones) {
        if (visibleZoneIds && !visibleZoneIds.has(zone.id)) {
          continue;
        }
        zone.recalculateBounds();
        if (zone.points[0] === 0) {
          continue;
        }
        if (
          worldX >= zone.points[1] &&
          worldX <= zone.points[3] &&
          worldY >= zone.points[2] &&
          worldY <= zone.points[4]
        ) {
          return zone;
        }
      }
      return undefined;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      markNavigatorActive();
      const worldPoint = getWorldPointFromEvent(event);
      const viewportRect = runtime.getViewport();
      const isInsideViewport =
        worldPoint.x >= viewportRect.x &&
        worldPoint.y >= viewportRect.y &&
        worldPoint.x <= viewportRect.x + viewportRect.width &&
        worldPoint.y <= viewportRect.y + viewportRect.height;

      drag.active = true;
      drag.pointerId = event.pointerId;
      drag.startClientX = event.clientX;
      drag.startClientY = event.clientY;
      drag.startWorldX = worldPoint.x;
      drag.startWorldY = worldPoint.y;

      if (isInsideViewport) {
        drag.offsetX = worldPoint.x - viewportRect.x;
        drag.offsetY = worldPoint.y - viewportRect.y;
      } else {
        drag.offsetX = viewportRect.width / 2;
        drag.offsetY = viewportRect.height / 2;
        moveViewport(worldPoint.x, worldPoint.y, {
          preserveOffset: true,
          constrainAfterMove: true,
        });
      }

      setDragging(true);
      navigatorCanvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopPropagation();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!drag.active || event.pointerId !== drag.pointerId) {
        return;
      }
      const worldPoint = getWorldPointFromEvent(event);
      moveViewport(worldPoint.x, worldPoint.y, {
        preserveOffset: true,
      });
      markNavigatorActive();
      event.preventDefault();
      event.stopPropagation();
    };

    const finishDrag = (event: PointerEvent) => {
      if (!drag.active || event.pointerId !== drag.pointerId) {
        return;
      }
      const dragDistance = Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY);
      let didNavigateToZone = false;
      if (dragDistance < 4) {
        const zone = getZoneAtWorldPoint(drag.startWorldX, drag.startWorldY);
        if (zone) {
          didNavigateToZone = runtime.goToZone(zone.id);
          if (didNavigateToZone) {
            runtime.updateNextFrame();
          }
        }
      }
      drag.active = false;
      drag.pointerId = -1;
      setDragging(false);
      if (!didNavigateToZone) {
        runtime.world.constraintBounds(true);
      }
      if (navigatorCanvas.hasPointerCapture(event.pointerId)) {
        navigatorCanvas.releasePointerCapture(event.pointerId);
      }
      markNavigatorActive();
      event.preventDefault();
      event.stopPropagation();
    };

    const onPointerCancel = (event: PointerEvent) => {
      if (!drag.active || event.pointerId !== drag.pointerId) {
        return;
      }
      drag.active = false;
      drag.pointerId = -1;
      setDragging(false);
      if (navigatorCanvas.hasPointerCapture(event.pointerId)) {
        navigatorCanvas.releasePointerCapture(event.pointerId);
      }
      markNavigatorActive();
    };

    navigatorCanvas.addEventListener('pointerdown', onPointerDown);
    navigatorCanvas.addEventListener('pointermove', onPointerMove);
    navigatorCanvas.addEventListener('pointerup', finishDrag);
    navigatorCanvas.addEventListener('pointercancel', onPointerCancel);

    return () => {
      setDragging(false);
      navigatorCanvas.removeEventListener('pointerdown', onPointerDown);
      navigatorCanvas.removeEventListener('pointermove', onPointerMove);
      navigatorCanvas.removeEventListener('pointerup', finishDrag);
      navigatorCanvas.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [preset, enableNavigator, markNavigatorActive, getNavigatorRegion, resolvedNavigatorOptions.zoneWindow, isActiveStage]);

  const autoDevToolsProps = typeof devTools === 'object' ? devTools : undefined;
  const navigatorContainerStyle = useMemo(
    () =>
      ({
        '--atlas-navigator-fade-duration': `${resolvedNavigatorOptions.fadeDurationMs}ms`,
        '--atlas-navigator-opacity-active': `${resolvedNavigatorOptions.opacityActive}`,
        '--atlas-navigator-opacity-idle': `${resolvedNavigatorOptions.opacityIdle}`,
      } as React.CSSProperties),
    [
      resolvedNavigatorOptions.fadeDurationMs,
      resolvedNavigatorOptions.opacityActive,
      resolvedNavigatorOptions.opacityIdle,
    ]
  );

  return (
    <Container
      className={[
        'atlas-surface',
        visible ? 'atlas-surface--visible' : 'atlas-surface--hidden',
        isActiveStage ? 'atlas-surface--active' : 'atlas-surface--staging',
        `atlas-${presetName}`,
      ]
        .filter(Boolean)
        .join(' ')
        .trim()}
      style={{ visibility: visible ? 'visible' : 'hidden' }}
      aria-hidden={!visible}
    >
      {presetName === 'static-preset' ? (
        <Container
          className="atlas-static-container"
          ref={refs.container as any}
          tabIndex={isActiveStage ? 0 : -1}
          {...(isActiveStage ? containerProps : {})}
        />
      ) : (
        <>
          <canvas
            className="atlas-canvas"
            /* @ts-expect-error custom part attribute */
            part="atlas-canvas"
            tabIndex={isActiveStage ? 0 : -1}
            {...(isActiveStage ? containerProps : {})}
            ref={refs.canvas as any}
            data-background={background}
          />
          {activeWebGL ? (
            <canvas
              className="atlas-parity-canvas"
              /* @ts-expect-error custom part attribute */
              part="atlas-parity-canvas"
              aria-hidden="true"
              data-background="transparent"
              ref={refs.parityCanvas as any}
            />
          ) : null}
        </>
      )}

      <Container
        className={['atlas-overlay', isActiveStage ? 'atlas-overlay--interactive' : '']
          .filter(Boolean)
          .join(' ')
          .trim()}
        style={{ ...(overlayStyle || {}) }}
        ref={refs.overlay as any}
      >
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
            interactionMode={interactionMode}
            setIsReady={setIsReady}
            onCreated={handleCreated as (ctx: Preset) => void | Promise<void>}
          >
            {children}
          </AtlasWithReconciler>
        )}
      </Container>

      {enableNavigator && isActiveStage ? (
        <Container
          className={[
            'atlas-navigator',
            isNavigatorHiddenAtHome ? 'atlas-navigator--hidden-at-home' : '',
            resolvedNavigatorOptions.idleFade && isNavigatorIdle ? 'atlas-navigator--idle' : '',
            isNavigatorDragging ? 'atlas-navigator--dragging' : '',
          ]
            .filter(Boolean)
            .join(' ')
            .trim()}
          style={navigatorContainerStyle}
        >
          <canvas
            className="atlas-navigator-canvas"
            /* @ts-expect-error custom part attribute */
            part="atlas-navigator-canvas"
            ref={refs.navigator as any}
          />
        </Container>
      ) : null}

      {isActiveStage && devTools ? (
        <DevTools {...autoDevToolsProps} runtimeId={autoDevToolsProps?.runtimeId || preset?.runtime.id} />
      ) : null}
    </Container>
  );
});
