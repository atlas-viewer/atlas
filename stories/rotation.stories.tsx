import { AtlasAuto, ImageService, Preset, Presets, useAfterFrame, useFrame } from '../src/index';
import * as React from 'react';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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
  const rotation = useState(5);
  const x = useState(120);
  const tx = useState(123);
  const utx = useState(0);
  const y = useState(0);
  const scale = [200];
  const ref = useRef<Preset>();
  const [rt, setRt] = useState<Preset>();
  const debug = useRef<HTMLDivElement>(null);

  const scaleFactor = scale[0] / 100;

  return (
    <>
      <Slider control={rotation} label="rotation" />
      <Slider control={x} label="x" />
      <Slider control={tx} label="tx" />
      <Slider control={utx} label="Unsupported translation" />
      <Slider control={y} label="y" />
      <button
        onClick={() => {
          ref.current?.runtime.world.recalculateWorldSize();
        }}
      >
        render
      </button>
      <div ref={debug}>debug</div>
      <Container style={{ height: 512, width: 512 }}>
        <AtlasAuto
          renderPreset={preset}
          onCreated={(e) => {
            ref.current = e;
            setRt(e);
          }}
        >
          <world>
            <world-object key={scale.join()} height={450} width={300} x={tx[0]} y={0} rotation={rotation[0]}>
              <world-image
                uri={img}
                target={{ width: 600, height: 900, x: utx[0], y: 0 }}
                display={{ width: 600, height: 900, x: 0, y: 0 }}
                crop={{
                  x: x[0],
                  y: y[0],
                  width: 300,
                  height: 450,
                }}
              />
              <box style={{ border: '2px solid red' }} target={{ width: 300 - 4, height: 450 - 4, x: utx[0], y: 0 }} />
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

export const UnsupportedCropRotate = () => (
  <Container style={{ height: 400, width: 600 }}>
    <AtlasAuto renderPreset={preset}>
      <world>
        <world-object height={300} width={300} x={0} y={0} scale={1} rotation={180}>
          <world-image
            uri={img}
            target={{ width: 600, height: 900, x: 100, y: 0 }}
            display={{ width: 600, height: 900, rotation: 0 }}
            crop={{ x: 100, y: 10, width: 300, height: 300 }}
          />
          <box style={{ border: '2px solid red' }} target={{ width: 296, height: 296, x: 100, y: 0 }} />
        </world-object>
      </world>
    </AtlasAuto>
  </Container>
);

export const CropTiledImage = () => {
  const rotation = useState(180);
  const x = useState(256);
  const tx = useState(0);
  const y = useState(0);
  return (
    <div style={{ height: 700 }}>
      <Slider control={rotation} label="rotation" />
      <Slider control={x} label="x" max={1000} />
      <Slider control={tx} label="tx" max={1000} />
      <Slider control={y} label="y" max={1000} />
      <Container style={{ height: 400, width: 600 }}>
        <AtlasAuto renderPreset={preset}>
          <world>
            <world-object height={tile.height / 2} width={tile.width / 2 + 300}>
              <ImageService
                key="wunder"
                {...tile}
                crop={{ x: x[0], y: y[0], width: tile.width / 2, height: tile.height / 2 }}
                rotation={rotation[0]}
                x={tx[0]}
              />
              <box
                style={{ border: '2px solid red' }}
                target={{ width: tile.width / 2 - 4, height: tile.height / 2 - 4, x: 0, y: 0 }}
              />
            </world-object>
          </world>
        </AtlasAuto>
      </Container>
    </div>
  );
};

export const CropTiledImagePolygon = () => {
  const rotation = useState(180);
  const x = useState(256);
  const tx = useState(0);
  const y = useState(0);
  return (
    <div style={{ height: 700 }}>
      <Slider control={rotation} label="rotation" />
      <Slider control={x} label="x" max={1000} />
      <Slider control={tx} label="tx" max={1000} />
      <Slider control={y} label="y" max={1000} />
      <Container style={{ height: 400, width: 600 }}>
        <AtlasAuto renderPreset={preset}>
          <world>
            <world-object height={tile.height / 2} width={tile.width / 2 + 300}>
              <ImageService
                key="wunder"
                {...tile}
                crop={{ x: x[0], y: y[0], width: tile.width / 2, height: tile.height / 2 }}
                rotation={rotation[0]}
                x={tx[0]}
              />
              <box
                style={{ border: '2px solid red' }}
                target={{ width: tile.width / 2 - 4, height: tile.height / 2 - 4, x: 0, y: 0 }}
              />
              <shape
                id="a-box"
                style={{
                  border: '2px solid blue',
                  backgroundColor: 'rgba(0, 24, 180, .1)',
                  ':hover': { backgroundColor: 'red' },
                }}
                relativeStyle
                target={{ x: 100, y: 200, width: 516, height: 351 }}
                points={[
                  [260, 0],
                  [516, 351],
                  [0, 351],
                  [260, 0],
                ]}
              />
            </world-object>
          </world>
        </AtlasAuto>
      </Container>
    </div>
  );
};
