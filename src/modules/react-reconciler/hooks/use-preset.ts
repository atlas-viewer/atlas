import { PresetNames, Presets, presets } from '../presets';
import { Preset, PresetArgs } from '../presets/_types';
import { defaultPreset } from '../presets/default-preset';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';

const defaultArgs = {};

export function usePreset(
  renderPreset: PresetNames | Presets | undefined,
  options: { width: number; height: number; forceRefresh?: any; unstable_webglRenderer?: boolean; background?: string }
) {
  const overlayRef = useRef<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>();
  const navigatorRef = useRef<HTMLCanvasElement>();
  const containerRef = useRef<HTMLElement>();
  const viewport = useRef<{ width: number; height: number; didUpdate?: boolean }>({
    width: options.width,
    height: options.height,
    didUpdate: true,
  });

  const [presetName = 'default-preset', presetArgs = defaultArgs] = Array.isArray(renderPreset)
    ? renderPreset || []
    : [renderPreset];

  const [preset, setPreset] = useState<Preset | null>(null);

  useLayoutEffect(() => {
    const canvasElement = canvasRef.current;
    const containerElement = containerRef.current;
    const overlayElement = overlayRef.current;
    const navigatorElement = navigatorRef.current;
    const presetFn = ((presets as any)[presetName as any] as (config: PresetArgs) => Preset) || defaultPreset;

    const createdPreset = presetFn({
      containerElement,
      canvasElement,
      overlayElement,
      navigatorElement,
      viewport: viewport.current,
      dpi: window.devicePixelRatio || 1,
      forceRefresh: options.forceRefresh,
      unstable_webglRenderer: options.unstable_webglRenderer,
      ...(presetArgs || {}),
    });

    setPreset(createdPreset);

    return () => {
      if (createdPreset) {
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
  }, [presetName, presetArgs]);

  const refs = useMemo(
    () => ({
      canvas: canvasRef,
      overlay: overlayRef,
      container: containerRef,
      navigator: navigatorRef,
    }),
    []
  );

  return [presetName, preset, viewport, refs] as const;
}
