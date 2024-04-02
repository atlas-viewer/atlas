import { ImageService } from '../src/modules/react-reconciler/components/ImageService';
import * as React from 'react';
import { Atlas } from '../src/modules/react-reconciler/Atlas';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Runtime } from '../src/renderer/runtime';
import '../src/modules/react-reconciler/types';

export default { title: 'Tests' };

export const EnsureMouseEventsAreAccurateWhenScrolling = () => {
  return (
    <div style={{ marginTop: '50vh', height: '200vh' }}>
      <Atlas width={500} height={500}>
        <ImageService
          id="https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f/info.json"
          width={4093}
          height={2743}
        />
      </Atlas>
    </div>
  );
};

const onPointerDown = () => {
  console.log('times');
};

export const OneEventPerClick = () => {
  return (
    <React.StrictMode>
      <Atlas width={500} height={500}>
        <world-object width={4093} height={2743} onPointerDown={onPointerDown}>
          <ImageService
            id="https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f/info.json"
            width={4093}
            height={2743}
          />
        </world-object>
      </Atlas>
    </React.StrictMode>
  );
};

// Needs to be done manually until: https://github.com/pmndrs/react-use-measure/issues/9
export const EnsureMouseEventsAreAccurateWhenBoxChanges = () => {
  const ref = useRef<Runtime>(null);
  const [selected, setSelected] = useState(false);

  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.triggerResize();
    }
  }, [selected]);

  return (
    <>
      <button
        onClick={() => {
          setSelected((s) => !s);
        }}
      >
        change size
      </button>
      <div style={{ height: selected ? 300 : 0 }} />
      <Atlas
        onCreated={(r) => {
          (ref as any).current = r.runtime;
        }}
        width={500}
        height={500}
      >
        <ImageService
          id="https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f/info.json"
          width={4093}
          height={2743}
        />
      </Atlas>
    </>
  );
};

export const EnsureWorldItemCountMatches = () => {
  const rt = useRef<Runtime>();
  const [boxes, setBoxes] = useState<Array<{ x: number; y: number; width: number; height: number }>>([
    {
      x: 10,
      y: 10,
      width: 100,
      height: 100,
    },
  ]);

  useEffect(() => {
    const t = setInterval(() => {
      console.log(rt.current!.world.getObjects());
    }, 1000);
    return () => {
      clearInterval(t);
    };
  }, []);

  return (
    <>
      <button
        onClick={() => {
          setBoxes((bs) => [
            ...bs,
            {
              x: (bs.length + 1) * 10,
              y: (bs.length + 1) * 10,
              width: 100,
              height: 100,
            },
          ]);
        }}
      >
        Add
      </button>
      <button
        onClick={() => {
          setBoxes((bs) => bs.slice(0, -1));
        }}
      >
        Remove
      </button>
      <Atlas
        height={500}
        width={500}
        onCreated={(r) => {
          rt.current = r.runtime;
        }}
      >
        {boxes.map((box) => {
          return (
            <world-object width={500} height={500}>
              <box target={box} style={{ background: 'rgba(255, 255, 0, .3)' }} />
            </world-object>
          );
        })}
      </Atlas>
    </>
  );
};

export const zoomDebug = () => {
  const [rt, setRt] = useState<Runtime>();
  const [zoom, setZoom] = useState(1);

  useLayoutEffect(() => {
    if (rt) {
      return rt.registerHook('useFrame', () => {
        setZoom(rt.getScaleFactor());
      });
    }
    return () => {};
  }, [rt]);

  const goHome = () => {
    if (rt) {
      rt.world.goHome();
    }
  };
  const zoomBy = (factor: number) => {
    if (rt) {
      rt.transitionManager.zoomTo(factor);
    }
  };

  const goTo = (data: { x: number; y: number; width: number; height: number }) => {
    if (rt) {
      rt.transitionManager.goToRegion(data);
    }
  };

  const regions = {
    a: { width: 200, height: 200, x: 100, y: 100 },
    b: { width: 200, height: 200, x: 600, y: 400 },
    c: { width: 200, height: 200, x: 200, y: 800 },
  };

  return (
    <div>
      <button onClick={() => goHome()}>Home</button>
      <button onClick={() => zoomBy(1 / 1.5)}>Zoom in</button>
      <button onClick={() => zoomBy(1.3)}>Zoom out</button>
      <button onClick={() => goTo(regions.a)}>Go A</button>
      <button onClick={() => goTo(regions.b)}>Go B</button>
      <button onClick={() => goTo(regions.c)}>Go C</button>
      <div>Zoom: {zoom}</div>
      <Atlas
        width={800}
        height={500}
        onCreated={(r) => {
          setRt(r.runtime);
        }}
      >
        <ImageService
          id="https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f/info.json"
          width={4093}
          height={2743}
        />
      </Atlas>
    </div>
  );
};

const preset = ['static-preset', { interactive: true }];

export function testStaticRender() {
  const [rt, setRt] = useState<Runtime>();
  const [staticPreset, setStaticPreset] = useState(false);
  const tile = {
    id: 'https://iiif.ghentcdh.ugent.be/iiif/images/getuigenissen:brugse_vrije:RABrugge_I15_16999_V02:RABrugge_I15_16999_V02_01/info.json',
    width: 2677,
    height: 4117,
  };
  return (
    <>
      <button onClick={() => setStaticPreset((r) => !r)}>
        {staticPreset ? 'Change to canvas' : 'Change to static'}
      </button>
      <Atlas
        key={staticPreset ? 'a' : 'b'}
        width={2677}
        height={4117}
        onCreated={(r) => {
          setRt(r.runtime);
        }}
        renderPreset={staticPreset ? preset : undefined}
        containerStyle={{ '--atlas-background': 'red' }}
      >
        <ImageService
          id={tile.id}
          width={tile.width}
          height={tile.height}
          enableSizes={false}
          enableThumbnail={false}
        />
      </Atlas>
    </>
  );
}
