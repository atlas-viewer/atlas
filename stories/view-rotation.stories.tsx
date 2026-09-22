import React, { useMemo, useRef, useState } from 'react';
import { AtlasAuto, type Preset } from '../src/index';
// @ts-ignore
import image from './assets/img.png';

export default { title: 'View rotation' };
const renderPreset = ['default-preset', { canvasBox: true }] as const;

function RotationExample({ snap = 0 }: { snap?: number }) {
  const controllerConfig = useMemo(() => ({ enableTouchRotation: true, touchRotationSnap: snap }), [snap]);
  const preset = useRef<Preset>();
  const [angle, setAngle] = useState(0);
  const [pivot, setPivot] = useState('center');
  const [click, setClick] = useState('Click the colored squares to test hit detection.');
  const [revision, setRevision] = useState(0);
  const rotate = (degrees: number) => {
    const runtime = preset.current?.runtime;
    const bounds = runtime?.getRendererScreenPosition();
    if (!runtime || !bounds) return;
    const fraction = pivot === 'center' ? 0.5 : 0.25;
    runtime.transitionManager.stopTransition();
    runtime.rotateBy(degrees, runtime.viewerToWorld(bounds.width * fraction, bounds.height * fraction));
    setAngle(runtime.viewRotation);
  };
  return (
    <div style={{ padding: 16, maxWidth: 1000, margin: 'auto' }}>
      <h2>View rotation: pivot, bounds and touch</h2>
      <p>
        Pan with one finger or the mouse. Use two fingers to pan, pinch and rotate together.{' '}
        {snap ? `On release, rotation snaps to the nearest ${snap}°. ` : 'Rotation is free, with no snapping.'}
      </p>
      <label>
        Button pivot{' '}
        <select value={pivot} onChange={(event) => setPivot(event.target.value)}>
          <option value="center">Center</option>
          <option value="quarter">Upper-left quarter</option>
        </select>
      </label>{' '}
      <button onClick={() => rotate(-15)}>−15°</button> <button onClick={() => rotate(15)}>+15°</button>{' '}
      <button onClick={() => rotate(90)}>+90°</button>{' '}
      <button onClick={() => preset.current?.runtime.world.constraintBounds()}>Constrain bounds</button>{' '}
      <button onClick={() => preset.current?.runtime.world.goHome()}>Fit rotated scene</button>{' '}
      <button
        onClick={() => {
          const rt = preset.current?.runtime;
          if (rt) {
            rt.viewRotation = 0;
            rt.world.goHome();
          }
        }}
      >
        Reset
      </button>{' '}
      <button onClick={() => setRevision((value) => value + 1)}>Re-render scene ({revision})</button>
      <p>
        View angle: {angle.toFixed(1)}°. {click}
      </p>
      <div style={{ height: '60vh', minHeight: 300, position: 'relative', border: '1px solid #999' }}>
        <AtlasAuto
          renderPreset={renderPreset as any}
          controllerConfig={controllerConfig}
          runtimeOptions={{ visibilityRatio: 1 }}
          onCreated={(value) => {
            preset.current = value;
            value.runtime.registerHook('useAfterFrame', () => setAngle(value.runtime.viewRotation));
          }}
        >
          <world-object id="sheet" width={800} height={1200}>
            <world-image uri={image} target={{ width: 800, height: 1200 }} display={{ width: 1200, height: 1800 }} />
            <box
              target={{ x: 50, y: 50, width: 120, height: 120 }}
              style={{ backgroundColor: '#d22' }}
              onClick={() => setClick('Red square clicked')}
            />
            <box
              target={{ x: 630, y: 1030, width: 120, height: 120 }}
              style={{ backgroundColor: '#26c' }}
              onClick={() => setClick('Blue square clicked')}
            />
            <box html target={{ x: 250, y: 530, width: 300, height: 140 }} style={{ border: '4px solid lime' }} />
          </world-object>
        </AtlasAuto>
        <div
          aria-hidden
          style={{
            position: 'absolute',
            left: pivot === 'center' ? '50%' : '25%',
            top: pivot === 'center' ? '50%' : '25%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            color: '#f0f',
            fontSize: 28,
          }}
        >
          +
        </div>
      </div>
      <p>
        The source is 1200 × 1800, displayed at 800 × 1200 without stretching. Drag beyond an edge, release, then rotate
        and fit again. The green HTML border should stay aligned; re-rendering must preserve the view angle.
      </p>
    </div>
  );
}

export const PivotAndTouch = () => <RotationExample />;
export const SnapRightAngles = () => <RotationExample snap={90} />;
export const SnapEvery15Degrees = () => <RotationExample snap={15} />;
