/** @ts-expect-error */
import normalizeWheel from 'normalize-wheel';
import type { RuntimeController } from '../../types';
import type { ZoneInterface } from '../../world-objects/zone';
import { type PopmotionControllerConfig, popmotionController } from '../popmotion-controller/popmotion-controller';

type ScrollViewport = { x: number; y: number; width: number; height: number };
type ControllerMode = 'scroll-mode' | 'zone-active';

export type PdfScrollZoneControllerConfig = PopmotionControllerConfig & {
  scrollWheelFactor?: number;
  scrollLoadAheadFactor?: number;
};

const defaultConfig: Required<Pick<PdfScrollZoneControllerConfig, 'scrollWheelFactor' | 'scrollLoadAheadFactor'>> = {
  scrollWheelFactor: 1,
  scrollLoadAheadFactor: 1,
};
const ZONE_VIEWPORT_HEIGHT_RATIO = 0.9;
const ZONE_VIEWPORT_VERTICAL_PADDING_RATIO = (1 - ZONE_VIEWPORT_HEIGHT_RATIO) / 2;
const ZONE_AUTO_EXIT_MIN_COVERAGE_RATIO = 0.8;

function toScrollViewport(viewport: { x: number; y: number; width: number; height: number }): ScrollViewport {
  return {
    x: viewport.x,
    y: viewport.y,
    width: viewport.width,
    height: viewport.height,
  };
}

function pointInZone(zone: ZoneInterface, x: number, y: number): boolean {
  return (
    zone.points[0] !== 0 && x >= zone.points[1] && x <= zone.points[3] && y >= zone.points[2] && y <= zone.points[4]
  );
}

export const pdfScrollZoneController = (config: PdfScrollZoneControllerConfig = {}): RuntimeController => {
  return {
    start(runtime) {
      const { scrollWheelFactor, scrollLoadAheadFactor } = {
        ...defaultConfig,
        ...config,
      };

      const originalMode = runtime.mode;
      const originalManualHomePosition = runtime.manualHomePosition;
      let mode: ControllerMode = 'scroll-mode';
      let restoringViewport = false;
      let exitTransitionInFlight = false;
      let zoneEnteredViaController = false;
      let pendingProgrammaticRestoreZoneId: string | undefined;
      let savedScrollViewport: ScrollViewport | undefined;
      let dragStartWorldY = 0;
      let dragStartViewportY = 0;
      let isDragging = false;
      let scrollViewY = 0;

      const popmotion = popmotionController({
        ...config,
        enableClickToZoom: false,
        wheelInExploreModeOnly: true,
      });

      const ensureEventActivated = (eventName: string) => {
        if (runtime.world.activatedEvents.indexOf(eventName) === -1) {
          runtime.world.activatedEvents.push(eventName);
        }
      };

      const setMode = (nextMode: ControllerMode) => {
        mode = nextMode;
        runtime.mode = nextMode === 'zone-active' ? 'explore' : 'sketch';
      };
      const getZoneViewportPaddingPx = () => {
        const screen = runtime.getRendererScreenPosition();
        const screenHeight = Math.max(0, screen?.height || 0);
        if (screenHeight === 0) {
          return undefined;
        }
        const verticalPaddingPx = Math.round(screenHeight * ZONE_VIEWPORT_VERTICAL_PADDING_RATIO);
        return {
          top: verticalPaddingPx,
          bottom: verticalPaddingPx,
        };
      };

      const getDocumentStartY = () => {
        let didFind = false;
        let topY = 0;

        for (const zone of runtime.world.zones) {
          zone.recalculateBounds();
          if (zone.points[0] === 0) {
            continue;
          }
          if (!didFind || zone.points[2] < topY) {
            topY = zone.points[2];
            didFind = true;
          }
        }

        if (didFind) {
          return topY;
        }

        for (const worldObject of runtime.world.getObjects()) {
          if (!worldObject || worldObject.points[0] === 0) {
            continue;
          }
          if (!didFind || worldObject.points[2] < topY) {
            topY = worldObject.points[2];
            didFind = true;
          }
        }

        return didFind ? topY : 0;
      };

      const getScrollBaseViewport = (): ScrollViewport | undefined => {
        const firstZone = runtime.world.zones
          .filter((zone) => {
            zone.recalculateBounds();
            return zone.points[0] !== 0;
          })
          .sort((a, b) => a.points[2] - b.points[2])[0];

        if (firstZone) {
          const fitted = runtime.getHomeTarget({
            position: firstZone.points,
            paddingPx: getZoneViewportPaddingPx(),
          });
          return {
            x: fitted.x,
            y: fitted.y,
            width: fitted.width,
            height: fitted.height,
          };
        }

        const worldWidth = runtime.world.width;
        const worldHeight = runtime.world.height;
        if (worldWidth <= 0 || worldHeight <= 0) {
          return undefined;
        }
        const screen = runtime.getRendererScreenPosition();
        const screenWidth = Math.max(1, screen?.width || runtime.width);
        const screenHeight = Math.max(1, screen?.height || runtime.height);
        const visibleHeight = (worldWidth / screenWidth) * screenHeight;
        const minY = Math.min(0, worldHeight - visibleHeight);
        const maxY = Math.max(0, worldHeight - visibleHeight);

        return {
          x: 0,
          y: 0,
          width: worldWidth,
          height: visibleHeight,
        };
      };

      const getScrollViewport = (preferredY: number): ScrollViewport | undefined => {
        const baseViewport = getScrollBaseViewport();
        if (!baseViewport) {
          return undefined;
        }

        const worldHeight = runtime.world.height;
        const loadAhead = Math.max(1, scrollLoadAheadFactor);
        const width = baseViewport.width * loadAhead;
        const visibleHeight = baseViewport.height;
        const height = baseViewport.height * loadAhead;
        const minY = Math.min(0, worldHeight - visibleHeight);
        const maxY = Math.max(0, worldHeight - visibleHeight);

        return {
          x: baseViewport.x - (width - baseViewport.width) / 2,
          y: Math.min(maxY, Math.max(minY, preferredY)),
          width,
          height,
        };
      };
      const getScrollViewportForZone = (zone: ZoneInterface): ScrollViewport | undefined => {
        zone.recalculateBounds();
        if (zone.points[0] === 0) {
          return undefined;
        }
        return getScrollViewport(zone.points[2]);
      };

      const applyScrollViewport = (preferredY: number) => {
        const nextViewport = getScrollViewport(preferredY);
        if (!nextViewport) {
          return;
        }
        scrollViewY = nextViewport.y;
        runtime.transitionManager.stopTransition();
        runtime.setViewport(nextViewport);
        runtime.updateNextFrame();
      };
      const animateToScrollViewport = (preferredY: number) => {
        const nextViewport = getScrollViewport(preferredY);
        if (!nextViewport) {
          return false;
        }
        scrollViewY = nextViewport.y;
        runtime.transitionManager.goToRegion(nextViewport);
        runtime.updateNextFrame();
        return true;
      };

      const findZoneAtPoint = (x: number, y: number) => {
        for (const zone of runtime.world.zones) {
          zone.recalculateBounds();
          if (pointInZone(zone, x, y)) {
            return zone;
          }
        }
        return undefined;
      };

      const enterZone = (zoneId: string) => {
        if (!savedScrollViewport) {
          savedScrollViewport = toScrollViewport({
            ...runtime.getViewport(),
            y: scrollViewY,
          });
        }
        zoneEnteredViaController = true;
        const didNavigate = runtime.goToZone(zoneId);
        if (didNavigate) {
          setMode('zone-active');
        } else {
          zoneEnteredViaController = false;
        }
      };
      const restoreScrollViewport = () => {
        const targetY = savedScrollViewport ? savedScrollViewport.y : scrollViewY;
        const didAnimate = animateToScrollViewport(targetY);
        savedScrollViewport = undefined;
        exitTransitionInFlight = didAnimate;
        if (!didAnimate) {
          exitTransitionInFlight = false;
          restoringViewport = false;
          applyScrollViewport(scrollViewY);
        }
        runtime.updateNextFrame();
      };
      const shouldAutoExitActiveZone = () => {
        if (mode !== 'zone-active') {
          return false;
        }
        const activeZone = runtime.world.getActiveZone();
        if (!activeZone) {
          return false;
        }
        activeZone.recalculateBounds();
        if (activeZone.points[0] === 0) {
          return false;
        }
        const viewport = runtime.getViewport();
        if (viewport.width <= 0 || viewport.height <= 0) {
          return false;
        }
        const zoneWidth = activeZone.points[3] - activeZone.points[1];
        const zoneHeight = activeZone.points[4] - activeZone.points[2];
        const widthCoverage = zoneWidth / viewport.width;
        const heightCoverage = zoneHeight / viewport.height;
        return widthCoverage < ZONE_AUTO_EXIT_MIN_COVERAGE_RATIO && heightCoverage < ZONE_AUTO_EXIT_MIN_COVERAGE_RATIO;
      };

      const exitZone = () => {
        if (mode !== 'zone-active') {
          return;
        }
        setMode('scroll-mode');
        restoringViewport = true;
        runtime.deselectZone();
        restoreScrollViewport();
      };

      const onClick = (e: MouseEvent & { atlas: { x: number; y: number } }) => {
        if (!e.atlas) {
          return;
        }
        if (exitTransitionInFlight) {
          return;
        }
        if (mode === 'scroll-mode') {
          const zone = findZoneAtPoint(e.atlas.x, e.atlas.y);
          if (zone) {
            enterZone(zone.id);
          }
          return;
        }
        const activeZone = runtime.world.getActiveZone();
        if (!activeZone || !pointInZone(activeZone, e.atlas.x, e.atlas.y)) {
          exitZone();
        }
      };

      const onWheel = (e: WheelEvent) => {
        if (exitTransitionInFlight) {
          e.stopPropagation();
          return;
        }
        if (mode !== 'scroll-mode') {
          return;
        }
        e.stopPropagation();
        const normalized = normalizeWheel(e);
        const deltaPx = normalized.pixelY || (e as any).deltaY || 0;
        const deltaWorld = (deltaPx / Math.max(0.0001, runtime.getScaleFactor())) * scrollWheelFactor;
        applyScrollViewport(scrollViewY + deltaWorld);
      };

      const onMouseDown = (e: MouseEvent & { atlas: { x: number; y: number } }) => {
        if (mode !== 'scroll-mode' || exitTransitionInFlight || !e.atlas) {
          return;
        }
        e.stopPropagation();
        isDragging = true;
        dragStartWorldY = e.atlas.y;
        dragStartViewportY = scrollViewY;
      };

      const onMouseMove = (e: MouseEvent & { atlas: { x: number; y: number } }) => {
        if (!isDragging || mode !== 'scroll-mode' || exitTransitionInFlight || !e.atlas) {
          return;
        }
        e.stopPropagation();
        const delta = e.atlas.y - dragStartWorldY;
        applyScrollViewport(dragStartViewportY - delta);
      };

      const onMouseUp = () => {
        isDragging = false;
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          exitZone();
        }
      };

      ensureEventActivated('onClick');
      ensureEventActivated('onWheel');
      ensureEventActivated('onMouseDown');
      ensureEventActivated('onMouseMove');
      ensureEventActivated('onMouseUp');

      runtime.world.addEventListener('click', onClick);
      runtime.world.addEventListener('wheel', onWheel);
      runtime.world.addEventListener('mousedown', onMouseDown);
      runtime.world.addEventListener('mousemove', onMouseMove);
      runtime.world.addEventListener('mouseup', onMouseUp);

      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('keydown', onKeyDown);

      runtime.manualHomePosition = true;
      setMode('scroll-mode');
      scrollViewY = getDocumentStartY();
      applyScrollViewport(scrollViewY);

      const stopPopmotion = popmotion.start(runtime);
      const removeAutoExitHook = runtime.registerHook('useAfterFrame', () => {
        if (exitTransitionInFlight && !runtime.transitionManager.hasPending()) {
          exitTransitionInFlight = false;
          restoringViewport = false;
        }
        if (pendingProgrammaticRestoreZoneId && mode === 'zone-active' && !runtime.transitionManager.hasPending()) {
          const activeZone = runtime.world.getActiveZone();
          if (activeZone && activeZone.id === pendingProgrammaticRestoreZoneId) {
            const zoneScrollViewport = getScrollViewportForZone(activeZone);
            if (zoneScrollViewport) {
              savedScrollViewport = toScrollViewport(zoneScrollViewport);
              scrollViewY = zoneScrollViewport.y;
            }
          }
          pendingProgrammaticRestoreZoneId = undefined;
        }
        if (restoringViewport) {
          return;
        }
        if (shouldAutoExitActiveZone()) {
          exitZone();
        }
      });

      const removeLayout = runtime.world.addLayoutSubscriber((type) => {
        if (type === 'goto-region') {
          restoringViewport = false;
        }
        if (type === 'recalculate-world-size' && mode === 'scroll-mode' && !restoringViewport) {
          const nextY = savedScrollViewport ? savedScrollViewport.y : scrollViewY;
          if (runtime.world.zones.length && nextY === 0) {
            scrollViewY = getDocumentStartY();
          }
          applyScrollViewport(scrollViewY);
        }
        if (type === 'zone-changed') {
          if (runtime.world.hasActiveZone()) {
            const activeZone = runtime.world.getActiveZone();
            if (!zoneEnteredViaController && activeZone) {
              pendingProgrammaticRestoreZoneId = activeZone.id;
            } else if (!savedScrollViewport) {
              savedScrollViewport = toScrollViewport({
                ...runtime.getViewport(),
                y: scrollViewY,
              });
            }
            zoneEnteredViaController = false;
            setMode('zone-active');
            return;
          }
          const wasZoneActive = mode === 'zone-active';
          pendingProgrammaticRestoreZoneId = undefined;
          setMode('scroll-mode');
          if (exitTransitionInFlight) {
            return;
          }
          if (wasZoneActive) {
            restoringViewport = true;
            restoreScrollViewport();
          } else if (!restoringViewport) {
            applyScrollViewport(scrollViewY);
          }
        }
      });

      return () => {
        stopPopmotion();
        removeAutoExitHook();
        removeLayout();
        runtime.world.removeEventListener('click', onClick);
        runtime.world.removeEventListener('wheel', onWheel);
        runtime.world.removeEventListener('mousedown', onMouseDown);
        runtime.world.removeEventListener('mousemove', onMouseMove);
        runtime.world.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('keydown', onKeyDown);
        runtime.manualHomePosition = originalManualHomePosition;
        runtime.mode = originalMode;
      };
    },

    updatePosition() {
      // no-op
    },
  };
};
