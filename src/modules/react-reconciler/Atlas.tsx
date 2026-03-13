import { type Projection } from '@atlas-viewer/dna';
import type React from 'react';
import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import useMeasure from 'react-use-measure';
import type { RuntimeOptions, ViewerFilters, ViewerMode } from '../../renderer/runtime';
import type { PdfScrollZoneControllerConfig } from '../pdf-scroll-zone-controller/pdf-scroll-zone-controller';
import type { PopmotionControllerConfig } from '../popmotion-controller/popmotion-controller';
import type { AtlasImageLoadErrorEvent } from '../shared/image-load-events';
import type { ImageLoadingConfig } from '../shared/image-loading-config';
import type { AtlasReadyEvent } from '../shared/ready-events';
import type { AtlasWebGLFallbackEvent } from '../webgl-renderer/types';
import type { AtlasOnCreated, AtlasWorldKey } from './atlas-shared';
import { Container } from './components/Container';
import type { DevToolsProps } from './components/DevTools';
import type { NavigatorRendererStyle, NavigatorZoneWindowOptions } from '../navigator-renderer/navigator-renderer';
import { AtlasSurface } from './components/AtlasSurface';
import { useClassname } from './hooks/use-classname';
import { useDiffProps } from './hooks/use-diff-props';
import { useIsomorphicLayoutEffect } from './utility/react';
import type { PresetNames, Presets } from './presets';

export type { AtlasCreatedMeta, AtlasOnCreated, AtlasWorldKey } from './atlas-shared';

type SurfaceSlot = 'a' | 'b';

type WorldSnapshot = {
  slot: SurfaceSlot;
  worldKey?: AtlasWorldKey;
  children: ReactNode;
  mountId: number;
};

type TransactionState = {
  active: WorldSnapshot;
  pending: WorldSnapshot | null;
  readyPending: { slot: SurfaceSlot; mountId: number } | null;
  nextMountId: number;
};

function otherSlot(slot: SurfaceSlot): SurfaceSlot {
  return slot === 'a' ? 'b' : 'a';
}

export type AtlasProps = {
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
  containerStyle?: any;
  containerProps?: any;
  controllerConfig?: PopmotionControllerConfig | PdfScrollZoneControllerConfig;
  interactionMode?: 'popmotion' | 'pdf-scroll-zone';
  renderPreset?: PresetNames | Presets;
  hideInlineStyle?: boolean;
  homeCover?: true | false | 'start' | 'end';
  homeOnResize?: boolean;
  homePosition?: Projection;
  homePaddingPx?: number | { left?: number; right?: number; top?: number; bottom?: number };
  className?: string;
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
  htmlChildren?: ReactNode;
  children: ReactNode;
  devTools?: boolean | DevToolsProps;
  runtimeOptions?: Partial<RuntimeOptions>;
  filters?: Partial<ViewerFilters>;
  worldKey?: string | number;
};

export const Atlas: React.FC<
  AtlasProps & {
    width: number;
    height: number;
  }
> = memo(function Atlas(props) {
  let {
    htmlChildren,
    renderPreset,
    onCreated,
    mode: initialMode = 'explore',
    hideInlineStyle = false,
    interactionMode = 'popmotion',
    children,
    containerStyle,
    className,
    background,
    worldKey,
    devTools,
    containerProps = {},
  } = props;

  useDiffProps(props, 'Atlas.tsx', props.debug);

  const [mode, setMode] = useState(initialMode);
  const [containerClassName, setContainerClassName] = useState('');
  const [transaction, setTransaction] = useState<TransactionState>(() => ({
    active: {
      slot: 'a',
      worldKey,
      children,
      mountId: 0,
    },
    pending: null,
    readyPending: null,
    nextMountId: 1,
  }));

  const committedChildrenRef = useRef(children);
  const frozenActiveSurfacePropsRef = useRef({
    debug: props.debug,
    resetWorldOnChange: props.resetWorldOnChange,
    unstable_webglRenderer: props.unstable_webglRenderer,
    webglFallbackOnImageLoadError: props.webglFallbackOnImageLoadError,
    webglReadiness: props.webglReadiness,
    imageLoading: props.imageLoading,
    unstable_noReconciler: props.unstable_noReconciler,
    overlayStyle: props.overlayStyle,
    controllerConfig: props.controllerConfig,
    interactionMode,
    renderPreset,
    homeCover: props.homeCover,
    homeOnResize: props.homeOnResize,
    homePosition: props.homePosition,
    homePaddingPx: props.homePaddingPx,
    navigatorOptions: props.navigatorOptions,
    runtimeOptions: props.runtimeOptions,
    filters: props.filters,
  });
  const [_ref, bounds, forceRefresh] = useMeasure({ scroll: true });
  const outerContainerRef = useRef<HTMLDivElement>();

  const ref = (component: HTMLDivElement) => {
    outerContainerRef.current = component;
    _ref(component);
  };

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useIsomorphicLayoutEffect(() => {
    if (!transaction.pending) {
      committedChildrenRef.current = children;
    }
  }, [children, transaction.pending]);

  const currentSharedSurfaceProps = useMemo(
    () => ({
      debug: props.debug,
      resetWorldOnChange: props.resetWorldOnChange,
      unstable_webglRenderer: props.unstable_webglRenderer,
      webglFallbackOnImageLoadError: props.webglFallbackOnImageLoadError,
      webglReadiness: props.webglReadiness,
      imageLoading: props.imageLoading,
      unstable_noReconciler: props.unstable_noReconciler,
      overlayStyle: props.overlayStyle,
      controllerConfig: props.controllerConfig,
      interactionMode,
      renderPreset,
      homeCover: props.homeCover,
      homeOnResize: props.homeOnResize,
      homePosition: props.homePosition,
      homePaddingPx: props.homePaddingPx,
      navigatorOptions: props.navigatorOptions,
      runtimeOptions: props.runtimeOptions,
      filters: props.filters,
    }),
    [
      props.debug,
      props.resetWorldOnChange,
      props.unstable_webglRenderer,
      props.webglFallbackOnImageLoadError,
      props.webglReadiness,
      props.imageLoading,
      props.unstable_noReconciler,
      props.overlayStyle,
      props.controllerConfig,
      interactionMode,
      renderPreset,
      props.homeCover,
      props.homeOnResize,
      props.homePosition,
      props.homePaddingPx,
      props.navigatorOptions,
      props.runtimeOptions,
      props.filters,
    ]
  );

  useIsomorphicLayoutEffect(() => {
    if (!transaction.pending) {
      frozenActiveSurfacePropsRef.current = currentSharedSurfaceProps;
    }
  }, [currentSharedSurfaceProps, transaction.pending]);

  useEffect(() => {
    setTransaction((current) => {
      if (typeof worldKey === 'undefined') {
        if (!current.pending && typeof current.active.worldKey === 'undefined') {
          return current;
        }

        return {
          ...current,
          active: {
            ...current.active,
            worldKey: undefined,
            children,
          },
          pending: null,
          readyPending: null,
        };
      }

      if (current.pending) {
        if (worldKey === current.active.worldKey) {
          return {
            ...current,
            active: {
              ...current.active,
              worldKey,
              children,
            },
            pending: null,
            readyPending: null,
          };
        }

        if (worldKey === current.pending.worldKey) {
          return current;
        }

        return {
          ...current,
          pending: {
            slot: otherSlot(current.active.slot),
            worldKey,
            children,
            mountId: current.nextMountId,
          },
          readyPending: null,
          nextMountId: current.nextMountId + 1,
        };
      }

      if (worldKey === current.active.worldKey) {
        return current;
      }

      return {
        ...current,
        active: {
          ...current.active,
          children: committedChildrenRef.current,
        },
        pending: {
          slot: otherSlot(current.active.slot),
          worldKey,
          children,
          mountId: current.nextMountId,
        },
        readyPending: null,
        nextMountId: current.nextMountId + 1,
      };
    });
  }, [children, worldKey]);

  const handleStageReady = (event: { surfaceId: string; mountId: number; worldKey?: AtlasWorldKey }) => {
    const slot = event.surfaceId as SurfaceSlot;
    setTransaction((current) => {
      if (!current.pending) {
        return current;
      }
      if (current.pending.slot !== slot || current.pending.mountId !== event.mountId) {
        return current;
      }
      if (current.readyPending?.slot === slot && current.readyPending.mountId === event.mountId) {
        return current;
      }
      return {
        ...current,
        readyPending: {
          slot,
          mountId: event.mountId,
        },
      };
    });
  };

  useIsomorphicLayoutEffect(() => {
    if (!transaction.pending || !transaction.readyPending) {
      return;
    }

    setTransaction((current) => {
      if (!current.pending || !current.readyPending) {
        return current;
      }

      if (
        current.pending.slot !== current.readyPending.slot ||
        current.pending.mountId !== current.readyPending.mountId
      ) {
        return {
          ...current,
          readyPending: null,
        };
      }

      return {
        ...current,
        active: current.pending,
        pending: null,
        readyPending: null,
      };
    });
  }, [transaction.pending, transaction.readyPending]);

  useEffect(() => {
    const keyupSpace = () => {
      setMode('sketch');
      setContainerClassName('mode-sketch');
      window.removeEventListener('keyup', keyupSpace);
    };

    const keydownSpace = (e: KeyboardEvent) => {
      if (e.code === 'Space' && mode === 'sketch') {
        const tagName = (e.target as any)?.tagName?.toLowerCase();
        if (tagName === 'input' || tagName === 'textarea') return;
        if ((e.target as any)?.isContentEditable) return;

        e.preventDefault();
        setMode('explore');
        setContainerClassName('mode-explore');
        window.addEventListener('keyup', keyupSpace);
      }
    };

    window.addEventListener('keydown', keydownSpace);

    return () => {
      window.removeEventListener('keydown', keydownSpace);
      window.removeEventListener('keyup', keyupSpace);
    };
  }, [mode]);

  const widthClassName = useClassname([props.width, props.height]);
  const resolvedPresetName = useMemo(() => {
    if (Array.isArray(renderPreset)) {
      return renderPreset[0] || 'default-preset';
    }
    return renderPreset || 'default-preset';
  }, [renderPreset]);

  background = background ?? '#000';
  if (outerContainerRef.current) {
    const computed = getComputedStyle(outerContainerRef.current);
    background = computed.getPropertyValue('--atlas-background') || background;
  }

  const shouldFreezeForKeyChange =
    typeof worldKey !== 'undefined' && !transaction.pending && worldKey !== transaction.active.worldKey;
  const freezeActiveSurfaceProps = transaction.pending || shouldFreezeForKeyChange;
  const activeSurfaceProps = freezeActiveSurfaceProps ? frozenActiveSurfacePropsRef.current : currentSharedSurfaceProps;
  const activeRenderChildren = transaction.pending
    ? transaction.active.children
    : shouldFreezeForKeyChange
      ? committedChildrenRef.current
      : children;
  const pendingRenderChildren =
    transaction.pending && worldKey === transaction.pending.worldKey ? children : transaction.pending?.children;

  const slotSnapshots: Record<SurfaceSlot, WorldSnapshot | null> = {
    a: null,
    b: null,
  };
  slotSnapshots[transaction.active.slot] = transaction.active;
  if (transaction.pending) {
    slotSnapshots[transaction.pending.slot] = transaction.pending;
  }

  return (
    <Container
      ref={ref}
      className={[
        'atlas',
        `atlas-interaction-${interactionMode}`,
        hideInlineStyle ? '' : `atlas-width-${widthClassName}`,
        containerClassName,
        className,
        `atlas-${resolvedPresetName}`,
        transaction.pending ? 'atlas--transaction-active' : '',
      ]
        .filter(Boolean)
        .join(' ')
        .trim()}
      style={{
        ...containerStyle,
        ...(hideInlineStyle ? {} : { width: props.width, height: props.height }),
      }}
    >
      {(['a', 'b'] as const).map((slot) => {
        const snapshot = slotSnapshots[slot];
        if (!snapshot) {
          return null;
        }
        const isActiveSlot = transaction.active.slot === slot;
        return (
          <AtlasSurface
            key={`${slot}-${snapshot.mountId}`}
            surfaceId={slot}
            stage={isActiveSlot ? 'active' : 'staging'}
            visible={isActiveSlot}
            mountId={snapshot.mountId}
            worldKey={snapshot.worldKey}
            width={props.width}
            height={props.height}
            bounds={bounds}
            forceRefresh={forceRefresh}
            mode={mode}
            background={background}
            {...(isActiveSlot ? activeSurfaceProps : currentSharedSurfaceProps)}
            onCreated={onCreated}
            onReady={isActiveSlot ? props.onReady : undefined}
            onStageReady={!isActiveSlot ? handleStageReady : undefined}
            onWebGLFallback={isActiveSlot ? props.onWebGLFallback : undefined}
            onImageError={isActiveSlot ? props.onImageError : undefined}
            readyResetKey={isActiveSlot ? props.readyResetKey : undefined}
            enableNavigator={isActiveSlot ? props.enableNavigator : false}
            devTools={isActiveSlot ? devTools : false}
            containerProps={isActiveSlot ? containerProps : {}}
          >
            {isActiveSlot ? activeRenderChildren : pendingRenderChildren}
          </AtlasSurface>
        );
      })}

      {transaction.pending ? <div className="atlas-transaction-blocker" aria-hidden="true" /> : null}

      {hideInlineStyle ? (
        <style>{`.atlas-width-${widthClassName} { width: ${props.width}px; height: ${props.height}px; }`}</style>
      ) : (
        <style>{`
        .atlas { position: relative; display: flex; background: ${background}; z-index: var(--atlas-z-index, 10); -webkit-touch-callout: none; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; overflow: hidden; }
        .atlas-width-${widthClassName} { width: ${props.width}px; height: ${props.height}px; }
        .atlas-surface { position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; }
        .atlas-surface--visible { z-index: 1; }
        .atlas-surface--hidden { z-index: 0; pointer-events: none; }
        .atlas-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: block; }
        .atlas-interaction-pdf-scroll-zone .atlas-canvas,
        .atlas-interaction-pdf-scroll-zone .atlas-static-container { touch-action: none; }
        .atlas-parity-canvas { position: absolute; top: 0; left: 0; pointer-events: none; }
        .atlas-canvas:focus, .atlas-static-container:focus { outline: none }
        .atlas-canvas:focus-visible, .atlas-canvas-container:focus-visible { outline: var(--atlas-focus, 2px solid darkorange) }
        .atlas-static-preset { touch-action: inherit; }
        .atlas-static-container { position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; }
        .atlas-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; overflow: hidden; }
        .atlas-overlay--interactive { pointer-events: none; }
        .atlas-static-image { position: absolute; user-select: none; transform-origin: 0px 0px; }
        .atlas-navigator { position: absolute; top: var(--atlas-navigator-top, 10px); right: var(--atlas-navigator-right, 10px); left: var(--atlas-navigator-left); bottom: var(--atlas-navigator-bottom); opacity: var(--atlas-navigator-opacity-active, .94); transition: opacity var(--atlas-navigator-fade-duration, 250ms) ease; z-index: var(--atlas-navigator-z-index, 30); }
        .atlas-navigator--idle { opacity: var(--atlas-navigator-opacity-idle, .4); }
        .atlas-navigator--hidden-at-home { opacity: 0; pointer-events: none; }
        .atlas-navigator-canvas { width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; border-radius: var(--atlas-navigator-radius, 6px); border: var(--atlas-navigator-border, 1px solid rgba(0, 0, 0, 0.7)); box-shadow: var(--atlas-navigator-shadow, 0 6px 16px rgba(2, 6, 23, 0.45)); box-sizing: border-box; }
        .atlas-navigator--dragging .atlas-navigator-canvas { cursor: grabbing; }
        .atlas-transaction-blocker { position: absolute; inset: 0; z-index: 40; background: transparent; pointer-events: auto; touch-action: none; }
      `}</style>
      )}

      {htmlChildren}
    </Container>
  );
});
