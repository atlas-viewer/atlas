import { AtlasAuto, ImageService, Preset, Presets } from '../src/index';
import * as React from 'react';
import { ReactNode, useMemo, useRef, useState } from 'react';
//@ts-ignore
import img from './assets/img.png';
export default { title: 'Rotation' };

const tile = {
  id: 'https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f/info.json',
  width: 4093,
  height: 2743,
};

function Container(props: { children: ReactNode; style?: any }) {
  return (
    <>
      <style>{`
        .my-atlas {
          --atlas-background: #fff; 
          --atlas-focus: 5px solid green;
        }
      `}</style>
      <div className="my-atlas" style={{ height: '100vh', width: '100%', background: 'red', ...(props.style || {}) }}>
        {props.children as any}
      </div>
      <style>{`body[style]{padding: 0 !important}`}</style>
    </>
  );
}

function Slider({ control, label, ...props }: any) {
  const [state, setState] = control;
  return (
    <div style={{ display: 'flex' }}>
      <strong>{label}</strong>
      <input
        type="range"
        min={0}
        max={359}
        value={state}
        onChange={(e) => setState(e.target.valueAsNumber)}
        {...props}
      />
      {state}
    </div>
  );
}

const preset = ['default-preset', { canvasBox: true }] as Presets;

export const CropRotateStaticImageInteractive = () => {
  const rotation = useState(45);
  const x = useState(200);
  const y = useState(0);
  const scale = useState(200);
  const ref = useRef<Preset>();

  return (
    <>
      <Slider control={rotation} label="rotation" />
      <Slider control={x} label="x" />
      <Slider control={y} label="y" />
      <Slider control={scale} min={100} step={10} max={400} label="scale (force re-render)" />
      <button
        onClick={() => {
          ref.current?.runtime.world.recalculateWorldSize();
        }}
      >
        render
      </button>
      <Container style={{ height: 400, width: 600 }}>
        <AtlasAuto
          renderPreset={preset}
          onCreated={(e) => {
            ref.current = e;
          }}
        >
          <world>
            <world-object
              key={scale}
              height={450}
              width={600}
              x={0}
              y={0}
              scale={scale[0] / 100}
              rotation={rotation[0]}
            >
              <world-image
                uri={img}
                target={{ width: 600, height: 900, x: 0, y: 0 }}
                display={{ width: 6 * scale[0], height: 9 * scale[0] }}
                crop={{ x: x[0], y: y[0], width: 600, height: 450 }}
              />
              <box style={{ border: '2px solid red' }} target={{ width: 600 - 4, height: 450 - 4, x: 0, y: 0 }} />
            </world-object>
          </world>
        </AtlasAuto>
      </Container>
    </>
  );
};

export const CropStatic = () => (
  <Container style={{ height: 400, width: 600 }}>
    <AtlasAuto renderPreset={preset}>
      <world>
        <world-object height={300} width={300} x={0} y={0} scale={1}>
          <world-image
            uri={img}
            target={{ width: 600, height: 900, x: 0, y: 0 }}
            display={{ width: 600, height: 900, rotation: 0 }}
            crop={{ x: 100, y: 10, width: 300, height: 300 }}
          />
          <box style={{ border: '2px solid red' }} target={{ width: 296, height: 296, x: 0, y: 0 }} />
        </world-object>
      </world>
    </AtlasAuto>
  </Container>
);
export const CropRotateStaticWorldObject = () => (
  <Container style={{ height: 400, width: 600 }}>
    <AtlasAuto renderPreset={preset}>
      <world>
        <world-object height={300} width={300} x={0} y={0} scale={1} rotation={90}>
          <world-image
            uri={img}
            target={{ width: 600, height: 900, x: 0, y: 0 }}
            display={{ width: 600, height: 900, rotation: 0 }}
            crop={{ x: 100, y: 10, width: 300, height: 300 }}
          />
          <box style={{ border: '2px solid red' }} target={{ width: 296, height: 296, x: 0, y: 0 }} />
        </world-object>
      </world>
    </AtlasAuto>
  </Container>
);

export const CropRotateStaticWorldObject2 = () => (
  <Container style={{ height: 400, width: 600 }}>
    <AtlasAuto renderPreset={preset}>
      <world>
        <world-object height={300} width={300} x={0} y={0} scale={1} rotation={45}>
          <world-image
            uri={img}
            target={{ width: 600, height: 900, x: 0, y: 0 }}
            display={{ width: 600, height: 900, rotation: 0 }}
            crop={{ x: 100, y: 10, width: 300, height: 300 }}
          />
          <box style={{ border: '2px solid red' }} target={{ width: 296, height: 296, x: 0, y: 0 }} />
        </world-object>
      </world>
    </AtlasAuto>
  </Container>
);

export const CropTiledImage = () => {
  return (
    <Container style={{ height: 400, width: 600 }}>
      <AtlasAuto renderPreset={preset}>
        <world>
          <world-object height={tile.height / 2} width={tile.width / 2} x={0} y={0} scale={1}>
            <ImageService
              key="wunder"
              {...tile}
              crop={{ x: 0, y: 0, width: tile.width / 2, height: tile.height / 2 }}
            />
            <box
              style={{ border: '20px solid red' }}
              target={{ width: tile.width / 2 - 40, height: tile.height / 2 - 40, x: 0, y: 0 }}
            />
          </world-object>
        </world>
      </AtlasAuto>
    </Container>
  );
};
