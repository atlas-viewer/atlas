import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { dna } from '@atlas-viewer/dna';
import {
  AtlasAuto,
  CanvasRenderer,
  HitTestCullingDebugEvent,
  ImageService,
  ImageStretchDebugEvent,
  isImageStretched,
  Preset,
  TileLoadDebugEvent,
  TileSelectionDebugEvent,
  WorldObject,
} from '../src/index';
import { getVaultHelper } from '../src/modules/iiif/get-vault-helper';
import type { AnnotationNormalized, AnnotationPageNormalized, CanvasNormalized } from '@iiif/presentation-3-normalized';

// Resolves a canvas's painting image service id straight from the vault.
// (Not using get-tiles.ts's getTileFromCanvas here - it assumes the
// service snippet always has an `id`, but embedded IIIF Image API v2
// services - like the ones on this manifest - use `@id` instead, which
// throws. Left get-tiles.ts untouched and just handle both forms here.)
function getCanvasImageServiceId(canvas: CanvasNormalized, vault: any): string | undefined {
  for (const pageRef of canvas.items) {
    const page = vault.get<AnnotationPageNormalized>(pageRef);
    for (const annoRef of page.items) {
      const anno = vault.get<AnnotationNormalized>(annoRef);
      const body = vault.get<any>(anno.body[0]);
      const service = body?.service?.[0];
      if (service) {
        return service.id || service['@id'];
      }
    }
  }
  return undefined;
}

// Atlas has no <sequence-panel> element (that lives in iiif-canvas-panel, a
// layer above this library). This reproduces the same demo - stepping
// through a manifest's canvases, zooming and rotating - using Atlas's own
// primitives: a vault-backed manifest load plus AtlasAuto + world-object.
//
// It also respects the manifest's IIIF `behavior`: when the manifest
// declares "paged", canvases are grouped into openings (facing-page
// spreads) instead of being shown one at a time, honouring per-canvas
// "non-paged" and the manifest's viewingDirection.

export default { title: 'Sequence Panel' };

const manifestUrl = 'https://iiif.wellcomecollection.org/presentation/b18035723';
const GUTTER = 40;

// Runtime#getScaleFactor(true) is device pixels per world unit, dpi-
// adjusted; a world unit is one source-image pixel at that image's own base
// resolution (see spacial-content/tiled-image.ts -- Atlas always maps 1
// world unit = 1 pixel of the *full-resolution* source, regardless of which
// downsampled tile is actually drawn). Once this ratio exceeds 1, the
// screen has more device pixels to fill than the source has pixels to fill
// them with, for the *best resolution this IIIF service has* (confirmed via
// Capture Debug State: the deepest tile's request URL asked for the same
// width as its own source crop, i.e. no downsampling at all -- there is
// nothing higher to fetch). Zooming in past that point can only add blur,
// never detail, so "Zoom In" stops offering to once reached instead of
// zooming into a regime no tile selection could ever fix.
const MAX_NATIVE_SCALE_FACTOR = 1;

// Debug fixtures wired up below (WorldObject.debugTileSelection,
// WorldObject.debugHitTestCulling, CanvasRenderer.debugImageStretch) fire
// continuously during rendering, not on demand -- there's no "current
// state" to query, only a stream of events. MAX_DEBUG_EVENTS bounds how
// many of the most recent ones per fixture are kept around at once so the
// "Capture Debug State" button below always has something recent to
// snapshot without the buffers growing unbounded while the story sits idle.
const MAX_DEBUG_EVENTS = 200;

function pushCapped<T>(buffer: T[], event: T) {
  buffer.push(event);
  if (buffer.length > MAX_DEBUG_EVENTS) {
    buffer.shift();
  }
}

// Debug events carry Strand values (Float32Array-backed dna arrays), which
// JSON.stringify renders as index-keyed objects ("0":1,"1":2,...) rather
// than readable arrays. Recursively converts any typed array to a plain
// array before display/logging.
function serializeDebugValue(value: any): any {
  if (value && typeof value.length === 'number' && typeof value.BYTES_PER_ELEMENT === 'number') {
    return Array.from(value as ArrayLike<number>);
  }
  if (Array.isArray(value)) {
    return value.map(serializeDebugValue);
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const key of Object.keys(value)) {
      out[key] = serializeDebugValue(value[key]);
    }
    return out;
  }
  return value;
}

type Opening = string[];

function computeOpenings(canvasIds: string[], isPaged: boolean, isRightToLeft: boolean, vault: any): Opening[] {
  if (!isPaged) {
    return canvasIds.map((id) => [id]);
  }

  const isNonPaged = (id: string) => {
    const canvas = vault.get(id) as any;
    return ((canvas && canvas.behavior) || []).includes('non-paged');
  };

  const openings: Opening[] = [];
  let i = 0;

  // The first canvas (e.g. a cover) stands alone unless explicitly paired.
  if (canvasIds.length && !isNonPaged(canvasIds[0])) {
    openings.push([canvasIds[0]]);
    i = 1;
  }

  while (i < canvasIds.length) {
    if (isNonPaged(canvasIds[i])) {
      openings.push([canvasIds[i]]);
      i += 1;
    } else if (i + 1 < canvasIds.length && !isNonPaged(canvasIds[i + 1])) {
      const pair = [canvasIds[i], canvasIds[i + 1]];
      openings.push(isRightToLeft ? pair.reverse() : pair);
      i += 2;
    } else {
      openings.push([canvasIds[i]]);
      i += 1;
    }
  }

  return openings;
}

function Container(props: { children: React.ReactNode; style?: any }) {
  return <div style={{ height: 600, width: '100%', ...(props.style || {}) }}>{props.children}</div>;
}

type CurrentCanvas = { id: string; imageServiceId: string; width: number; height: number };

type TileLabel = {
  key: string;
  index: number;
  scaleFactor: string;
  x: number;
  y: number;
  width: number;
  height: number;
  stretched: boolean;
};

// Mirrors CanvasRenderer.debugTileLoad's status strings 1:1 -- see
// canvas-renderer.ts's TileLoadDebugEvent. 'requested' that never moves to
// 'loaded'/'failed' after a few seconds *is* the stuck-request bug: without
// this, a tile whose network fetch never resolves (or never even gets a
// proper failure callback -- loadImage previously had no image.onerror
// handler at all) looks identical on screen to one that's simply still
// loading normally, with no way to tell "about to finish" from "silently
// wedged forever".
const TILE_STATUS_COLORS: Record<TileLoadDebugEvent['status'], string> = {
  requested: '#f2c94c',
  loaded: '#4caf50',
  failed: '#ff4d4d',
};

// TiledImage.id (see spacial-content/tiled-image.ts) is always
// `${imageServiceId}--${scaleFactor}` -- splitting on the last `--` recovers
// which canvas a given ImageStretchDebugEvent's paintId belongs to (to know
// which world-object to draw its label inside) and which resolution level
// it's at (several can be on screen at once -- see composite-resource.ts's
// renderLayers).
function parsePaintId(paintId: string): { imageServiceId: string; scaleFactor: string } {
  const separatorIndex = paintId.lastIndexOf('--');
  if (separatorIndex === -1) {
    return { imageServiceId: paintId, scaleFactor: '?' };
  }
  return { imageServiceId: paintId.slice(0, separatorIndex), scaleFactor: paintId.slice(separatorIndex + 2) };
}

// Both the HUD list and the debug capture below need to refer to "the same
// tile" by one shared id -- index/scaleFactor alone (the HUD's "#N@Sx" text)
// can collide across canvases in a two-page spread, so this folds in the
// owning canvas too.
function tileId(imageServiceId: string, index: number, scaleFactor: string): string {
  return `${imageServiceId}::${index}@${scaleFactor}`;
}

// Inverts the post-hoc canvas rotation CanvasRenderer#applyTransform applies
// around the viewport center under rotateFromWorldCenter, so a point
// computed via Runtime#worldToViewer (which is deliberately rotation-blind,
// see world-object.ts) can be placed where the content *actually* renders.
// Forward direction confirmed against applyTransform's own
// ctx.translate/rotate/translate sequence.
function rotatePointAroundCenter(x: number, y: number, cx: number, cy: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

export const SequencePanel = () => {
  const ref = useRef<Preset>();
  const [openings, setOpenings] = useState<Opening[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentCanvases, setCurrentCanvases] = useState<CurrentCanvas[]>([]);
  const [rotation, setRotation] = useState(0);
  const [isAtMaxUsefulZoom, setIsAtMaxUsefulZoom] = useState(false);
  const [capturedDebugState, setCapturedDebugState] = useState<any>(null);
  // Which tile (see tileId) the HUD list is currently pointing at on
  // screen, and where -- the tile's *actual* on-screen rect (not a fixed-
  // size marker, so this honestly shows how much of the image it covers),
  // cleared on mouse-leave/canvas change. null when nothing's hovered.
  const [highlightedTile, setHighlightedTile] = useState<{
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    offScreen: boolean;
  } | null>(null);
  // Mirrors highlightedTile's source (imageServiceId + label), kept in a
  // ref so the interval below can recompute the highlight's screen
  // position every tick while it's active. Without this, panning/zooming
  // after hovering (including via the Zoom/Rotate buttons, which don't
  // fire mouseleave) leaves the highlight frozen at its stale, now-wrong
  // position instead of tracking the tile.
  const hoveredTileRef = useRef<{ imageServiceId: string; label: TileLabel } | null>(null);
  // The interval effect below (like nudgeRuntime's own) has an empty
  // dependency array, so it only ever closes over its *first* render's
  // functions. nudgeRuntime gets away with that because it only reads
  // ref.current internally (always fresh); refreshHighlightIfHovering
  // (defined further down) reads `rotation` state and the canvasXOffsets
  // memo directly, which would otherwise freeze at their mount-time values
  // forever. Re-assigned on every render (a plain assignment, not a
  // useEffect, so it's never a render behind); the interval calls
  // `.current` instead of the function itself so it always runs the
  // latest version.
  const latestRefreshHighlight = useRef<() => void>(() => {});
  // All currently-tracked tiles' on-screen boxes, redrawn continuously (see
  // computeAllTileBoxes) so seams/gaps between adjacent tiles are visible
  // at a glance instead of only one at a time via hover.
  const [showAllTileBoundaries, setShowAllTileBoundaries] = useState(true);
  const [allTileBoxes, setAllTileBoxes] = useState<
    Array<{ id: string; label: string; x: number; y: number; width: number; height: number; offScreen: boolean; status?: TileLoadDebugEvent['status'] }>
  >([]);
  // Same "latest ref" reasoning as latestRefreshHighlight.
  const latestComputeAllTileBoxes = useRef<() => void>(() => {});
  // Which tile was last clicked in the HUD list -- used to pull that same
  // tile's entry out of capturedDebugState below, linking the visual list
  // to the JSON dump.
  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);
  // Tile identifiers rendered directly on the canvas, keyed by which
  // canvas's imageServiceId they belong to -- see parsePaintId. Unlike the
  // capture buffers below, this isn't reset on capture: a tile's label
  // should stay put once known, since debugImageStretch only fires again
  // when that specific tile is *redrawn* (see nudgeRuntime's comment on
  // the render loop stalling), not merely because it's still on screen.
  const [tileLabelsByCanvas, setTileLabelsByCanvas] = useState<Record<string, TileLabel[]>>({});
  // Mirrors tileLabelsByCanvas but updated synchronously and cheaply (no
  // re-render) every time a tile draws -- see the flush interval below for
  // why state updates are throttled instead of happening directly here.
  const tileLabelsRef = useRef<Record<string, TileLabel[]>>({});
  const tileLabelsDirty = useRef(false);
  // Keyed by the same tileId as tileLabelsByCanvas/highlightedTile/
  // selectedTileId, so a HUD row's border color can be looked up directly
  // by the id it already computes. Same ref-then-flush pattern as
  // tileLabelsRef/tileLabelsDirty, for the same render-churn reason.
  const [tileLoadStatus, setTileLoadStatus] = useState<Record<string, TileLoadDebugEvent['status']>>({});
  const tileLoadStatusRef = useRef<Record<string, TileLoadDebugEvent['status']>>({});
  const tileLoadStatusDirty = useRef(false);
  const tileSelectionEvents = useRef<TileSelectionDebugEvent[]>([]);
  const hitTestCullingEvents = useRef<HitTestCullingDebugEvent[]>([]);
  const imageStretchEvents = useRef<ImageStretchDebugEvent[]>([]);
  // Coalesces bursts of scheduleImmediateNudge() calls (many tiles can
  // finish loading/drawing within the same tick) into a single extra
  // render() on the next tick, rather than one setTimeout per tile. See
  // scheduleImmediateNudge's own comment for why this exists at all.
  const pendingImmediateNudge = useRef(false);
  // Same "latest ref" reasoning as latestRefreshHighlight above:
  // scheduleImmediateNudge is called from the debugImageStretch/
  // debugTileLoad hooks below, which are attached once in a mount-only
  // effect and would otherwise freeze on whichever function instance
  // existed at that first render.
  const latestScheduleImmediateNudge = useRef<() => void>(() => {});

  // Wires up the three debug fixtures (see world-object.ts and
  // canvas-renderer.ts) for as long as this story is mounted, collecting
  // into capped buffers rather than reacting per-event -- they fire on
  // every relevant paint, not on demand, so "capture" below just means
  // "snapshot whatever's accumulated since the last capture".
  useEffect(() => {
    WorldObject.debugTileSelection = (event) => pushCapped(tileSelectionEvents.current, event);
    WorldObject.debugHitTestCulling = (event) => pushCapped(hitTestCullingEvents.current, event);
    CanvasRenderer.debugImageStretch = (event) => {
      pushCapped(imageStretchEvents.current, event);

      const { imageServiceId, scaleFactor } = parsePaintId(event.paintId);
      const key = `${event.index}@${scaleFactor}`;
      const label: TileLabel = {
        key,
        index: event.index,
        scaleFactor,
        x: event.x,
        y: event.y,
        width: event.targetWidth,
        height: event.targetHeight,
        stretched: event.stretched,
      };
      // Written straight to the ref, not React state: while tiles are
      // streaming in this can fire many times a second, and this story's
      // AtlasAuto instance already appears to be sensitive to render
      // churn (see nudgeRuntime's comment) -- setState-per-tile
      // reliably triggered crashes there. The interval below turns this
      // into one bounded state update instead of dozens.
      const existing = tileLabelsRef.current[imageServiceId] || [];
      tileLabelsRef.current = {
        ...tileLabelsRef.current,
        [imageServiceId]: [...existing.filter((l) => l.key !== key), label],
      };
      tileLabelsDirty.current = true;

      // A tile's offscreen buffer having just been filled (this hook firing
      // at all means schedulePaintToCanvas's drawCalls entry for it just
      // ran, inside *this* render()'s afterFrame -- see nudgeRuntime's
      // comment on render()/afterFrame() ordering) doesn't mean it's on the
      // visible canvas yet: paint() already ran earlier in *this* frame,
      // against the buffer as it was before this fill. It takes one more
      // render() call for paint() to draw the now-ready buffer. Left to the
      // regular 400ms interval, that's up to ~400ms of visible staleness on
      // top of however long the fetch itself took.
      latestScheduleImmediateNudge.current();
    };
    CanvasRenderer.debugTileLoad = (event) => {
      const { imageServiceId } = parsePaintId(event.paintId);
      const key = tileId(imageServiceId, event.index, String(event.scale));
      tileLoadStatusRef.current = { ...tileLoadStatusRef.current, [key]: event.status };
      tileLoadStatusDirty.current = true;

      // 'loaded' means the network fetch just finished -- schedulePaintToCanvas
      // has queued the buffer-fill drawCall, but it won't actually run until
      // the next afterFrame(), i.e. the next render(). Nudging here gets
      // that fill (and the debugImageStretch nudge above, for the draw
      // after it) moving as soon as possible instead of waiting on the
      // interval, closing both halves of the gap.
      if (event.status === 'loaded') {
        latestScheduleImmediateNudge.current();
      }
    };
    return () => {
      WorldObject.debugTileSelection = undefined;
      WorldObject.debugHitTestCulling = undefined;
      CanvasRenderer.debugImageStretch = undefined;
      CanvasRenderer.debugTileLoad = undefined;
    };
  }, []);

  // Runtime.render() -- the requestAnimationFrame-driven frame function,
  // which does getAllPointsAt selection, kicks off getScheduledUpdates,
  // pumps CanvasRenderer's draw-call queue, *and* iterates the resulting
  // Paint entries through renderer.paint()/prepareLayer()/finishLayer()
  // (which is what actually updates OverlayRenderer's DOM for Text/
  // <paragraph> elements -- CompositeRenderer.getPointsAt alone only
  // resolves *which* content is in view, it doesn't paint any of it) --
  // reliably stops looping after its first few frames in this dev
  // environment (confirmed by instrumenting runtime.ts directly --
  // unrelated to these hooks, and a bigger issue than this story should
  // try to fix). Rotating/zooming still visibly repaints once via other
  // paths, but there's no guarantee any of the above has run recently
  // enough to reflect the current view.
  //
  // Calling runtime.render() directly, forcing pendingUpdate first so its
  // own early-return gate doesn't just no-op, runs the real pipeline
  // instead of hand-reimplementing pieces of it here (which is what an
  // earlier version of this function did, and which turned out to miss
  // the paint-iteration step above entirely -- tile images painted, but
  // the labels never did). It's the same call the RAF loop itself makes.
  const nudgeRuntime = () => {
    // This fires from setTimeout/setInterval, by which point this specific
    // AtlasAuto/Runtime may already have been torn down and replaced by a
    // new one (the multiple-renderers instability itself). Calling into a
    // half-torn-down runtime's internals throws and takes the whole story
    // down with it. Since this is inherently a best-effort "if there's
    // fresh work to do, do it" nudge and not required for anything else to
    // function, swallowing that failure here is the correct trade-off --
    // the next tick gets another chance.
    try {
      const preset = ref.current;
      const runtime = preset?.runtime;
      if (!runtime) return;

      runtime.pendingUpdate = true;
      runtime.render(performance.now());

      // getObjectsAt (hit-testing) isn't part of the passive render loop --
      // it's normally only invoked in response to real pointer events -- so
      // it still needs to be triggered manually to populate hitTestCulling.
      // The viewport center is as representative a sample point as any for
      // "is anything hit-testable right now".
      const cx = (runtime.target[1] + runtime.target[3]) / 2;
      const cy = (runtime.target[2] + runtime.target[4]) / 2;
      runtime.world.getObjectsAt(dna([1, cx, cy, cx + 1, cy + 1]), true);

      // Keeps the Zoom In button's disabled state honest across pan/zoom/
      // resize -- see MAX_NATIVE_SCALE_FACTOR's comment.
      setIsAtMaxUsefulZoom(runtime.getScaleFactor(true) >= MAX_NATIVE_SCALE_FACTOR);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('Sequence Panel: skipped a runtime nudge (likely a stale/torn-down runtime)', err);
    }
  };

  // Runs one more nudgeRuntime() on the next tick (not synchronously --
  // see below) rather than waiting for the 400ms interval. Called from the
  // debugTileLoad/debugImageStretch hooks above to close the two-step gap
  // documented on each: a tile becoming ready is not the same render() call
  // as it becoming visible, and this story's render loop otherwise only
  // advances on a fixed timer.
  //
  // Deliberately setTimeout(...,0), not a direct call: debugImageStretch
  // fires *from inside* afterFrame(), itself called from inside render() --
  // calling nudgeRuntime() (which calls render() again) synchronously from
  // there would re-enter render() while it's still on the call stack.
  // Deferring a tick means the current render() call finishes first, and
  // (since debugImageStretch's own handler calls this too) still ends up
  // running a second nudge immediately after -- back-to-back, but not
  // nested.
  const scheduleImmediateNudge = () => {
    if (pendingImmediateNudge.current) return;
    pendingImmediateNudge.current = true;
    setTimeout(() => {
      pendingImmediateNudge.current = false;
      nudgeRuntime();
    }, 0);
  };
  latestScheduleImmediateNudge.current = scheduleImmediateNudge;

  // A tile can finish loading (network) well after the nudge that kicked it
  // off has returned -- render() only *queues* the resulting draw call at
  // that point. Nudging continuously, independent of nudgeSoon, is what
  // actually gets it (and its label) on screen close to when it's ready,
  // rather than only at the next explicit interaction. Same interval also
  // flushes the tile-label state batch (see tileLabelsDirty above).
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      nudgeRuntime();
      latestRefreshHighlight.current();
      latestComputeAllTileBoxes.current();
      if (tileLabelsDirty.current) {
        tileLabelsDirty.current = false;
        setTileLabelsByCanvas(tileLabelsRef.current);
      }
      if (tileLoadStatusDirty.current) {
        tileLoadStatusDirty.current = false;
        setTileLoadStatus(tileLoadStatusRef.current);
      }
    }, 400);
    return () => window.clearInterval(intervalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const captureDebugState = () => {
    nudgeRuntime();

    // Drop tiles that aren't currently on screen (isVisible: false -- e.g. a
    // slow-loading tile that finished after the view moved on) before
    // display: a stretched tile nobody can currently see isn't actionable,
    // and just adds noise to what's meant to be a "what's wrong right now"
    // snapshot.
    const visibleImageStretchEvents = imageStretchEvents.current.filter((event) => event.isVisible);
    // Re-derive `stretched` here via isImageStretched directly, rather than
    // trusting each event's precomputed field -- keeps this view honest
    // about exactly what it's flagging and why, straight from the same
    // aspect-ratio comparison canvas-renderer.ts uses.
    const stretchedVisibleEvents = visibleImageStretchEvents.filter((event) =>
      isImageStretched(event.naturalWidth, event.naturalHeight, event.targetWidth, event.targetHeight)
    );

    // Tags each entry with the same id the HUD list uses (see tileId) --
    // this is the actual link between a label the user clicked/hovered and
    // its entry here, rather than making them separately re-derive it from
    // paintId/index the way the HUD does.
    const imageStretchWithIds = visibleImageStretchEvents.map((event) => {
      const { imageServiceId, scaleFactor } = parsePaintId(event.paintId);
      return { tileId: tileId(imageServiceId, event.index, scaleFactor), label: `#${event.index}@${scaleFactor}x`, ...event };
    });

    const snapshot = {
      capturedAt: new Date().toISOString(),
      rotation,
      currentIndex,
      tileSelection: serializeDebugValue(tileSelectionEvents.current),
      hitTestCulling: serializeDebugValue(hitTestCullingEvents.current),
      imageStretch: serializeDebugValue(imageStretchWithIds),
      hiddenNotVisibleCount: imageStretchEvents.current.length - visibleImageStretchEvents.length,
      stretchedTileCount: stretchedVisibleEvents.length,
    };
    // Buffers reflect activity *since the last capture* going forward.
    tileSelectionEvents.current = [];
    hitTestCullingEvents.current = [];
    imageStretchEvents.current = [];
    // eslint-disable-next-line no-console
    console.log('Sequence Panel debug fixture capture', snapshot);
    setCapturedDebugState(snapshot);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { vault } = getVaultHelper();
      const manifest = await vault.loadManifest(manifestUrl);
      if (cancelled || !manifest) return;

      const canvasIds = (manifest.items || []).map((canvasRef: any) => canvasRef.id);
      const isPaged = (manifest.behavior || []).includes('paged');
      const isRightToLeft = manifest.viewingDirection === 'right-to-left';

      setOpenings(computeOpenings(canvasIds, isPaged, isRightToLeft, vault));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const opening = openings[currentIndex];
    if (!opening) return;

    const { vault } = getVaultHelper();
    const canvases = opening
      .map((canvasId) => {
        const canvas = vault.get<CanvasNormalized>(canvasId);
        const imageServiceId = getCanvasImageServiceId(canvas, vault);
        if (!imageServiceId) return null;
        return { id: canvasId, imageServiceId, width: canvas.width, height: canvas.height };
      })
      .filter((c): c is CurrentCanvas => c !== null);

    setCurrentCanvases(canvases);
  }, [openings, currentIndex]);

  const previousOpening = () => setCurrentIndex((i) => Math.max(i - 1, 0));
  const nextOpening = () => setCurrentIndex((i) => Math.min(i + 1, openings.length - 1));

  // Any interaction that changes what should be on screen needs its own
  // nudge afterward -- see nudgeRuntime's comment. Two delayed calls: one
  // to pick up the new viewport/rotation once the transition has mostly
  // settled, a second to catch tiles that were still loading after the
  // first (each nudge's getScheduledUpdates can itself surface more work).
  const nudgeSoon = () => {
    setTimeout(nudgeRuntime, 350);
    setTimeout(nudgeRuntime, 900);
  };

  // Covers initial load and Prev/Next-driven canvas changes -- both mount a
  // new AtlasAuto/world-object rather than going through a click handler
  // above, so they need their own nudge to get tiles loading and labelled
  // without the user having to interact first.
  useEffect(() => {
    if (currentCanvases.length) {
      nudgeSoon();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCanvases]);

  // A hover/selection from a previous opening pointing at content that no
  // longer exists would be actively misleading, not just stale.
  useEffect(() => {
    hoveredTileRef.current = null;
    setHighlightedTile(null);
    setSelectedTileId(null);
    setAllTileBoxes([]);
  }, [currentIndex]);

  // Each canvas's world-object is offset by this much (see the render loop
  // below) to lay a spread out left-to-right -- computed once per
  // currentCanvases change so both the render loop and the hover handler
  // agree on where a given canvas actually sits, instead of duplicating the
  // running-total logic in two places.
  const canvasXOffsets = React.useMemo(() => {
    const offsets: Record<string, number> = {};
    let x = 0;
    for (const canvas of currentCanvases) {
      offsets[canvas.imageServiceId] = x;
      x += canvas.width + GUTTER;
    }
    return offsets;
  }, [currentCanvases]);

  // Maps a tile's own local x/y/width/height (as recorded from
  // debugImageStretch) to where it actually renders on screen right now.
  //
  // event.x/y/targetWidth/targetHeight are TiledImage#display.points, which
  // is deliberately data.points, not data.displayPoints (see
  // spacial-content/tiled-image.ts's constructor) -- i.e. pixels local to
  // that *specific downsampled tile*, not the shared full-resolution world
  // space every other Atlas coordinate (world-object x/y/width/height,
  // canvasXOffsets, worldToViewer's inputs) uses. A tile at scaleFactor 4 is
  // stored at 1/4 those pixel counts, so world coordinates are exactly
  // label.{x,y,width,height} * scaleFactor -- confirmed against a captured
  // "whole image at 4x" tile: targetWidth 643 * 4 = 2572, matching the
  // canvas's real ~2569px width (rounding from the /4 in TiledImage). Skipping
  // this multiply is what made a tile that actually covers the whole image
  // highlight as a small fraction of it.
  //
  // Shared by the single hover highlight and the "show all tile boundaries"
  // overlay below -- both need exactly this same on-screen rect, just for
  // different sets of tiles and with different rendering on top.
  const computeTileScreenBox = (imageServiceId: string, label: TileLabel) => {
    const preset = ref.current;
    const runtime = preset?.runtime;
    const canvasEl = preset?.canvas;
    if (!runtime || !canvasEl) return null;

    const tileScaleFactor = parseFloat(label.scaleFactor) || 1;
    const worldX = label.x * tileScaleFactor;
    const worldY = label.y * tileScaleFactor;
    const worldWidth = label.width * tileScaleFactor;
    const worldHeight = label.height * tileScaleFactor;

    const globalX = (canvasXOffsets[imageServiceId] || 0) + worldX;
    const screenRect = runtime.worldToViewer(globalX, worldY, worldWidth, worldHeight);
    const centerX = screenRect.x + screenRect.width / 2;
    const centerY = screenRect.y + screenRect.height / 2;
    const center = rotation
      ? rotatePointAroundCenter(centerX, centerY, canvasEl.clientWidth / 2, canvasEl.clientHeight / 2, rotation)
      : { x: centerX, y: centerY };

    // A tile that covered the whole view when it was drawn (e.g. a low-res
    // overview fetched right after load) can end up far larger than the
    // current viewport after zooming in -- its highlight is then mostly or
    // entirely clipped by the container's overflow:hidden. Flagging that
    // (checked against the *unrotated* rect, an approximation once rotated,
    // but good enough to tell "mostly here" from "elsewhere entirely") lets
    // the UI say so instead of just silently showing a sliver.
    const left = screenRect.x;
    const top = screenRect.y;
    const offScreen =
      left < 0 || top < 0 || left + screenRect.width > canvasEl.clientWidth || top + screenRect.height > canvasEl.clientHeight;

    return {
      x: center.x,
      y: center.y,
      // The tile's real on-screen size, not a fixed/clamped marker -- shows
      // honestly how much of the image it actually covers at the current
      // zoom, and how that compares to its neighbours. The box is centered
      // on `center` (already rotation-corrected) and then CSS-rotated by the
      // same amount around its own center (== center, by construction),
      // which correctly rotates its *shape* to match -- worldToViewer's
      // unrotated width/height are still the right numbers to rotate, since
      // rotation doesn't change a rectangle's own dimensions, only its
      // position and orientation.
      width: screenRect.width,
      height: screenRect.height,
      offScreen,
    };
  };

  const highlightTile = (imageServiceId: string, label: TileLabel) => {
    const box = computeTileScreenBox(imageServiceId, label);
    if (!box) return;
    setHighlightedTile({ id: tileId(imageServiceId, label.index, label.scaleFactor), rotation, ...box });
  };

  // One outline per currently-tracked tile (see tileLabelsByCanvas), drawn
  // directly on the canvas at all times rather than only on hover -- lets a
  // seam or gap between adjacent tiles (e.g. a coarser tile still showing
  // through a thin strip its neighbour doesn't quite cover) show up
  // directly, instead of having to hover them one at a time and compare by
  // eye/memory. Colored by the same network-load status as the HUD rows.
  // Skips fully off-screen tiles (huge stale overview tiles from early in
  // this canvas's load, mostly) purely to keep the overlay legible.
  const computeAllTileBoxes = () => {
    if (!showAllTileBoundaries) return;
    const canvasEl = ref.current?.canvas;
    if (!canvasEl) return;
    const boxes: Array<{ id: string; label: string; x: number; y: number; width: number; height: number; offScreen: boolean; status?: TileLoadDebugEvent['status'] }> = [];
    for (const canvas of currentCanvases) {
      const labels = tileLabelsByCanvas[canvas.imageServiceId] || [];
      for (const label of labels) {
        const box = computeTileScreenBox(canvas.imageServiceId, label);
        if (!box) continue;
        // box.offScreen (from computeTileScreenBox) means "not *fully*
        // visible" -- right for the single hover highlight's warning
        // banner, but wrong here: at a deep enough zoom every tracked tile
        // is individually bigger than the viewport, so *every* box would
        // have offScreen: true and this overlay would render nothing at
        // all. What actually matters for "is this worth drawing" is
        // whether it overlaps the canvas *at all*.
        const left = box.x - box.width / 2;
        const top = box.y - box.height / 2;
        const noOverlap = left + box.width < 0 || top + box.height < 0 || left > canvasEl.clientWidth || top > canvasEl.clientHeight;
        if (noOverlap) continue;
        const id = tileId(canvas.imageServiceId, label.index, label.scaleFactor);
        boxes.push({ id, label: `#${label.index}@${label.scaleFactor}x`, status: tileLoadStatus[id], ...box });
      }
    }
    setAllTileBoxes(boxes);
  };
  latestComputeAllTileBoxes.current = computeAllTileBoxes;

  // Keeps a hovered highlight tracking its tile through zoom/pan/rotation
  // that happens without the mouse ever leaving the row (e.g. via the
  // Zoom/Rotate buttons) -- otherwise it freezes at its position from the
  // moment of hover, which very quickly reads as "wrong" rather than
  // "stale". Reuses the same interval as nudgeRuntime/tile-label flushing
  // rather than adding a second timer.
  const refreshHighlightIfHovering = () => {
    if (hoveredTileRef.current) {
      highlightTile(hoveredTileRef.current.imageServiceId, hoveredTileRef.current.label);
    }
  };
  latestRefreshHighlight.current = refreshHighlightIfHovering;

    const sleep = (ms: number | undefined) => new Promise(resolve => setTimeout(resolve, ms));


    const setupTest2 = async () => {
      const runtime = ref.current?.runtime;
      await setupTest();
      simulateDrag(false, 300)
      await sleep(1000);
      simulateDrag(false, 300)
      await sleep(500);
    }

    const setupTest = async () => {
      const runtime = ref.current?.runtime;

      nextOpening(); 
      nudgeSoon();
      await sleep(1000);
      setRotation((r) => (r + 90) % 360);
      await sleep(1000);
      nudgeSoon();
      runtime?.world.zoomIn();
      nudgeSoon();
      nudgeSoon();
      runtime?.world.zoomIn();
      await sleep(500);
      nudgeSoon();
      nudgeSoon();
      runtime?.world.zoomIn();
      await sleep(500);
      nudgeSoon();
      nudgeSoon();
      runtime?.world.zoomIn();
      await sleep(500);
      nudgeSoon();
      nudgeSoon();
      runtime?.world.zoomIn();
      await sleep(500);
      nudgeSoon();
      nudgeSoon();
      runtime?.world.zoomIn();
      await sleep(500);
      nudgeSoon();
      runtime?.world.zoomIn();
      nudgeSoon();
    }

  // Drives the canvas with synthetic mouse events (mousedown -> several
  // mousemoves stepping left -> mouseup), to reproduce the rotate-then-drag
  // jump bug deterministically from a button click rather than a manual
  // mouse drag. Dispatches both Pointer and Mouse events on every step --
  // browser-event-manager listens for both, and the two mouse-move
  // strategies inside it (see popmotion-controller.ts /
  // browser-event-manager.ts) key off different event types.
  //
  // Each mousemove gets its own macrotask (via setTimeout, not a tight
  // synchronous loop): browser-event-manager's _realPointerMove just
  // records `this.pointerMoveEvent = e` and a separate simulation-rate tick
  // is what actually drains it into onPointerMove -- firing all the moves
  // back-to-back synchronously means every one but the last gets
  // overwritten before that tick ever runs, so the runtime only ever sees
  // a single jump straight to the final position instead of a real drag.
  const simulateDrag = (left = true, size = 150) => {
    const canvasEl = ref.current?.canvas;
    if (!canvasEl) return;

    const rect = canvasEl.getBoundingClientRect();
    const startX = rect.left + rect.width / 2;
    const startY = rect.top + rect.height / 2;
    const distance = size * (left? 1 : -1);
    const steps = 15;
    const stepDelayMs = 30;

    const fire = (type: 'mousedown' | 'mousemove' | 'mouseup', x: number, y: number) => {
      const isUp = type === 'mouseup';
      const opts: PointerEventInit & MouseEventInit = {
        clientX: x,
        clientY: y,
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        button: 0,
        buttons: isUp ? 0 : 1,
        isPrimary: true,
      };
      const pointerType = type.replace('mouse', 'pointer') as 'pointerdown' | 'pointermove' | 'pointerup';
      canvasEl.dispatchEvent(new PointerEvent(pointerType, opts));
      canvasEl.dispatchEvent(new MouseEvent(type, opts));
    };

    fire('mousedown', startX, startY);

    for (let i = 1; i <= steps; i++) {
      window.setTimeout(() => {
        const x = startX - (distance * i) / steps;
        fire('mousemove', x, startY);
      }, stepDelayMs * i);
    }

    // Let the throttled move actually get processed before releasing.
    window.setTimeout(() => {
      fire('mouseup', startX - distance, startY);
    }, stepDelayMs * steps + 100);
  };

  return (
    <>
      <button
        disabled={currentIndex === 0}
        onClick={() => {
          previousOpening();
          nudgeSoon();
        }}
      >
        Prev
      </button>
      <button
        disabled={currentIndex >= openings.length - 1}
        onClick={() => {
          nextOpening();
          nudgeSoon();
        }}
      >
        Next
      </button>
      <button
        disabled={isAtMaxUsefulZoom}
        onClick={() => {
          const runtime = ref.current?.runtime;
          // getScaleFactor(true) is device-pixel-per-world-unit (dpi-
          // adjusted); world units are source-image pixels at that
          // canvas's own base resolution (see spacial-content/tiled-
          // image.ts), so once this passes 1 there are more screen pixels
          // than source pixels to show, and it can only get blurrier from
          // there -- see MAX_NATIVE_SCALE_FACTOR's comment.
          if (runtime && runtime.getScaleFactor(true) >= MAX_NATIVE_SCALE_FACTOR) {
            return;
          }
          runtime?.world.zoomIn();
          nudgeSoon();
        }}
      >
        Zoom In
      </button>
      <button
        onClick={() => {
          ref.current?.runtime?.world.zoomOut();
          nudgeSoon();
        }}
      >
        Zoom Out
      </button>
      <button
        onClick={() => {
          setRotation((r) => (r + 90) % 360);
          nudgeSoon();
        }}
      >
        Rotate Canvas From Center
      </button>
      <button onClick={setupTest}>setup test</button>
      <button onClick={setupTest2}>setup test2</button>
      <button onClick={captureDebugState}>Capture Debug State</button>
      <button onClick={simulateDrag}>Simulate Drag 150px Left</button>
      <button
        onClick={() => {
          setShowAllTileBoundaries((show) => {
            const next = !show;
            if (next) computeAllTileBoxes();
            else setAllTileBoxes([]);
            return next;
          });
        }}
      >
        {showAllTileBoundaries ? 'Hide' : 'Show'} All Tile Boundaries
      </button>

      <div style={{ fontSize: 11, fontFamily: 'monospace', margin: '4px 0', opacity: 0.8 }}>
        tile border:{' '}
        {(Object.keys(TILE_STATUS_COLORS) as Array<TileLoadDebugEvent['status']>).map((status) => (
          <span key={status} style={{ marginRight: 10 }}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                border: `2px solid ${TILE_STATUS_COLORS[status]}`,
                borderRadius: 2,
                marginRight: 4,
              }}
            />
            {status}
          </span>
        ))}
      </div>

      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <Container>
          {currentCanvases.length ? (
            <AtlasAuto
              rotateFromWorldCenter
              onCreated={(e) => {
                ref.current = e;
                // Debug convenience only: lets a browser console (or an
                // automated test) drive runtime.target/goHome directly to
                // reach a specific tile for inspection, without fighting
                // simulated mouse drags to pan there.
                (window as any).__atlasPreset = e;
              }}
            >
              <world>
                {currentCanvases.map((canvas) => (
                  <world-object
                    key={canvas.id}
                    x={canvasXOffsets[canvas.imageServiceId] || 0}
                    height={canvas.height}
                    width={canvas.width}
                  >
                    <ImageService id={canvas.imageServiceId} width={canvas.width} height={canvas.height} rotation={rotation} />
                  </world-object>
                ))}
              </world>
            </AtlasAuto>
          ) : null}
        </Container>

        {/* Every currently-tracked, on-screen tile's own boundary -- see
            computeAllTileBoxes. Unlike the single hover highlight below,
            these are unfilled (border only) so overlapping tiles at
            different resolution levels are all still visible, and a real
            seam/gap between neighbouring tiles shows up directly as a
            visible line instead of having to hover each one and compare. */}
        {showAllTileBoundaries
          ? allTileBoxes.map((box) => (
              <div
                key={box.id}
                title={`${box.label} -- ${box.status || 'unknown'}`}
                style={{
                  position: 'absolute',
                  left: box.x - box.width / 2,
                  top: box.y - box.height / 2,
                  width: box.width,
                  height: box.height,
                  transform: `rotate(${rotation}deg)`,
                  boxSizing: 'border-box',
                  zIndex: 15,
                  border: `1px solid ${box.status ? TILE_STATUS_COLORS[box.status] : '#555'}`,
                  pointerEvents: 'none',
                }}
              />
            ))
          : null}

        {/* Marks where the hovered HUD row's tile actually is right now --
            see highlightTile. Not clipped to the canvas bounds: if the tile
            is currently panned off screen, this deliberately renders
            outside Container too, which is the honest answer to "where is
            it" (nowhere visible) rather than hiding that fact. */}
        {highlightedTile ? (
          <div
            style={{
              position: 'absolute',
              left: highlightedTile.x - highlightedTile.width / 2,
              top: highlightedTile.y - highlightedTile.height / 2,
              width: highlightedTile.width,
              height: highlightedTile.height,
              // The box is already centered on the rotation-corrected
              // center point (see highlightTile), so CSS's default
              // transform-origin (50% 50%, i.e. this box's own center)
              // rotates its shape around exactly that same point -- no
              // extra transform-origin math needed.
              transform: `rotate(${highlightedTile.rotation}deg)`,
              boxSizing: 'border-box',
              zIndex: 20,
              border: '3px solid #ffd23f',
              boxShadow: '0 0 0 2px rgba(0,0,0,0.6), 0 0 12px rgba(255,210,63,0.8)',
              borderRadius: 4,
              pointerEvents: 'none',
            }}
          />
        ) : null}

        {highlightedTile?.offScreen ? (
          <div
            style={{
              position: 'absolute',
              left: 8,
              bottom: 8,
              zIndex: 20,
              background: 'rgba(0,0,0,0.75)',
              color: '#ffd23f',
              fontSize: 11,
              fontFamily: 'monospace',
              padding: '4px 8px',
              borderRadius: 4,
              pointerEvents: 'none',
            }}
          >
            tile extends beyond the current view -- zoom/pan to see all of it
          </div>
        ) : null}

        {/* Tile labels used to be Atlas <paragraph> elements positioned in
            world space, attached to their tile. That meant they panned and
            zoomed with the content -- which also meant panning away made
            them disappear entirely, and zooming out shrank them below
            legibility (there's no way to keep a world-space element at a
            constant screen size). Plain HTML positioned over the canvas,
            outside Atlas's coordinate system entirely, stays fixed on
            screen and legible regardless of pan/zoom. Hovering a row
            instead draws the highlight above at the tile's *current*
            on-screen position, and clicking one links it to its entry in
            the debug capture below (see selectedTileId). */}
        <div
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            // Atlas's own root element sets --atlas-z-index (default 10) on
            // itself (see utility/stylesheet.ts's base rules) -- without
            // out-ranking that here, this panel renders correctly into the
            // DOM (confirmed) but sits underneath the canvas, invisible.
            zIndex: 20,
            maxHeight: 'calc(100% - 16px)',
            maxWidth: 220,
            overflowY: 'auto',
            background: 'rgba(0,0,0,0.75)',
            color: '#fff',
            fontSize: 11,
            fontFamily: 'monospace',
            padding: 8,
            borderRadius: 4,
          }}
        >
          {currentCanvases.map((canvas) => {
            const labels = tileLabelsByCanvas[canvas.imageServiceId] || [];
            if (!labels.length) return null;
            return (
              <div key={canvas.id} style={{ marginBottom: 6 }}>
                <div style={{ opacity: 0.7, marginBottom: 2 }}>{canvas.id.split('/').pop()}</div>
                {labels.map((label) => {
                  const id = tileId(canvas.imageServiceId, label.index, label.scaleFactor);
                  const isSelected = selectedTileId === id;
                  // No entry yet means debugTileLoad hasn't fired for this
                  // tile at all -- e.g. it was drawn straight from
                  // imageCache (see canvas-renderer.ts's loadImage) before
                  // this hook existed in this session, or before this
                  // effect mounted. Distinguished from 'requested' (in
                  // flight) with a neutral color rather than implying
                  // either state.
                  const status = tileLoadStatus[id];
                  const statusColor = status ? TILE_STATUS_COLORS[status] : '#555';
                  return (
                    <div
                      key={label.key}
                      onMouseEnter={() => {
                        hoveredTileRef.current = { imageServiceId: canvas.imageServiceId, label };
                        highlightTile(canvas.imageServiceId, label);
                      }}
                      onMouseLeave={() => {
                        hoveredTileRef.current = null;
                        setHighlightedTile(null);
                      }}
                      onClick={() => {
                        setSelectedTileId(id);
                        captureDebugState();
                      }}
                      title={status ? `network: ${status}` : 'network: unknown (loaded before debugTileLoad attached)'}
                      style={{
                        color: label.stretched ? '#ff6b6b' : '#fff',
                        cursor: 'pointer',
                        textDecoration: isSelected ? 'underline' : 'none',
                        background: isSelected ? 'rgba(255,210,63,0.25)' : 'transparent',
                        border: `1px solid ${statusColor}`,
                        borderRadius: 3,
                        padding: '0 3px',
                        marginBottom: 1,
                      }}
                    >
                      #{label.index}@{label.scaleFactor}x{label.stretched ? ' (stretched)' : ''}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {capturedDebugState ? (
        <>
          <div>
            Captured at {capturedDebugState.capturedAt} -- {capturedDebugState.tileSelection.length} tile-selection,{' '}
            {capturedDebugState.hitTestCulling.length} hit-test, {capturedDebugState.imageStretch.length} visible
            image-draw events ({capturedDebugState.stretchedTileCount} stretched, {capturedDebugState.hiddenNotVisibleCount}{' '}
            hidden as not currently visible)
          </div>

          {selectedTileId
            ? (() => {
                // The actual link from a clicked HUD label to this JSON:
                // both were tagged with the same tileId (see
                // captureDebugState and the HUD row's onClick above).
                const match = capturedDebugState.imageStretch.find((entry: any) => entry.tileId === selectedTileId);
                return (
                  <div style={{ border: '2px solid #ffd23f', borderRadius: 4, padding: 8, margin: '8px 0', background: '#1a1a1a' }}>
                    <strong>{selectedTileId}</strong>
                    {match ? (
                      <div style={{ fontSize: 12, marginTop: 4 }}>
                        <div>
                          natural {match.naturalWidth}x{match.naturalHeight} -- target {match.targetWidth}x
                          {match.targetHeight}
                        </div>
                        <div>
                          stretched: {String(match.stretched)}, visible: {String(match.isVisible)}
                        </div>
                        <div style={{ opacity: 0.7, wordBreak: 'break-all', marginTop: 2 }}>{match.url}</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
                        Not in this capture (it may not have been (re)drawn since the last click) -- click the label
                        again to refresh.
                      </div>
                    )}
                  </div>
                );
              })()
            : null}

          <pre style={{ maxHeight: 300, overflow: 'auto', background: '#111', color: '#0f0', padding: 8, fontSize: 11 }}>
            {JSON.stringify(capturedDebugState, null, 2)}
          </pre>
        </>
      ) : null}
    </>
  );
};
