import * as React from 'react';
import { useMemo, useRef, useState } from 'react';
import '../src/modules/react-reconciler/types';
import { DrawBox } from '../src/modules/react-reconciler/components/BoxDraw';
import { RegionHighlight } from '../src/modules/react-reconciler/components/RegionHighlight';
import { useControlledAnnotationList } from '../src/modules/react-reconciler/hooks/use-controlled-annotation-list';
import { AtlasAuto } from '../src/modules/react-reconciler/components/AtlasAuto';
import { Runtime } from '../src/renderer/runtime';
import { ImageService } from '../src/modules/react-reconciler/components/ImageService';

export default { title: 'Annotations' };

const staticTiles = [
  {
    id: 'https://dlcs.io/iiif-img/4/21/quilt/info.json',
    width: 13038,
    height: 12916,
  },
  {
    id: 'https://iiif.princeton.edu/loris/pudl0001%2F4609321%2Fs42%2F00000001.jp2/info.json',
    width: 5233,
    height: 7200,
  },
  {
    id: 'https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f/info.json',
    width: 4093,
    height: 2743,
  },
  {
    id: 'https://iiif.ghentcdh.ugent.be/iiif/images/getuigenissen:brugse_vrije:RABrugge_I15_16999_V02:RABrugge_I15_16999_V02_01/info.json',
    width: 2677,
    height: 4117,
  },
  // {
  //   id: 'https://www.omeka.ugent.be/libraries.lw21/iiif-img/2/236',
  //   height: 1843,
  //   width: 1666,
  // },
];

const sizes = [
  { width: 800, height: 600 },
  { width: 400, height: 600 },
  { width: 800, height: 300 },
  { width: 900, height: 600 },
  { width: 1000, height: 600 },
  { width: '100%', height: '100vh' },
];

export const SelectionDemo = () => {
  const runtime = useRef<Runtime>();

  const {
    isEditing,
    onDeselect,
    selectedAnnotation,
    onCreateNewAnnotation,
    annotations,
    onUpdateAnnotation,
    setIsEditing,
    setSelectedAnnotation,
    editAnnotation,
    addNewAnnotation,
  } = useControlledAnnotationList([
    {
      id: 'annotation-1',
      height: 100,
      width: 100,
      x: 500,
      y: 500,
    },
    {
      id: 'annotation-2',
      height: 100,
      width: 100,
      x: 700,
      y: 700,
    },
    {
      id: 'annotation-3',
      height: 100,
      width: 220,
      x: 900,
      y: 900,
    },
  ]);
  const [tileIndex, setTileIndex] = useState(1);
  const [isWebGL, setIsWebGL] = useState(false);
  const [size, setSize] = useState<any>({ width: 800, height: 600, idx: 0 });
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(100);

  const [renderPreset, setRenderPreset] = useState<any>(['default-preset', { runtimeOptions: { maxOverZoom: 5 } }]);

  const goTo = (data: any) => {
    if (runtime.current) {
      runtime.current.world.gotoRegion(data);
    }
  };

  const goHome = () => {
    if (runtime.current) {
      runtime.current.world.goHome();
    }
  };

  const zoomIn = () => {
    if (runtime.current) {
      runtime.current.world.zoomIn();
    }
  };

  const zoomOut = () => {
    if (runtime.current) {
      runtime.current.world.zoomOut();
    }
  };

  return (
    <>
      <div style={{ height: '200vh' }}>
        <div style={{ display: 'block', height: 400 }}></div>
        <div>
          <h3>Viewer</h3>
          <p>isEditing: {isEditing ? 'true' : 'false'}</p>
          <button
            onClick={() => {
              const idx = (size.idx + 1) % sizes.length;
              const newSize = sizes[idx];
              setSize({ width: newSize.width, height: newSize.height, idx });
            }}
          >
            Change size
          </button>
          <button onClick={() => setIsWebGL((e) => !e)}>
            Change renderer (current: {isWebGL ? 'WebGL' : 'canvas'})
          </button>
          <button onClick={() => setTileIndex((i) => (i + 1) % staticTiles.length)}>Change image</button>|
          <button onClick={() => setRenderPreset(['default-preset', { canvasBox: true }])}>Default preset</button>
          <button onClick={() => setRenderPreset(['static-preset', {}])}>Static preset</button>
          <input
            type="range"
            min={0}
            max={359}
            value={rotation}
            onChange={(e) => setRotation(e.target.valueAsNumber)}
          />
          <input
            type="range"
            min={50}
            max={500}
            value={scale}
            onChange={(e) => {
              // runtime.current?.setOptions({ maxOverZoom: e.target.valueAsNumber / 100 });
              setScale(e.target.valueAsNumber);
            }}
          />
          <div style={{ display: 'flex' }}>
            <div style={{ flex: '1 1 0px' }}>
              <AtlasAuto
                unstable_webglRenderer={isWebGL && tileIndex !== 0}
                key={isWebGL ? 'webgl' : 'canvas'}
                onCreated={(rt) => {
                  runtime.current = rt.runtime;
                }}
                runtimeOptions={{ maxOverZoom: scale / 100 }}
                mode={isEditing ? 'sketch' : 'explore'}
                renderPreset={renderPreset}
                width={size.width}
                height={size.height}
                enableNavigator
              >
                <world onClick={onDeselect}>
                  <ImageService key={`tile-${tileIndex}`} {...staticTiles[tileIndex]} rotation={rotation} />
                  {isEditing && !selectedAnnotation ? <DrawBox onCreate={onCreateNewAnnotation} /> : null}
                  <world-object height={351} width={516} x={500} y={1000}>
                    <shape
                      id="a-box"
                      style={{
                        backgroundColor: 'rgba(255, 0, 0, .6)',
                        ':hover': {
                          backgroundColor: 'rgba(20, 50, 200, .7)',
                        },
                      }}
                      target={{ x: 0, y: 0, width: 516, height: 351 }}
                      points={[
                        [260, 0],
                        [516, 351],
                        [0, 351],
                        [260, 0],
                      ]}
                    />
                  </world-object>
                  {annotations.map((annotation, k) => (
                    <RegionHighlight
                      key={annotation.id}
                      rotation={k === 2 ? 45 : 0}
                      region={annotation}
                      disableCardinalControls={k === 1}
                      maintainAspectRatio={k === 2}
                      isEditing={selectedAnnotation === annotation.id}
                      onSave={onUpdateAnnotation}
                      onClick={(anno) => {
                        console.log('click annotation');
                        setIsEditing(true);
                        setSelectedAnnotation(anno.id);
                      }}
                      style={{
                        backgroundColor:
                          selectedAnnotation === annotation.id ? 'rgba(0, 150, 30, 0.6)' : 'rgba(255, 0, 0, .6)',
                        ':hover': {
                          backgroundColor:
                            selectedAnnotation === annotation.id ? 'rgba(0, 150, 30, 0.6)' : 'rgba(20, 50, 200, .7)',
                        },
                      }}
                    />
                  ))}
                </world>
              </AtlasAuto>
            </div>
            <div style={{ width: 300 }}>
              <button onClick={goHome}>Go home</button>
              <button onClick={zoomIn}>Zoom in</button>
              <button onClick={zoomOut}>Zoom out</button>
              {annotations.map((annotation) => (
                <div key={annotation.id}>
                  {annotation.id} <button onClick={() => editAnnotation(annotation.id)}>edit</button>{' '}
                  <button onClick={() => goTo(annotation)}>go to</button>
                </div>
              ))}
              <button onClick={addNewAnnotation}>Add new</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export const mobileSize = () => {
  return (
    <>
      <style>{`
        .my-atlas {
          --atlas-background: #fff; 
          --atlas-focus: 5px solid green;
        }
      `}</style>
      <div className="my-atlas" style={{ height: '100vh', width: '100%', background: 'red' }}>
        <AtlasAuto renderPreset={['default-preset', { canvasBox: true }]} height={'100vh'}>
          <world>
            <ImageService key="wunder" {...staticTiles[0]} />
          </world>
        </AtlasAuto>
      </div>
      <style>{`body[style]{padding: 0 !important}`}</style>
    </>
  );
};

export const flexbox = () => {
  return (
    <>
      <style>{`
        .atlas-flex {
          height: 100vh;
          box-sizing: border-box;
          padding: 1em;
          display: flex;
          flex-direction: column;
          
          --atlas-background: #f0f0f0;
          --atlas-focus: 5px solid green;
          --atlas-container-flex: 1 1 0px;
        }
      `}</style>
      <div className="atlas-flex">
        <AtlasAuto renderPreset={['default-preset', { canvasBox: true }]}>
          <world>
            <ImageService key="wunder" {...staticTiles[1]} />
          </world>
        </AtlasAuto>
      </div>
      <style>{`body[style]{padding: 0 !important}`}</style>
    </>
  );
};
