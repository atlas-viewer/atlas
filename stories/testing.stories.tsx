import { AtlasAuto } from '../src/modules/react-reconciler/components/AtlasAuto';
import { ImageService } from '../src/modules/react-reconciler/components/ImageService';
import * as React from 'react';
import { Atlas } from '../src/modules/react-reconciler/Atlas';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Runtime } from '../src/renderer/runtime';
import '../src/modules/react-reconciler/types';
import { useAfterFrame } from '../src/modules/react-reconciler/hooks/use-after-frame';

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
          setSelected(s => !s);
        }}
      >
        change size
      </button>
      <div style={{ height: selected ? 300 : 0 }} />
      <Atlas
        onCreated={r => {
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
  const rt = useRef<Runtime | null>(null);
  const [boxes, setBoxes] = useState<Array<{ x: number; y: number; width: number; height: number }>>([
    {
      x: 10,
      y: 10,
      width: 100,
      height: 100,
    },
  ]);

  useEffect(() => {
    let t = setInterval(() => {
      console.log(rt.current.world.getObjects());
    }, 1000);
    return () => {
      clearInterval(t);
    };
  }, []);

  return (
    <>
      <button
        onClick={() => {
          setBoxes(bs => [
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
          setBoxes(bs => bs.slice(0, -1));
        }}
      >
        Remove
      </button>
      <Atlas
        height={500}
        width={500}
        onCreated={r => {
          rt.current = r.runtime;
        }}
      >
        {boxes.map(box => {
          return (
            <world-object width={500} height={500}>
              <box target={box} backgroundColor={'rgba(255, 255, 0, .3)'} />
            </world-object>
          );
        })}
      </Atlas>
    </>
  );
};
