import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AtlasAuto } from '../src/modules/react-reconciler/components/AtlasAuto';
import type { Preset } from '../src/modules/react-reconciler/presets/_types';
import type { Runtime, ViewportChangeEvent } from '../src/renderer/runtime';
import '../src/modules/react-reconciler/types';

export default { title: 'Mobile / Portrait editing' };

type Point = { x: number; y: number };
const page = { x: 0, y: 0, width: 2400, height: 3600 };
const region = { x: 600, y: 1200, width: 700, height: 450 };
// Local test plate: phone checks work without a remote IIIF service or image requests.
const plate = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="3600">
  <defs><pattern id="fine" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#e2dac7" stroke-width="1"/></pattern>
  <pattern id="grid" width="200" height="200" patternUnits="userSpaceOnUse"><rect width="200" height="200" fill="url(#fine)"/><path d="M200 0H0V200" fill="none" stroke="#b8ae95" stroke-width="2"/></pattern></defs>
  <rect width="2400" height="3600" fill="#faf4e3"/><rect width="2400" height="3600" fill="url(#grid)"/>
  <text x="200" y="250" font-family="serif" font-size="100" fill="#332d26">Portrait drawing test plate</text>
  <text x="200" y="350" font-family="sans-serif" font-size="40" fill="#635b4f">2400 × 3600 · minor grid 20 units · major grid 200 units</text>
  ${Array.from(
    { length: 13 },
    (_, i) =>
      `<text x="200" y="${650 + i * 200}" font-family="serif" font-size="60" fill="#554638">${String(i + 1).padStart(
        2,
        '0'
      )}   a b c d e f g h i j k l m n o p</text>`
  ).join('')}
  <rect x="600" y="1200" width="700" height="450" fill="#fff4bd" fill-opacity=".65" stroke="#9b5b16" stroke-width="6"/>
  <circle cx="950" cy="1425" r="4" fill="#b5222b"/>
</svg>`)}`;

function MobileEditor({
  reticle = false,
  legacy = false,
  explore = false,
}: {
  reticle?: boolean;
  legacy?: boolean;
  explore?: boolean;
}) {
  const [runtime, setRuntime] = useState<Runtime>();
  const [camera, setCamera] = useState<ViewportChangeEvent>();
  const [hand, setHand] = useState(false);
  const [rotation, setRotation] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const [compact, setCompact] = useState(false);
  const [draft, setDraft] = useState<Point[]>([]);
  const draftRef = useRef<Point[] | null>(null);
  const [paths, setPaths] = useState<Point[][]>([]);
  const [cancelCount, setCancelCount] = useState(0);
  const [tapCount, setTapCount] = useState(0);
  const controllerConfig = useMemo(
    () => ({
      sketchTouchNavigation: legacy ? ('none' as const) : ('two-finger' as const),
      enableTouchRotation: rotation,
      enableHoldToHome: false,
    }),
    [legacy, rotation]
  );
  const runtimeOptions = useMemo(() => ({ maxOverZoom: 5 }), []);
  const created = useCallback((preset: Preset) => {
    setRuntime(preset.runtime);
  }, []);

  useEffect(() => {
    if (!runtime) return;
    setCamera({
      viewport: { ...runtime.getViewport() },
      center: runtime.getViewportCenter(),
      scaleFactor: runtime.getScaleFactor(),
      rotation: runtime.viewRotation,
    });
    return runtime.addViewportChangeListener(setCamera);
  }, [runtime]);

  function cancelDraft() {
    if (draftRef.current) setCancelCount((n) => n + 1);
    draftRef.current = null;
    setDraft([]);
  }
  function start(event: any) {
    if (hand || reticle || explore) return;
    const point = { ...event.atlas };
    draftRef.current = [point];
    setDraft([point]);
  }
  function move(event: any) {
    if (!draftRef.current) return;
    const point = { ...event.atlas };
    const last = draftRef.current[draftRef.current.length - 1];
    if (Math.hypot(point.x - last.x, point.y - last.y) * (runtime?.getScaleFactor() || 1) < 4) return;
    draftRef.current = [...draftRef.current, point];
    setDraft(draftRef.current);
  }
  function end() {
    // React may run the updater after this handler clears the active draft.
    const completed = draftRef.current;
    if (completed && completed.length > 1) setPaths((all) => [...all, completed]);
    draftRef.current = null;
    setDraft([]);
  }
  function addCentrePoint() {
    if (runtime) setPaths((all) => [[...(all[0] || []), runtime.getViewportCenter()]]);
  }
  function nudge(dx: number, dy: number) {
    if (!runtime) return;
    // Move the camera by one CSS pixel, respecting view rotation.
    const bounds = runtime.getRendererScreenPosition();
    if (!bounds) return;
    const from = { ...runtime.viewerToWorld(bounds.width / 2, bounds.height / 2) };
    const to = runtime.viewerToWorld(bounds.width / 2 + dx, bounds.height / 2 + dy);
    runtime.transitionManager.stopTransition();
    runtime.setViewport({ x: runtime.x + to.x - from.x, y: runtime.y + to.y - from.y });
    runtime.updateNextFrame();
  }
  function project(point: Point) {
    return runtime?.worldToViewer(point.x, point.y, 0, 0) || point;
  }
  function polyline(points: Point[]) {
    return points
      .map(project)
      .map((p) => `${p.x},${p.y}`)
      .join(' ');
  }

  return (
    <main className="mobile-demo">
      <style>{`
        .mobile-demo { font: 14px/1.45 system-ui, sans-serif; color: #202c34; max-width: 440px; margin: 0 auto; padding: 12px; }
        .mobile-demo h1 { font-size: 21px; margin: 0 0 6px; }
        .mobile-demo p { margin: 6px 0 12px; }
        .mobile-toolbar { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
        .mobile-demo button, .mobile-demo input { min-height: 44px; font: inherit; box-sizing: border-box; }
        .mobile-demo button { padding: 8px 12px; border: 1px solid #9eabb3; border-radius: 8px; background: #fff; color: inherit; cursor: pointer; }
        .mobile-demo button[aria-pressed="true"] { background: #124c64; color: white; border-color: #124c64; }
        .mobile-stage { position: relative; height: min(65dvh, 640px); min-height: 260px; overflow: hidden; border: 1px solid #8c9ba3; border-radius: 10px; }
        .mobile-stage--compact { height: 300px; }
        .mobile-drawing { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 20; }
        .mobile-reticle { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 30px; height: 30px; border: 1px solid #143e51; border-radius: 50%; pointer-events: none; z-index: 21; }
        .mobile-reticle::before, .mobile-reticle::after { content: ''; position: absolute; background: #c52732; }
        .mobile-reticle::before { top: 14px; left: -7px; height: 2px; width: 44px; }
        .mobile-reticle::after { left: 14px; top: -7px; width: 2px; height: 44px; }
        .mobile-readout { font: 12px/1.6 ui-monospace, monospace; display: block; margin: 10px 0; }
        .mobile-demo label { display: flex; gap: 8px; align-items: center; }
        .mobile-checks { padding-left: 20px; }
      `}</style>
      <h1>
        {reticle
          ? 'Place points at the reticle'
          : explore
          ? 'Explore gesture check'
          : legacy
          ? 'Sketch: existing behaviour'
          : 'Draw and navigate'}
      </h1>
      <p>
        {reticle
          ? 'Pan the paper beneath the crosshair, then add a vertex. Nudge by one screen pixel for precise placement.'
          : explore
          ? 'One finger pans. Two fingers pan and pinch. Double-tap toggles home and cover.'
          : legacy
          ? 'Navigation is disabled in Draw. Hand explicitly enables one-finger pan.'
          : 'Drag one finger to draw a region. Add a second finger to cancel that stroke and navigate. Lift both before drawing again.'}
      </p>
      <div className="mobile-toolbar" aria-label="Drawing tools">
        {!explore && !reticle && (
          <>
            <button
              aria-pressed={!hand}
              onClick={() => {
                cancelDraft();
                setHand(false);
              }}
            >
              Draw
            </button>
            <button
              aria-pressed={hand}
              onClick={() => {
                cancelDraft();
                setHand(true);
              }}
            >
              Hand
            </button>
          </>
        )}
        <button onClick={() => runtime?.zoomToRegion(region, { padding: 32, transition: { duration: 350 } })}>
          Zoom to region
        </button>
        <button onClick={() => runtime?.zoomToRegion(page, { padding: 12, transition: { duration: 350 } })}>
          Fit page
        </button>
        <button
          onClick={() => {
            setPaths([]);
            cancelDraft();
          }}
        >
          Clear
        </button>
      </div>
      <div className={`mobile-stage ${compact ? 'mobile-stage--compact' : ''}`}>
        <AtlasAuto
          mode={explore ? 'explore' : 'sketch'}
          sketchPanOverride={hand || reticle}
          controllerConfig={controllerConfig}
          runtimeOptions={runtimeOptions}
          onCreated={created}
          background="#e5e9eb"
        >
          <world>
            <world-object
              width={page.width}
              height={page.height}
              onPointerDown={start}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={cancelDraft}
              onClick={() => setTapCount((n) => n + 1)}
            >
              <world-image uri={plate} target={page} display={{ width: page.width, height: page.height }} />
            </world-object>
          </world>
        </AtlasAuto>
        <svg className="mobile-drawing" aria-hidden="true">
          {paths.map((points, i) => (
            <g key={i}>
              <polygon points={polyline(points)} fill="rgba(8, 113, 140, .15)" stroke="#08718c" strokeWidth="2" />
              {points.map((point, j) => {
                const p = project(point);
                return <circle key={j} cx={p.x} cy={p.y} r="6" fill="white" stroke="#08718c" strokeWidth="2" />;
              })}
            </g>
          ))}
          <polyline points={polyline(draft)} fill="none" stroke="#b44818" strokeWidth="3" />
        </svg>
        {reticle && <div className="mobile-reticle" aria-hidden="true" />}
      </div>
      {reticle && (
        <div className="mobile-toolbar" aria-label="Reticle controls">
          <button onClick={() => nudge(-1, 0)} aria-label="Nudge left">
            ←
          </button>
          <button onClick={() => nudge(0, -1)} aria-label="Nudge up">
            ↑
          </button>
          <button onClick={addCentrePoint}>Add vertex</button>
          <button onClick={() => nudge(0, 1)} aria-label="Nudge down">
            ↓
          </button>
          <button onClick={() => nudge(1, 0)} aria-label="Nudge right">
            →
          </button>
        </div>
      )}
      <output className="mobile-readout" aria-live="off">
        Centre {camera?.center.x.toFixed(1)}, {camera?.center.y.toFixed(1)}
        <br />1 CSS px = {camera ? (1 / camera.scaleFactor).toFixed(3) : '…'} world units · zoom limit 5× native
        <br />
        22px hit radius = {camera ? (22 / camera.scaleFactor).toFixed(1) : '…'} world units
        <br />
        Cancelled strokes: {cancelCount} · clicks: {tapCount} · regions: {paths.length}
      </output>
      <label>
        <input
          type="checkbox"
          checked={rotation}
          onChange={(e) => {
            cancelDraft();
            setRotation(e.target.checked);
          }}
        />{' '}
        Enable two-finger rotation
      </label>
      <div className="mobile-toolbar">
        <button aria-pressed={compact} onClick={() => setCompact((v) => !v)}>
          Resize container
        </button>
        <button aria-pressed={keyboard} onClick={() => setKeyboard((v) => !v)}>
          Keyboard test
        </button>
      </div>
      {keyboard && (
        <label>
          Region name <input placeholder="Tap to open the phone keyboard" />
        </label>
      )}
      <ol className="mobile-checks">
        <li>Scroll this page outside the viewer; draw inside it without page movement.</li>
        <li>
          {reticle
            ? 'Navigate beneath the crosshair, then add vertices. Each nudge should move one screen pixel.'
            : explore
            ? 'Pan with one finger, then pinch with two. Check double-tap and momentum.'
            : legacy
            ? 'Draw should keep the paper fixed. Switch to Hand to pan, then return to Draw.'
            : 'Start a stroke, add a second finger, pinch, lift one and move it. No stroke should remain or restart.'}
        </li>
        <li>
          {reticle
            ? 'Pinch to the zoom limit and place a vertex on the small red dot.'
            : 'Lift all fingers before starting again. A stationary tap in Draw or Explore should increment clicks once; Hand should not.'}
        </li>
        <li>Pinch while watching the scale and centre readout update continuously.</li>
        <li>Collapse the address bar, resize, or open the keyboard. The same world point should stay in the centre.</li>
      </ol>
    </main>
  );
}

export const TwoFingerDrawing = () => <MobileEditor />;
export const CentreReticleAndNudges = () => <MobileEditor reticle />;
export const ExistingSketchBehaviour = () => <MobileEditor legacy />;
export const ExploreRegression = () => <MobileEditor explore />;
