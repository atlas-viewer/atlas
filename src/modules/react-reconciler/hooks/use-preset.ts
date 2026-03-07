import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type PresetNames, type Presets, presets } from '../presets';
import type { Preset, PresetArgs } from '../presets/_types';
import { defaultPreset } from '../presets/default-preset';

const defaultArgs = {};

export function usePreset(
  renderPreset: PresetNames | Presets | undefined,
  options: {
    width: number;
    height: number;
    forceRefresh?: any;
    controllerConfig?: PresetArgs['controllerConfig'];
    interactionMode?: PresetArgs['interactionMode'];
    unstable_webglRenderer?: boolean;
    onWebGLFallback?: PresetArgs['onWebGLFallback'];
    onImageError?: PresetArgs['onImageError'];
    imageLoading?: PresetArgs['imageLoading'];
    webglFallbackOnImageLoadError?: PresetArgs['webglFallbackOnImageLoadError'];
    webglReadiness?: PresetArgs['webglReadiness'];
    runtimeOptions?: PresetArgs['runtimeOptions'];
  }
) {
  const overlayRef = useRef<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>();
  const parityCanvasRef = useRef<HTMLCanvasElement>();
  const navigatorRef = useRef<HTMLCanvasElement>();
  const containerRef = useRef<HTMLElement>();
  const viewport = useRef<
    PresetArgs['viewport'] & {
      didUpdate?: boolean;
    }
  >({
    x: 0,
    y: 0,
    width: options.width,
    height: options.height,
    scale: 1,
    didUpdate: true,
  });
  const liveCallbacksRef = useRef<{
    onWebGLFallback?: PresetArgs['onWebGLFallback'];
    onImageError?: PresetArgs['onImageError'];
  }>({
    onWebGLFallback: options.onWebGLFallback,
    onImageError: options.onImageError,
  });

  const [presetName = 'default-preset', presetArgs = defaultArgs] = Array.isArray(renderPreset)
    ? renderPreset || []
    : [renderPreset];

  const [preset, setPreset] = useState<Preset | null>(null);

  useLayoutEffect(() => {
    liveCallbacksRef.current.onWebGLFallback = options.onWebGLFallback;
    liveCallbacksRef.current.onImageError = options.onImageError;
  }, [options.onImageError, options.onWebGLFallback]);

  useLayoutEffect(() => {
    const canvasElement = canvasRef.current;
    const containerElement = containerRef.current;
    const overlayElement = overlayRef.current;
    const navigatorElement = navigatorRef.current;
    const presetFn = ((presets as any)[presetName as any] as (config: PresetArgs) => Preset) || defaultPreset;

    const createdPreset = presetFn({
      containerElement,
      canvasElement,
      parityCanvasElement: parityCanvasRef.current,
      overlayElement,
      navigatorElement,
      viewport: viewport.current,
      dpi: window.devicePixelRatio || 1,
      forceRefresh: options.forceRefresh,
      controllerConfig: options.controllerConfig,
      interactionMode: options.interactionMode,
      unstable_webglRenderer: options.unstable_webglRenderer,
      onWebGLFallback: (event) => {
        if (liveCallbacksRef.current.onWebGLFallback) {
          liveCallbacksRef.current.onWebGLFallback(event);
        }
      },
      onImageError: (event) => {
        if (liveCallbacksRef.current.onImageError) {
          liveCallbacksRef.current.onImageError(event);
        }
      },
      imageLoading: options.imageLoading,
      webglFallbackOnImageLoadError: options.webglFallbackOnImageLoadError,
      webglReadiness: options.webglReadiness,
      runtimeOptions: options.runtimeOptions,
      ...(presetArgs || {}),
    });

    setPreset(createdPreset);

    return () => {
      if (createdPreset) {
        const currentViewport = createdPreset.runtime.getViewport();
        viewport.current = {
          ...viewport.current,
          ...currentViewport,
          didUpdate: true,
        };
        createdPreset.unmount();

        if (canvasElement) {
          canvasElement.height = 0;
          canvasElement.width = 0;
        }
        if (overlayElement) {
          overlayElement.innerHTML = '';
        }
        if (navigatorElement) {
          navigatorElement.height = 0;
          navigatorElement.width = 0;
        }
      }
    };
  }, [
    presetName,
    presetArgs,
    options.unstable_webglRenderer,
    options.controllerConfig,
    options.interactionMode,
    options.imageLoading,
    options.webglFallbackOnImageLoadError,
    options.webglReadiness,
  ]);

  const refs = useMemo(
    () => ({
      canvas: canvasRef,
      parityCanvas: parityCanvasRef,
      overlay: overlayRef,
      container: containerRef,
      navigator: navigatorRef,
    }),
    []
  );

  return [presetName, preset, viewport, refs] as const;
}
