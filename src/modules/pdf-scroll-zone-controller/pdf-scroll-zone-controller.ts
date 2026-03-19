/** @ts-expect-error */
import normalizeWheel from 'normalize-wheel';
import type { RuntimeController } from '../../types';
import type { ZoneInterface } from '../../world-objects/zone';
import { type PopmotionControllerConfig, popmotionController } from '../popmotion-controller/popmotion-controller';

type ScrollViewport = { x: number; y: number; width: number; height: number };
type ControllerMode = 'scroll-mode' | 'zone-active';
type WorldPoint = { x: number; y: number };

export type PdfScrollZoneControllerConfig = PopmotionControllerConfig & {
  scrollWheelFactor?: number;
  scrollLoadAheadFactor?: number;
  clickDragThresholdPx?: number;
  touchScrollMomentumStrength?: number;
  touchScrollMomentumMinStartPxPerMs?: number;
};

const defaultConfig: Required<
  Pick<
    PdfScrollZoneControllerConfig,
    | 'scrollWheelFactor'
    | 'scrollLoadAheadFactor'
    | 'clickDragThresholdPx'
    | 'touchScrollMomentumStrength'
    | 'touchScrollMomentumMinStartPxPerMs'
  >
> = {
  scrollWheelFactor: 1,
  scrollLoadAheadFactor: 1,
  clickDragThresholdPx: 6,
  touchScrollMomentumStrength: 1.4,
  touchScrollMomentumMinStartPxPerMs: 0.04,
};
const ZONE_VIEWPORT_HEIGHT_RATIO = 0.9;
const ZONE_VIEWPORT_VERTICAL_PADDING_RATIO = (1 - ZONE_VIEWPORT_HEIGHT_RATIO) / 2;
const ZONE_AUTO_EXIT_MIN_COVERAGE_RATIO = 0.8;
const SCROLL_MOMENTUM_MIN_START_PX_PER_MS = 0.08;
const SCROLL_MOMENTUM_STOP_PX_PER_MS = 0.02;
const SCROLL_MOMENTUM_SAMPLE_WINDOW_MS = 80;
const SCROLL_MOMENTUM_SAMPLE_MAX_AGE_MS = 140;
let nextPdfControllerSessionId = 1;
const activePdfControllerSessionByRuntime = new WeakMap<object, number>();

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
      const sessionId = nextPdfControllerSessionId++;
      activePdfControllerSessionByRuntime.set(runtime as object, sessionId);
      const isActiveSession = () => activePdfControllerSessionByRuntime.get(runtime as object) === sessionId;
      const {
        scrollWheelFactor,
        scrollLoadAheadFactor,
        clickDragThresholdPx,
        touchScrollMomentumStrength,
        touchScrollMomentumMinStartPxPerMs,
        enablePanMomentum = true,
        panMomentumStrength = 1,
        panTimeConstant = 325,
      } = {
        ...defaultConfig,
        ...config,
      };
      const queueFollowUpFrame = () => {
        if (followUpFrameQueued) {
          return;
        }
        followUpFrameQueued = true;
        window.requestAnimationFrame(() => {
          followUpFrameQueued = false;
          if (!isActiveSession()) {
            return;
          }
          runtime.updateNextFrame();
        });
      };

      const originalMode = runtime.mode;
      const originalManualHomePosition = runtime.manualHomePosition;
      let mode: ControllerMode = 'scroll-mode';
      let restoringViewport = false;
      let exitTransitionInFlight = false;
      let zoneEnteredViaController = false;
      let pendingProgrammaticRestoreZoneId: string | undefined;
      let savedScrollViewport: ScrollViewport | undefined;
      let initialHomeAnchorLocked = false;
      let initialHomeAnchorKey: string | undefined;
      const initialHomeSyncRetryDeadlineMs = performance.now() + 5000;
      let followUpFrameQueued = false;
      let dragStartClientY = 0;
      let dragStartViewportY = 0;
      let pointerDownClientX = 0;
      let pointerDownClientY = 0;
      let activeTouchId: number | null = null;
      let isTouchTapCandidate = false;
      let lastTouchPoint: WorldPoint | null = null;
      let suppressNextClick = false;
      let isDragging = false;
      let scrollViewY = 0;
      let scrollBaseViewportCache: ScrollViewport | undefined;
      let scrollBaseViewportDirty = true;
      let scrollBaseViewportWorldWidth = -1;
      let scrollBaseViewportWorldHeight = -1;
      let scrollBaseViewportScreenWidth = -1;
      let scrollBaseViewportScreenHeight = -1;
      let scrollBaseViewportZoneCount = -1;
      const panSamples: Array<{ y: number; t: number }> = [];
      const momentum = {
        active: false,
        vy: 0,
      };

      const popmotion = popmotionController({
        ...config,
        // Keep popmotion wheel enabled for zone-active zoom.
        // Scroll-mode wheel is guarded via wheelInExploreModeOnly + controller mode sync.
        enableWheel: true,
        enableClickToZoom: false,
        enableDoubleClickZoom: false,
        enableHoldToHome: false,
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
      const clearPanSamples = () => {
        panSamples.length = 0;
      };
      const recordPanSample = (y: number) => {
        const t = performance.now();
        const last = panSamples[panSamples.length - 1];
        if (last && last.y === y) {
          last.t = t;
          return;
        }
        panSamples.push({ y, t });
        while (panSamples.length > 1 && t - panSamples[0].t > SCROLL_MOMENTUM_SAMPLE_MAX_AGE_MS) {
          panSamples.shift();
        }
      };
      const stopScrollMomentum = () => {
        momentum.active = false;
        momentum.vy = 0;
      };
      const calculateReleaseVelocityY = () => {
        if (panSamples.length < 2) {
          return null;
        }
        const last = panSamples[panSamples.length - 1];
        let first = panSamples[0];
        for (let i = panSamples.length - 2; i >= 0; i--) {
          first = panSamples[i];
          if (last.t - first.t >= SCROLL_MOMENTUM_SAMPLE_WINDOW_MS) {
            break;
          }
        }
        const dy = last.y - first.y;
        const dt = last.t - first.t;
        if (dt <= 0 || Math.abs(dy) <= 0.5) {
          return null;
        }
        return dy / dt;
      };
      const maybeStartScrollMomentum = ({
        strengthMultiplier = 1,
        minStartPxPerMs = SCROLL_MOMENTUM_MIN_START_PX_PER_MS,
      }: {
        strengthMultiplier?: number;
        minStartPxPerMs?: number;
      } = {}) => {
        if (!enablePanMomentum || panSamples.length < 2) {
          return false;
        }
        const releaseVelocityY = calculateReleaseVelocityY();
        if (releaseVelocityY === null) {
          return false;
        }
        const strength = Math.max(0, panMomentumStrength);
        const vy = releaseVelocityY * strength * Math.max(0, strengthMultiplier);
        const speedPxPerMs = Math.abs(vy) * runtime.getScaleFactor();
        if (speedPxPerMs < minStartPxPerMs) {
          return false;
        }
        momentum.active = true;
        momentum.vy = vy;
        runtime.updateNextFrame();
        return true;
      };
      const syncRuntimeModeToController = () => {
        const expectedMode = mode === 'zone-active' ? 'explore' : 'sketch';
        if (runtime.mode !== expectedMode) {
          runtime.mode = expectedMode;
        }
      };
      const invalidateScrollBaseViewport = () => {
        scrollBaseViewportDirty = true;
      };
      const hasViewportChanged = (
        from: { x: number; y: number; width: number; height: number },
        to: { x: number; y: number; width: number; height: number }
      ) => {
        return (
          Math.abs(from.x - to.x) > 0.01 ||
          Math.abs(from.y - to.y) > 0.01 ||
          Math.abs(from.width - to.width) > 0.01 ||
          Math.abs(from.height - to.height) > 0.01
        );
      };
      const getTopVisibleZone = () => {
        let topZone: ZoneInterface | undefined;
        let topY = 0;
        for (const zone of runtime.world.zones) {
          zone.recalculateBounds();
          if (zone.points[0] === 0) {
            continue;
          }
          if (!topZone || zone.points[2] < topY) {
            topZone = zone;
            topY = zone.points[2];
          }
        }
        return topZone;
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
        const topZone = getTopVisibleZone();
        if (topZone) {
          return topZone.points[2];
        }

        let didFind = false;
        let topY = 0;
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
      const getInitialHomeAnchorKey = (): string | undefined => {
        const rendererScreen = runtime.getRendererScreenPosition();
        const screenWidth = Math.round((rendererScreen?.width || runtime.width || 0) * 100) / 100;
        const screenHeight = Math.round((rendererScreen?.height || runtime.height || 0) * 100) / 100;
        const screenSource = rendererScreen?.width && rendererScreen?.height ? 'renderer' : 'runtime';
        const topZone = getTopVisibleZone();
        if (topZone) {
          return [
            'zone',
            topZone.id,
            topZone.points[1],
            topZone.points[2],
            topZone.points[3] - topZone.points[1],
            topZone.points[4] - topZone.points[2],
            `screen:${screenWidth}x${screenHeight}:${screenSource}`,
          ].join(':');
        }

        let foundIndex = -1;
        let topY = 0;
        const objects = runtime.world.getObjects();
        for (let i = 0; i < objects.length; i++) {
          const worldObject = objects[i];
          if (!worldObject || worldObject.points[0] === 0) {
            continue;
          }
          if (foundIndex === -1 || worldObject.points[2] < topY) {
            foundIndex = i;
            topY = worldObject.points[2];
          }
        }
        if (foundIndex !== -1) {
          const object = objects[foundIndex]!;
          return [
            'object',
            object.id || foundIndex,
            object.points[1],
            object.points[2],
            object.points[3] - object.points[1],
            object.points[4] - object.points[2],
            `screen:${screenWidth}x${screenHeight}:${screenSource}`,
          ].join(':');
        }
        return undefined;
      };
      const syncInitialHomeAnchor = () => {
        if (!isActiveSession()) {
          return;
        }
        if (
          initialHomeAnchorLocked ||
          mode !== 'scroll-mode' ||
          restoringViewport ||
          isDragging ||
          exitTransitionInFlight ||
          runtime.world.hasActiveZone()
        ) {
          return;
        }
        const nextAnchorKey = getInitialHomeAnchorKey();
        if (!nextAnchorKey) {
          if (performance.now() < initialHomeSyncRetryDeadlineMs) {
            runtime.updateNextFrame();
          }
          return;
        }
        if (nextAnchorKey === initialHomeAnchorKey) {
          return;
        }
        initialHomeAnchorKey = nextAnchorKey;
        scrollViewY = getDocumentStartY();
        applyScrollViewport(scrollViewY);
        queueFollowUpFrame();
      };

      const getScrollBaseViewport = (): ScrollViewport | undefined => {
        const worldWidth = runtime.world.width;
        const worldHeight = runtime.world.height;
        const screen = runtime.getRendererScreenPosition();
        const screenWidth = Math.max(1, screen?.width || runtime.width);
        const screenHeight = Math.max(1, screen?.height || runtime.height);
        const zoneCount = runtime.world.zones.length;

        if (
          !scrollBaseViewportDirty &&
          scrollBaseViewportCache &&
          scrollBaseViewportWorldWidth === worldWidth &&
          scrollBaseViewportWorldHeight === worldHeight &&
          scrollBaseViewportScreenWidth === screenWidth &&
          scrollBaseViewportScreenHeight === screenHeight &&
          scrollBaseViewportZoneCount === zoneCount
        ) {
          return scrollBaseViewportCache;
        }

        const firstZone = getTopVisibleZone();
        let nextBaseViewport: ScrollViewport | undefined;

        if (firstZone) {
          const fitted = runtime.getHomeTarget({
            position: firstZone.points,
            paddingPx: getZoneViewportPaddingPx(),
          });
          nextBaseViewport = {
            x: fitted.x,
            y: fitted.y,
            width: fitted.width,
            height: fitted.height,
          };
        } else if (worldWidth > 0 && worldHeight > 0) {
          const visibleHeight = (worldWidth / screenWidth) * screenHeight;
          nextBaseViewport = {
            x: 0,
            y: 0,
            width: worldWidth,
            height: visibleHeight,
          };
        } else {
          nextBaseViewport = undefined;
        }

        scrollBaseViewportCache = nextBaseViewport;
        scrollBaseViewportDirty = false;
        scrollBaseViewportWorldWidth = worldWidth;
        scrollBaseViewportWorldHeight = worldHeight;
        scrollBaseViewportScreenWidth = screenWidth;
        scrollBaseViewportScreenHeight = screenHeight;
        scrollBaseViewportZoneCount = zoneCount;

        return scrollBaseViewportCache;
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
        const currentViewport = runtime.getViewport();
        if (!runtime.transitionManager.hasPending() && !hasViewportChanged(currentViewport, nextViewport)) {
          return;
        }
        if (runtime.transitionManager.hasPending()) {
          runtime.transitionManager.stopTransition();
        }
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
      const normalizeScrollModeViewport = () => {
        if (mode !== 'scroll-mode' || restoringViewport || exitTransitionInFlight || runtime.world.hasActiveZone()) {
          return;
        }
        const currentViewport = runtime.getViewport();
        const normalizedViewport = getScrollViewport(currentViewport.y);
        if (!normalizedViewport) {
          return;
        }
        scrollViewY = normalizedViewport.y;
        if (!hasViewportChanged(currentViewport, normalizedViewport)) {
          return;
        }
        if (runtime.transitionManager.hasPending()) {
          runtime.transitionManager.stopTransition();
        }
        runtime.setViewport(normalizedViewport);
        runtime.updateNextFrame();
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
        if (!isActiveSession()) {
          return;
        }
        stopScrollMomentum();
        clearPanSamples();
        initialHomeAnchorLocked = true;
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
        if (!isActiveSession()) {
          return;
        }
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
        if (!isActiveSession()) {
          return false;
        }
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
        if (!isActiveSession()) {
          return;
        }
        if (mode !== 'zone-active') {
          return;
        }
        stopScrollMomentum();
        clearPanSamples();
        setMode('scroll-mode');
        restoringViewport = true;
        runtime.deselectZone();
        restoreScrollViewport();
      };

      const beginScrollDrag = (clientX: number, clientY: number) => {
        stopScrollMomentum();
        clearPanSamples();
        initialHomeAnchorLocked = true;
        isDragging = true;
        suppressNextClick = false;
        pointerDownClientX = clientX;
        pointerDownClientY = clientY;
        dragStartClientY = clientY;
        dragStartViewportY = scrollViewY;
        recordPanSample(scrollViewY);
      };

      const updateScrollDrag = (clientX: number, clientY: number) => {
        if (!isDragging) {
          return false;
        }
        const movedPx = Math.hypot(clientX - pointerDownClientX, clientY - pointerDownClientY);
        if (movedPx > clickDragThresholdPx) {
          suppressNextClick = true;
        }
        const deltaPx = clientY - dragStartClientY;
        const deltaWorld = deltaPx / Math.max(0.0001, runtime.getScaleFactor());
        applyScrollViewport(dragStartViewportY - deltaWorld);
        recordPanSample(scrollViewY);
        return true;
      };

      const endScrollDrag = ({
        allowMomentum = true,
        momentumStrengthMultiplier = 1,
        momentumMinStartPxPerMs = SCROLL_MOMENTUM_MIN_START_PX_PER_MS,
      }: {
        allowMomentum?: boolean;
        momentumStrengthMultiplier?: number;
        momentumMinStartPxPerMs?: number;
      } = {}) => {
        const releasedDrag = isDragging;
        const tapSuppressed = suppressNextClick;
        isDragging = false;
        suppressNextClick = false;

        if (!releasedDrag) {
          clearPanSamples();
          return {
            releasedDrag: false,
            tapSuppressed,
          };
        }

        if (allowMomentum && mode === 'scroll-mode' && !exitTransitionInFlight) {
          maybeStartScrollMomentum({
            strengthMultiplier: momentumStrengthMultiplier,
            minStartPxPerMs: momentumMinStartPxPerMs,
          });
        } else {
          stopScrollMomentum();
        }
        clearPanSamples();
        return {
          releasedDrag: true,
          tapSuppressed,
        };
      };

      const cancelScrollDrag = () => {
        isDragging = false;
        suppressNextClick = false;
        clearPanSamples();
        stopScrollMomentum();
      };

      const clearTouchTapCandidate = () => {
        activeTouchId = null;
        isTouchTapCandidate = false;
        lastTouchPoint = null;
        suppressNextClick = false;
      };

      const handleTapAtPoint = (point: WorldPoint) => {
        if (!isActiveSession()) {
          return;
        }
        syncRuntimeModeToController();
        if (suppressNextClick || exitTransitionInFlight) {
          return;
        }
        if (mode === 'scroll-mode') {
          const zone = findZoneAtPoint(point.x, point.y);
          if (zone) {
            enterZone(zone.id);
          }
          return;
        }
        const activeZone = runtime.world.getActiveZone();
        if (!activeZone || !pointInZone(activeZone, point.x, point.y)) {
          exitZone();
        }
      };

      const onClick = (e: MouseEvent & { atlas: { x: number; y: number } }) => {
        if (!isActiveSession()) {
          return;
        }
        if (!e.atlas) {
          return;
        }
        handleTapAtPoint(e.atlas);
      };

      const onWheel = (e: WheelEvent) => {
        if (!isActiveSession()) {
          return;
        }
        syncRuntimeModeToController();
        if (exitTransitionInFlight) {
          e.stopPropagation();
          return;
        }
        if (mode !== 'scroll-mode') {
          return;
        }
        stopScrollMomentum();
        initialHomeAnchorLocked = true;
        e.stopPropagation();
        const normalized = normalizeWheel(e);
        const deltaPx = normalized.pixelY || (e as any).deltaY || 0;
        const deltaWorld = (deltaPx / Math.max(0.0001, runtime.getScaleFactor())) * scrollWheelFactor;
        applyScrollViewport(scrollViewY + deltaWorld);
      };

      const onMouseDown = (e: MouseEvent & { atlas: { x: number; y: number } }) => {
        if (!isActiveSession()) {
          return;
        }
        syncRuntimeModeToController();
        if (mode !== 'scroll-mode' || exitTransitionInFlight || !e.atlas) {
          return;
        }
        e.stopPropagation();
        beginScrollDrag(typeof e.clientX === 'number' ? e.clientX : 0, e.clientY);
      };

      const onMouseMove = (e: MouseEvent & { atlas: { x: number; y: number } }) => {
        if (!isActiveSession()) {
          return;
        }
        syncRuntimeModeToController();
        if (!isDragging || mode !== 'scroll-mode' || exitTransitionInFlight || !e.atlas) {
          return;
        }
        e.stopPropagation();
        updateScrollDrag(typeof e.clientX === 'number' ? e.clientX : 0, e.clientY);
      };

      const onMouseUp = () => {
        if (!isActiveSession()) {
          return;
        }
        endScrollDrag();
      };

      const onTouchStart = (
        e: TouchEvent & {
          atlasTouches?: Array<{ id: number; x: number; y: number }>;
        }
      ) => {
        if (!isActiveSession()) {
          return;
        }
        syncRuntimeModeToController();
        if (mode === 'zone-active') {
          if (!e.atlasTouches || e.atlasTouches.length !== 1 || e.touches.length !== 1) {
            clearTouchTapCandidate();
            return;
          }
          const touch = e.touches[0];
          const atlasTouch = e.atlasTouches[0];
          activeTouchId = atlasTouch.id;
          isTouchTapCandidate = true;
          suppressNextClick = false;
          pointerDownClientX = touch.clientX;
          pointerDownClientY = touch.clientY;
          lastTouchPoint = { x: atlasTouch.x, y: atlasTouch.y };
          return;
        }
        if (mode !== 'scroll-mode' || exitTransitionInFlight) {
          return;
        }
        e.preventDefault();
        e.stopPropagation?.();
        if (!e.atlasTouches || e.atlasTouches.length !== 1 || e.touches.length !== 1) {
          clearTouchTapCandidate();
          cancelScrollDrag();
          return;
        }
        const touch = e.touches[0];
        const atlasTouch = e.atlasTouches[0];
        activeTouchId = atlasTouch.id;
        isTouchTapCandidate = true;
        lastTouchPoint = { x: atlasTouch.x, y: atlasTouch.y };
        beginScrollDrag(touch.clientX, touch.clientY);
      };

      const onTouchMove = (
        e: TouchEvent & {
          atlasTouches?: Array<{ id: number; x: number; y: number }>;
        }
      ) => {
        if (!isActiveSession()) {
          return;
        }
        syncRuntimeModeToController();
        if (mode === 'zone-active') {
          if (!isTouchTapCandidate) {
            return;
          }
          if (!e.atlasTouches || e.atlasTouches.length !== 1 || e.touches.length !== 1) {
            clearTouchTapCandidate();
            return;
          }
          const atlasTouch = e.atlasTouches.find((touch) => touch.id === activeTouchId) || e.atlasTouches[0];
          const touch = Array.from(e.touches).find((entry) => entry.identifier === atlasTouch.id) || e.touches[0];
          lastTouchPoint = { x: atlasTouch.x, y: atlasTouch.y };
          if (
            Math.hypot(touch.clientX - pointerDownClientX, touch.clientY - pointerDownClientY) > clickDragThresholdPx
          ) {
            suppressNextClick = true;
          }
          return;
        }
        if (mode !== 'scroll-mode' || exitTransitionInFlight || !isDragging) {
          return;
        }
        e.preventDefault();
        e.stopPropagation?.();
        if (!e.atlasTouches || e.atlasTouches.length !== 1 || e.touches.length !== 1) {
          clearTouchTapCandidate();
          cancelScrollDrag();
          return;
        }
        const atlasTouch = e.atlasTouches.find((touch) => touch.id === activeTouchId) || e.atlasTouches[0];
        const touch = Array.from(e.touches).find((entry) => entry.identifier === atlasTouch.id) || e.touches[0];
        activeTouchId = atlasTouch.id;
        lastTouchPoint = { x: atlasTouch.x, y: atlasTouch.y };
        updateScrollDrag(touch.clientX, touch.clientY);
      };

      const onTouchEnd = (
        e: TouchEvent & {
          atlasTouches?: Array<{ id: number; x: number; y: number }>;
        }
      ) => {
        if (!isActiveSession()) {
          return;
        }
        syncRuntimeModeToController();
        if (mode === 'zone-active') {
          const tapPoint = lastTouchPoint;
          const shouldHandleTap = isTouchTapCandidate && !suppressNextClick && e.touches.length === 0;
          clearTouchTapCandidate();
          if (tapPoint && shouldHandleTap) {
            handleTapAtPoint(tapPoint);
          }
          return;
        }
        if (mode !== 'scroll-mode') {
          return;
        }
        e.preventDefault();
        e.stopPropagation?.();
        if (e.touches.length > 0) {
          clearTouchTapCandidate();
          cancelScrollDrag();
          return;
        }
        const tapPoint = lastTouchPoint;
        const result = endScrollDrag({
          momentumStrengthMultiplier: touchScrollMomentumStrength,
          momentumMinStartPxPerMs: touchScrollMomentumMinStartPxPerMs,
        });
        clearTouchTapCandidate();
        if (tapPoint && !result.tapSuppressed) {
          handleTapAtPoint(tapPoint);
        }
      };

      const onTouchCancel = (e: TouchEvent) => {
        if (!isActiveSession()) {
          return;
        }
        syncRuntimeModeToController();
        if (mode === 'zone-active') {
          clearTouchTapCandidate();
          return;
        }
        if (mode !== 'scroll-mode') {
          return;
        }
        e.preventDefault();
        e.stopPropagation?.();
        clearTouchTapCandidate();
        cancelScrollDrag();
      };

      const onWindowTouchEnd = () => {
        if (!isActiveSession()) {
          return;
        }
        if (mode === 'zone-active') {
          clearTouchTapCandidate();
          return;
        }
        endScrollDrag({
          momentumStrengthMultiplier: touchScrollMomentumStrength,
          momentumMinStartPxPerMs: touchScrollMomentumMinStartPxPerMs,
        });
        clearTouchTapCandidate();
      };

      const onKeyDown = (e: KeyboardEvent) => {
        if (!isActiveSession()) {
          return;
        }
        if (e.key === 'Escape') {
          exitZone();
        }
      };

      ensureEventActivated('onClick');
      ensureEventActivated('onWheel');
      ensureEventActivated('onMouseDown');
      ensureEventActivated('onMouseMove');
      ensureEventActivated('onMouseUp');
      ensureEventActivated('onTouchStart');
      ensureEventActivated('onTouchMove');
      ensureEventActivated('onTouchEnd');
      ensureEventActivated('onTouchCancel');

      runtime.world.addEventListener('click', onClick);
      runtime.world.addEventListener('wheel', onWheel);
      runtime.world.addEventListener('mousedown', onMouseDown);
      runtime.world.addEventListener('mousemove', onMouseMove);
      runtime.world.addEventListener('mouseup', onMouseUp);
      runtime.world.addEventListener('touchstart', onTouchStart);
      runtime.world.addEventListener('touchmove', onTouchMove);
      runtime.world.addEventListener('touchend', onTouchEnd);
      runtime.world.addEventListener('touchcancel', onTouchCancel);

      window.addEventListener('mouseup', onMouseUp);
      window.addEventListener('touchend', onWindowTouchEnd);
      window.addEventListener('touchcancel', onTouchCancel);
      window.addEventListener('keydown', onKeyDown);

      runtime.manualHomePosition = true;
      setMode('scroll-mode');
      scrollViewY = getDocumentStartY();
      syncInitialHomeAnchor();

      const stopPopmotion = popmotion.start(runtime);
      const removeMomentumHook = runtime.registerHook('useFrame', (delta: number) => {
        if (!momentum.active) {
          return;
        }
        if (
          !isActiveSession() ||
          mode !== 'scroll-mode' ||
          restoringViewport ||
          exitTransitionInFlight ||
          isDragging ||
          runtime.world.hasActiveZone()
        ) {
          stopScrollMomentum();
          return;
        }

        const decay = Math.exp(-delta / Math.max(1, panTimeConstant));
        momentum.vy *= decay;

        const speedPxPerMs = Math.abs(momentum.vy) * runtime.getScaleFactor();
        if (speedPxPerMs <= SCROLL_MOMENTUM_STOP_PX_PER_MS) {
          stopScrollMomentum();
          return;
        }

        const previousY = scrollViewY;
        applyScrollViewport(scrollViewY + momentum.vy * delta);
        if (Math.abs(scrollViewY - previousY) <= 0.01) {
          stopScrollMomentum();
          return;
        }
        runtime.updateNextFrame();
      });
      const removeAutoExitHook = runtime.registerHook('useAfterFrame', () => {
        if (!isActiveSession()) {
          return;
        }
        syncRuntimeModeToController();
        normalizeScrollModeViewport();
        syncInitialHomeAnchor();
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
        if (!isActiveSession()) {
          return;
        }
        if (type === 'recalculate-world-size' || type === 'zone-changed') {
          invalidateScrollBaseViewport();
        }
        if (type === 'goto-region') {
          restoringViewport = false;
        }
        if (type === 'recalculate-world-size' && mode === 'scroll-mode' && !restoringViewport) {
          const nextY = savedScrollViewport ? savedScrollViewport.y : scrollViewY;
          if (runtime.world.zones.length && nextY === 0) {
            scrollViewY = getDocumentStartY();
          }
          applyScrollViewport(scrollViewY);
          queueFollowUpFrame();
        }
        if (type === 'zone-changed') {
          if (runtime.world.hasActiveZone()) {
            stopScrollMomentum();
            clearPanSamples();
            initialHomeAnchorLocked = true;
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
        stopScrollMomentum();
        clearPanSamples();
        stopPopmotion();
        removeMomentumHook();
        removeAutoExitHook();
        removeLayout();
        runtime.world.removeEventListener('click', onClick);
        runtime.world.removeEventListener('wheel', onWheel);
        runtime.world.removeEventListener('mousedown', onMouseDown);
        runtime.world.removeEventListener('mousemove', onMouseMove);
        runtime.world.removeEventListener('mouseup', onMouseUp);
        runtime.world.removeEventListener('touchstart', onTouchStart);
        runtime.world.removeEventListener('touchmove', onTouchMove);
        runtime.world.removeEventListener('touchend', onTouchEnd);
        runtime.world.removeEventListener('touchcancel', onTouchCancel);
        window.removeEventListener('mouseup', onMouseUp);
        window.removeEventListener('touchend', onWindowTouchEnd);
        window.removeEventListener('touchcancel', onTouchCancel);
        window.removeEventListener('keydown', onKeyDown);
        if (isActiveSession()) {
          activePdfControllerSessionByRuntime.delete(runtime as object);
          runtime.manualHomePosition = originalManualHomePosition;
          runtime.mode = originalMode;
        }
      };
    },

    updatePosition() {
      // no-op
    },
  };
};
