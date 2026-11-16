import React, { useEffect, useRef, useState } from 'react';
import {
  AtlasAuto,
  Comparison,
  ComparisonDivider,
  HTMLPortal,
  ImageService,
  useComparisonState,
  type ComparisonController,
  type ComparisonSplit,
  type Preset,
} from '../src/index';
import { atlas, World, WorldObject, SingleImage, createComparison, createComparisonDivider } from '../src/standalone';

export default { title: 'Comparison' };

function image(after: boolean) {
  const color = after ? '#d8c18d' : '#b8c6bc';
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600"><rect width="1000" height="600" fill="${color}"/><path d="M0 100H1000M0 200H1000M0 300H1000M0 400H1000M0 500H1000M100 0V600M200 0V600M300 0V600M400 0V600M500 0V600M600 0V600M700 0V600M800 0V600M900 0V600" stroke="#555" opacity=".25"/><circle cx="500" cy="300" r="180" fill="none" stroke="#444" stroke-width="8"/><rect x="${
      after ? 560 : 540
    }" y="220" width="120" height="160" fill="${
      after ? '#8a482e' : '#42645a'
    }"/><text x="40" y="70" font-size="40" font-family="sans-serif" fill="#222">${
      after ? 'After' : 'Before'
    }</text></svg>`
  )}`;
}
const beforeImage = image(false),
  afterImage = image(true);
const presetOptions = ['default-preset', { canvasBox: true }] as const;
const iiif = [
  'https://iiif.wellcomecollection.org/image/b18035723_0001.JP2',
  'https://iiif.wellcomecollection.org/image/b18035723_0002.JP2',
];

function Readout({ comparison }: { comparison: ComparisonController | null }) {
  const state = useComparisonState(comparison);
  return (
    <output>
      {state ? `${Math.round(state.split.position * 100)}% · ${Math.round(state.split.angle)}°` : 'Loading viewer'}
    </output>
  );
}

function Example({ controlled = false, tiled = false }: { controlled?: boolean; tiled?: boolean }) {
  const [comparison, setComparison] = useState<ComparisonController | null>(null);
  const [split, setSplit] = useState<ComparisonSplit>({ angle: 0, position: 0.5 });
  const [enabled, setEnabled] = useState(true);
  const [swapped, setSwapped] = useState(false);
  const [webgl, setWebgl] = useState(false);
  const [clicks, setClicks] = useState({ first: 0, second: 0 });
  const preset = useRef<Preset>();
  const increment = (side: 'first' | 'second') => setClicks((prev) => ({ ...prev, [side]: prev[side] + 1 }));
  const setPosition = (position: number) => comparison?.setSplit({ ...comparison.getState().split, position });
  const setAngle = (angle: number) => comparison?.setSplit({ ...comparison.getState().split, angle });
  return (
    <div
      style={{
        padding: 20,
        width: 'calc(100vw - 64px)',
        maxWidth: 1100,
        boxSizing: 'border-box',
        margin: 'auto',
        fontFamily: 'sans-serif',
        background: '#f7f7f5',
        color: '#222',
      }}
    >
      <h2>Viewport comparison</h2>
      <p>
        Drag the divider. Pan, zoom, or rotate the scene: the divider stays in the viewport. Tab to the divider and use
        arrow keys, Home or End.
      </p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        <label>
          Position{' '}
          <input
            aria-label="Position"
            type="range"
            min="0"
            max="1"
            step=".01"
            defaultValue=".5"
            onChange={(e) => setPosition(e.target.valueAsNumber)}
          />
        </label>
        <label>
          Angle{' '}
          <input
            aria-label="Angle"
            type="range"
            min="0"
            max="359"
            defaultValue="0"
            onChange={(e) => setAngle(e.target.valueAsNumber)}
          />
        </label>
        {[0, 45, 90, 215].map((angle) => (
          <button key={angle} onClick={() => setAngle(angle)}>
            {angle}°
          </button>
        ))}
        <button onClick={() => preset.current?.runtime.rotateBy(35)}>Rotate camera 35°</button>
        <button onClick={() => preset.current?.runtime.world.goHome()}>Home</button>
        <button onClick={() => setSwapped((value) => !value)}>Swap sides</button>
        <label>
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
        </label>
        <label>
          <input type="checkbox" checked={webgl} onChange={(e) => setWebgl(e.target.checked)} /> WebGL
        </label>
        <Readout comparison={comparison} />
      </div>
      <div
        style={{
          width: '100%',
          maxWidth: '100%',
          minWidth: 300,
          boxSizing: 'border-box',
          resize: 'horizontal',
          overflow: 'hidden',
          border: '1px solid #777',
        }}
      >
        <AtlasAuto
          key={String(webgl)}
          width="100%"
          height={540}
          containerProps={{ style: { position: 'relative' } }}
          renderPreset={presetOptions as any}
          unstable_webglRenderer={webgl}
          onCreated={(value) => {
            preset.current = value;
          }}
          htmlChildren={
            <ComparisonDivider
              comparison={comparison}
              aria-label="Compare before and after"
              style={{ '--atlas-divider-color': '#fff' } as React.CSSProperties}
            />
          }
        >
          <Comparison
            ref={setComparison}
            first={{ zoneId: swapped ? 'after' : 'before' }}
            second={{ zoneId: swapped ? 'before' : 'after' }}
            enabled={enabled}
            {...(controlled ? { split, onSplitChange: setSplit } : { defaultSplit: { angle: 0, position: 0.5 } })}
          />
          {(['first', 'second'] as const).map((side, index) => (
            <zone key={side} id={index ? 'after' : 'before'} x={0} y={0} width={1000} height={600}>
              {tiled ? (
                <ImageService id={iiif[index]} width={1000} height={600}>
                  <box
                    target={{ x: index ? 650 : 250, y: 250, width: 90, height: 90 }}
                    style={{ backgroundColor: index ? '#b34c31' : '#29634b' }}
                    onClick={() => increment(side)}
                  />
                  <HTMLPortal interactive target={{ x: index ? 650 : 150, y: 420, width: 230, height: 60 }}>
                    <button onClick={() => increment(side)}>{side} HTML button</button>
                  </HTMLPortal>
                </ImageService>
              ) : (
                <world-object id={side} width={1000} height={600}>
                  <world-image
                    uri={index ? afterImage : beforeImage}
                    target={{ x: 0, y: 0, width: 1000, height: 600 }}
                    display={{ width: 1000, height: 600 }}
                  />
                  <box
                    target={{ x: index ? 650 : 250, y: 250, width: 90, height: 90 }}
                    style={{ backgroundColor: index ? '#b34c31' : '#29634b' }}
                    onClick={() => increment(side)}
                  />
                  <HTMLPortal interactive target={{ x: index ? 650 : 150, y: 420, width: 230, height: 60 }}>
                    <button onClick={() => increment(side)}>{side} HTML button</button>
                  </HTMLPortal>
                </world-object>
              )}
            </zone>
          ))}
          <world-object id="shared" width={1000} height={600}>
            <HTMLPortal interactive target={{ x: 350, y: 535, width: 300, height: 45 }}>
              <span style={{ background: 'white', padding: 4 }}>Shared overlay</span>
            </HTMLPortal>
          </world-object>
        </AtlasAuto>
      </div>
      <p aria-live="polite">
        First clicks: {clicks.first}. Second clicks: {clicks.second}. Only visible markers and HTML buttons should
        respond.
      </p>
    </div>
  );
}
export const Uncontrolled = () => <Example />;
export const Controlled = () => <Example controlled />;
export const TiledZones = () => <Example tiled />;

export function Standalone() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current) return;
    const world = new World(1000, 600);
    const objects = [beforeImage, afterImage].map((uri, i) => {
      const object = new WorldObject();
      object.applyProps({ id: `resource-${i}`, width: 1000, height: 600 });
      const resource = new SingleImage();
      resource.applyProps({
        uri,
        target: { x: 0, y: 0, width: 1000, height: 600 },
        display: { width: 1000, height: 600 },
      });
      object.appendChild(resource);
      world.appendChild(object);
      return object;
    });
    const viewer = atlas(container.current, { world });
    const comparison = createComparison(viewer.runtime, {
      first: { objects: [objects[0]] },
      second: { objects: [objects[1]] },
      defaultSplit: { angle: 35, position: 0.5 },
    });
    const divider = createComparisonDivider(comparison, {
      container: container.current,
      label: 'Compare before and after',
    });
    divider.element.style.setProperty('--atlas-divider-color', '#fff');
    const commit = (event: Event) => {
      container.current?.setAttribute('data-last-split', JSON.stringify((event as CustomEvent).detail.split));
    };
    divider.element.addEventListener('comparisoncommit', commit);
    return () => {
      divider.element.removeEventListener('comparisoncommit', commit);
      divider.destroy();
      comparison.destroy();
      viewer.destroy();
    };
  }, []);
  return (
    <div style={{ padding: 20 }}>
      <h2>Standalone API</h2>
      <div ref={container} style={{ position: 'relative', width: '100%', height: 540 }} />
    </div>
  );
}
