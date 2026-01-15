import * as React from 'react';
import { useRef, useState, useEffect } from 'react';
import '../src/modules/react-reconciler/types';
import { Atlas } from '../src/modules/react-reconciler/Atlas';
import { AtlasAuto } from '../src/modules/react-reconciler/components/AtlasAuto';
import { Preset } from '../src/modules/react-reconciler/presets/_types';
// @ts-ignore
import img from './assets/img.png';

export default { title: 'Atlas / Home Padding' };

const ExampleWorld = ({ id = '1', children }: { id?: string; children?: React.ReactNode }) => (
  <>
    <world-object id={id} height={900} width={600} x={0} y={0} scale={1}>
      <world-image
        uri={img}
        target={{ width: 600, height: 900, x: 0, y: 0 }}
        display={{ width: 1200, height: 1800 }}
      />
      {children}
    </world-object>
  </>
);

export const WithRightSidebar = () => {
  const sidebarWidth = 200;
  const [presetA, setPresetA] = useState<Preset>();
  const [presetB, setPresetB] = useState<Preset>();
  const [presetC, setPresetC] = useState<Preset>();

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ width: 400 }}>
        <Atlas
          width={400}
          height={300}
          homePaddingPx={{ right: sidebarWidth }}
          onCreated={(preset) => setPresetA(preset)}
          htmlChildren={
            <>
              <div className="atlas-sidebar" style={{ width: sidebarWidth }}>
                <div style={{ padding: 10, fontSize: 12 }}>
                  <strong>Sidebar</strong>
                  <div>{sidebarWidth}px wide</div>
                  <button
                    onClick={() => presetA?.runtime.world.goHome()}
                    style={{ marginTop: 10, padding: '4px 8px', cursor: 'pointer' }}
                  >
                    Go Home
                  </button>
                </div>
              </div>
              <HomePositionDebug preset={presetA} />
            </>
          }
        >
          <ExampleWorld id="a" />
        </Atlas>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <strong>Width 400px</strong> — right sidebar {sidebarWidth}px
          <br />
          <em>Red dashed box = home position</em>
        </div>
      </div>

      <div style={{ width: 600 }}>
        <Atlas
          width={600}
          height={300}
          homePaddingPx={{ right: sidebarWidth }}
          onCreated={(preset) => setPresetB(preset)}
          htmlChildren={
            <>
              <div className="atlas-sidebar" style={{ width: sidebarWidth }}>
                <div style={{ padding: 10, fontSize: 12 }}>
                  <strong>Sidebar</strong>
                  <div>{sidebarWidth}px wide</div>
                  <button
                    onClick={() => presetB?.runtime.world.goHome()}
                    style={{ marginTop: 10, padding: '4px 8px', cursor: 'pointer' }}
                  >
                    Go Home
                  </button>
                </div>
              </div>
              <HomePositionDebug preset={presetB} />
            </>
          }
        >
          <ExampleWorld id="b" />
        </Atlas>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <strong>Width 600px</strong> — right sidebar {sidebarWidth}px
          <br />
          <em>Red dashed box = home position</em>
        </div>
      </div>

      <div style={{ width: 800 }}>
        <Atlas
          width={800}
          height={300}
          homePaddingPx={{ right: sidebarWidth }}
          onCreated={(preset) => setPresetC(preset)}
          htmlChildren={
            <>
              <div className="atlas-sidebar" style={{ width: sidebarWidth }}>
                <div style={{ padding: 10, fontSize: 12 }}>
                  <strong>Sidebar</strong>
                  <div>{sidebarWidth}px wide</div>
                  <button
                    onClick={() => presetC?.runtime.world.goHome()}
                    style={{ marginTop: 10, padding: '4px 8px', cursor: 'pointer' }}
                  >
                    Go Home
                  </button>
                </div>
              </div>
              <HomePositionDebug preset={presetC} />
            </>
          }
        >
          <ExampleWorld id="c" />
        </Atlas>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <strong>Width 800px</strong> — right sidebar {sidebarWidth}px
          <br />
          <em>Red dashed box = home position</em>
        </div>
      </div>

      {/* Overlay sidebars — absolute positioned inside each Atlas container */}
      <style>{`
        .atlas-sidebar {
          position: absolute;
          top: 0;
          right: 0;
          height: 100%;
          background: rgba(255, 255, 255, 0.95);
          border-left: 2px solid #ccc;
          box-shadow: -2px 0 8px rgba(0,0,0,0.1);
          z-index: 20;
          color: #333;
        }
      `}</style>

    </div>
  );
};

export const WithPerSidePadding = () => {
  const [preset, setPreset] = useState<Preset>();

  return (
    <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
      <div style={{ width: 600 }}>
        <Atlas
          width={600}
          height={300}
          homePaddingPx={{ left: 50, right: 150, top: 10, bottom: 10 }}
          onCreated={(p) => setPreset(p)}
          htmlChildren={
            <>
              <div className="atlas-sidebar" style={{ width: 150 }}>
                <div style={{ padding: 10, fontSize: 12 }}>
                  <strong>Right Panel</strong>
                  <div>150px wide</div>
                  <button
                    onClick={() => preset?.runtime.world.goHome()}
                    style={{ marginTop: 10, padding: '4px 8px', cursor: 'pointer' }}
                  >
                    Go Home
                  </button>
                </div>
              </div>
              {/* Left overlay to visualize left padding */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: 50,
                  height: '100%',
                  background: 'rgba(200, 200, 255, 0.3)',
                  borderRight: '1px dashed blue',
                  zIndex: 15,
                  pointerEvents: 'none',
                }}
              />
              {/* Top overlay */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: 10,
                  background: 'rgba(255, 200, 200, 0.3)',
                  borderBottom: '1px dashed red',
                  zIndex: 14,
                  pointerEvents: 'none',
                }}
              />
              {/* Bottom overlay */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  width: '100%',
                  height: 10,
                  background: 'rgba(255, 200, 200, 0.3)',
                  borderTop: '1px dashed red',
                  zIndex: 14,
                  pointerEvents: 'none',
                }}
              />
              <HomePositionDebug preset={preset} />
            </>
          }
        >
          <ExampleWorld id="d" />
        </Atlas>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <strong>Per-side padding</strong>
          <br />
          Left: 50px (blue), Right: 150px (white), Top/Bottom: 10px (pink)
          <br />
          <em>Red dashed box = home position</em>
        </div>
      </div>
    </div>
  );
};

export const WithSymmetricPadding = () => {
  const [preset, setPreset] = useState<Preset>();

  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <div style={{ width: 600 }}>
        <Atlas
          width={600}
          height={400}
          homePaddingPx={40}
          onCreated={(p) => setPreset(p)}
          htmlChildren={
            <>
              {/* Symmetric padding overlay */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  border: '40px solid rgba(200, 255, 200, 0.3)',
                  borderStyle: 'solid',
                  zIndex: 15,
                  pointerEvents: 'none',
                }}
              />
              {/* Go home button */}
              <div style={{ position: 'absolute', top: 50, left: 50, zIndex: 25 }}>
                <button
                  onClick={() => preset?.runtime.world.goHome()}
                  style={{ padding: '8px 12px', cursor: 'pointer' }}
                >
                  Go Home
                </button>
              </div>
              <HomePositionDebug preset={preset} />
            </>
          }
        >
          <ExampleWorld id="e" />
        </Atlas>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <strong>Symmetric padding: 40px</strong> (green overlay)
          <br />
          <em>Red dashed box = home position</em>
        </div>
      </div>
    </div>
  );
};

export const InteractivePadding = () => {
  const [preset, setPreset] = useState<Preset>();
  const [leftPadding, setLeftPadding] = useState(20);
  const [rightPadding, setRightPadding] = useState(150);
  const [topPadding, setTopPadding] = useState(10);
  const [bottomPadding, setBottomPadding] = useState(10);

  useEffect(() => {
    if (preset) {
      preset.runtime.setHomePaddingPx({
        left: leftPadding,
        right: rightPadding,
        top: topPadding,
        bottom: bottomPadding,
      });
      preset.runtime.world.goHome();
    }
  }, [preset, leftPadding, rightPadding, topPadding, bottomPadding]);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3>Interactive Padding Controls</h3>
        <button
          onClick={() => preset?.runtime.world.goHome()}
          style={{ marginBottom: 10, padding: '8px 16px', cursor: 'pointer' }}
        >
          Go Home
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, maxWidth: 400 }}>
          <label>
            Left: {leftPadding}px
            <input
              type="range"
              min="0"
              max="200"
              value={leftPadding}
              onChange={(e) => setLeftPadding(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            Right: {rightPadding}px
            <input
              type="range"
              min="0"
              max="200"
              value={rightPadding}
              onChange={(e) => setRightPadding(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            Top: {topPadding}px
            <input
              type="range"
              min="0"
              max="100"
              value={topPadding}
              onChange={(e) => setTopPadding(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </label>
          <label>
            Bottom: {bottomPadding}px
            <input
              type="range"
              min="0"
              max="100"
              value={bottomPadding}
              onChange={(e) => setBottomPadding(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </label>
        </div>
      </div>

      <div style={{ width: 800 }}>
        <Atlas
          width={800}
          height={500}
          homePaddingPx={{ left: leftPadding, right: rightPadding, top: topPadding, bottom: bottomPadding }}
          onCreated={(p) => setPreset(p)}
          htmlChildren={
            <>
              {/* Visual overlays for each side */}
              {leftPadding > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: leftPadding,
                    height: '100%',
                    background: 'rgba(100, 149, 237, 0.2)',
                    borderRight: '2px solid rgba(100, 149, 237, 0.5)',
                    zIndex: 15,
                    pointerEvents: 'none',
                  }}
                />
              )}
              {rightPadding > 0 && (
                <div className="atlas-sidebar" style={{ width: rightPadding }}>
                  <div style={{ padding: 10, fontSize: 12 }}>
                    <strong>Right Panel</strong>
                    <div>{rightPadding}px</div>
                  </div>
                </div>
              )}
              {topPadding > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: topPadding,
                    background: 'rgba(255, 165, 0, 0.2)',
                    borderBottom: '2px solid rgba(255, 165, 0, 0.5)',
                    zIndex: 14,
                    pointerEvents: 'none',
                  }}
                />
              )}
              {bottomPadding > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    height: bottomPadding,
                    background: 'rgba(255, 165, 0, 0.2)',
                    borderTop: '2px solid rgba(255, 165, 0, 0.5)',
                    zIndex: 14,
                    pointerEvents: 'none',
                  }}
                />
              )}
              <HomePositionDebug preset={preset} />
            </>
          }
        >
          <ExampleWorld id="f" />
        </Atlas>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <em>Adjust sliders to see padding changes in real-time. Red dashed box = home position.</em>
        </div>
      </div>
    </div>
  );
};

// Debug overlay to show the home position bounds
const HomePositionDebug = ({ preset }: { preset?: Preset }) => {
  const [viewport, setViewport] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [homePos, setHomePos] = useState({ x: 0, y: 0, width: 0, height: 0 });

  useEffect(() => {
    if (!preset?.runtime) return;

    const interval = setInterval(() => {
      const rt = preset.runtime;
      const vp = rt.getViewport();
      setViewport(vp);

      const hp = rt.homePosition;
      setHomePos({
        x: hp[1],
        y: hp[2],
        width: hp[3] - hp[1],
        height: hp[4] - hp[2],
      });
    }, 100);

    return () => clearInterval(interval);
  }, [preset]);

  if (!preset) return null;

  const rt = preset.runtime;
  const scaleFactor = rt.getScaleFactor(false);

  const worldToScreen = (x: number, y: number, w: number, h: number) => {
    const vp = viewport;
    return {
      x: (x - vp.x) * scaleFactor,
      y: (y - vp.y) * scaleFactor,
      width: w * scaleFactor,
      height: h * scaleFactor,
    };
  };

  const homeScreen = worldToScreen(homePos.x, homePos.y, homePos.width, homePos.height);

  return (
    <div
      style={{
        position: 'absolute',
        left: homeScreen.x,
        top: homeScreen.y,
        width: homeScreen.width,
        height: homeScreen.height,
        border: '2px dashed rgba(255, 0, 0, 0.6)',
        pointerEvents: 'none',
        zIndex: 15,
      }}
      title="Home position boundary (red dashed)"
    />
  );
};

// Test story to verify constrainBounds works with padding
export const ConstrainBoundsWithMaxZoom = () => {
  const [preset, setPreset] = useState<Preset>();
  const [log, setLog] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setLog((prev) => [...prev.slice(-8), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const testGoHome = () => {
    if (!preset) return;
    addLog('Calling goHome()...');
    preset.runtime.world.goHome();
    setTimeout(() => {
      const vp = preset.runtime.getViewport();
      addLog(`Viewport: ${Math.round(vp.width)} x ${Math.round(vp.height)}`);
      addLog(`World: ${preset.runtime.world.width} x ${preset.runtime.world.height}`);
      addLog(`Scale: ${preset.runtime.getScaleFactor(false).toFixed(3)}`);
    }, 100);
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3>Constrain Bounds Test (maxUnderZoom = 1.0)</h3>
        <p>
          <strong>Test:</strong> With maxUnderZoom=1.0 and 200px right padding, goHome should still show the
          full world in the visible (non-padded) area.
        </p>
        <button onClick={testGoHome} style={{ padding: '8px 16px', cursor: 'pointer', marginRight: 10 }}>
          Test Go Home
        </button>
        <button
          onClick={() => preset?.runtime.world.zoomOut()}
          style={{ padding: '8px 16px', cursor: 'pointer' }}
        >
          Try Zoom Out
        </button>
      </div>

      <div style={{ width: 600 }}>
        <Atlas
          width={600}
          height={400}
          homePaddingPx={{ right: 200 }}
          runtimeOptions={{ maxUnderZoom: 1.0, maxOverZoom: 1.0 }}
          onCreated={(p) => {
            setPreset(p);
            addLog('Atlas created with maxUnderZoom=1.0');
          }}
          htmlChildren={
            <>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: 200,
                  height: '100%',
                  background: 'rgba(255, 255, 255, 0.95)',
                  borderLeft: '2px solid #ccc',
                  boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
                  zIndex: 20,
                  color: '#333',
                }}
              >
                <div style={{ padding: 10, fontSize: 12 }}>
                  <strong>Sidebar (200px)</strong>
                  <div style={{ marginTop: 10, fontSize: 11 }}>
                    The world (1200x1800) should fit fully in the area left of this sidebar.
                  </div>
                  <button
                    onClick={testGoHome}
                    style={{ marginTop: 10, padding: '4px 8px', cursor: 'pointer', fontSize: 11 }}
                  >
                    Go Home
                  </button>
                </div>
              </div>
              <HomePositionDebug preset={preset} />
            </>
          }
        >
          <ExampleWorld id="test" />
        </Atlas>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <strong>Config:</strong> maxUnderZoom: 1.0, right padding: 200px
          <br />
          <em>Expected: Full world visible in left 400px area (red dashed box should fill that area)</em>
        </div>
      </div>
      <div
        style={{
          marginTop: 10,
          padding: 10,
          background: '#f0f0f0',
          fontFamily: 'monospace',
          fontSize: 11,
          maxHeight: 150,
          overflow: 'auto',
        }}
      >
        {log.map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>
    </div>
  );
};

const regions = [
  { id: 'region-1', x: 50, y: 60, width: 200, height: 140, label: 'Top Left' },
  { id: 'region-2', x: 350, y: 300, width: 250, height: 180, label: 'Center' },
  { id: 'region-3', x: 100, y: 620, width: 300, height: 220, label: 'Bottom' },
];

export const GoToRegionWithPadding = () => {
  const [preset, setPreset] = useState<Preset>();
  const [activeRegion, setActiveRegion] = useState(regions[0]);
  const sidebarWidth = 220;

  const goToRegion = (region: typeof regions[0]) => {
    setActiveRegion(region);
    preset?.runtime.world.gotoRegion({
      x: region.x,
      y: region.y,
      width: region.width,
      height: region.height,
      paddingPx: { right: sidebarWidth, top: 10, bottom: 10 },
    });
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <strong>gotoRegion examples with padding + sidebar</strong>
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {regions.map((region) => (
            <button
              key={region.id}
              onClick={() => goToRegion(region)}
              style={{
                padding: '6px 10px',
                cursor: 'pointer',
                border: region.id === activeRegion.id ? '2px solid #d32f2f' : '1px solid #aaa',
                background: region.id === activeRegion.id ? '#ffebee' : '#fff',
              }}
            >
              {region.label}
            </button>
          ))}
          <button onClick={() => preset?.runtime.goHome()} style={{ padding: '6px 10px', cursor: 'pointer' }}>
            Go Home
          </button>
        </div>
      </div>

      <div style={{ width: 800 }}>
        <Atlas
          width={800}
          height={500}
          homePaddingPx={{ right: sidebarWidth, top: 10, bottom: 10 }}
          onCreated={(p) => setPreset(p)}
          htmlChildren={
            <>
              {/* Floating sidebar */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: sidebarWidth,
                  height: '100%',
                  background: 'rgba(255,255,255,0.95)',
                  borderLeft: '2px solid #ccc',
                  boxShadow: '-2px 0 8px rgba(0,0,0,0.1)',
                  zIndex: 20,
                  padding: 10,
                  fontSize: 12,
                }}
              >
                <strong>Sidebar</strong>
                <div style={{ marginTop: 8 }}>Padding: {sidebarWidth}px</div>
                <div style={{ marginTop: 8 }}>
                  Click the buttons above to go to each red region.
                </div>
              </div>
            </>
          }
        >
          <ExampleWorld id="goto">
            {regions.map((region) => (
              <box
                key={region.id}
                target={{ x: region.x, y: region.y, width: region.width, height: region.height }}
                style={{ border: '2px solid #d32f2f', background: 'rgba(211, 47, 47, 0.15)' }}
                interactive
                onClick={() => goToRegion(region)}
              />
            ))}
          </ExampleWorld>
        </Atlas>
        <div style={{ marginTop: 8, fontSize: 12 }}>
          <em>
            Red boxes are target regions. Padding is applied so the sidebar doesn't cover the focused region.
          </em>
        </div>
      </div>
    </div>
  );
};
