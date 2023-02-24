import * as React from 'react';
import '../src/modules/react-reconciler/types';
import { Atlas } from '../src/modules/react-reconciler/Atlas';
import { useCallback, useRef, useState } from 'react';
import { UpdateTextureFunction } from '../src/spacial-content/image-texture';
// @ts-ignore
import img from './assets/img.png';

import { AtlasAuto } from '../src/modules/react-reconciler/components/AtlasAuto';

export default { title: 'Atlas demos' };

export const Default = () => (
  <>
    <h1>Atlas</h1>
    <p>A thing.</p>
    <Atlas width={600} height={400}>
      <world-object id="1" height={900} width={600} x={300} y={300} scale={1}>
        <world-image
          uri={img}
          target={{ width: 600, height: 900, x: 0, y: 0 }}
          display={{ width: 1200, height: 1800 }}
        />
      </world-object>

      <world-object id="2" height={900} width={600} x={1200} y={300} scale={3}>
        <world-image
          uri={img}
          target={{ width: 600, height: 900, x: 0, y: 0 }}
          display={{ width: 1200, height: 1800 }}
        />
      </world-object>

      <world-object id="3" height={500} width={500} x={3300} y={300} scale={3}>
        <world-image
          uri={img}
          target={{ width: 1200, height: 1800, x: -200, y: -100 }}
          display={{ width: 1200, height: 1800 }}
        />
      </world-object>
    </Atlas>
  </>
);

export const AllEvents = () => {
  const handler = (callee: string) => (e: any) => console.log(callee, e.type, e.atlas);

  return (
    <>
      <h1>Atlas</h1>
      <p>A thing.</p>
      <Atlas width={600} height={400}>
        <worldObject id="1" height={1800} width={1200}>
          <worldImage
            // Verified
            onPointerMove={handler('onPointerMove')}
            onMouseMove={handler('onMouseMove')}
            onMouseEnter={handler('onMouseEnter')}
            onPointerEnter={handler('onPointerEnter')}
            onClick={handler('onClick')}
            onDragStart={handler('onDragStart')}
            onMouseDown={handler('onMouseDown')}
            onMouseLeave={handler('onMouseLeave')}
            onMouseUp={handler('onMouseUp')}
            onPointerDown={handler('onPointerDown')}
            onPointerLeave={handler('onPointerLeave')}
            onPointerUp={handler('onPointerUp')}
            onScroll={handler('onScroll')} // @todo possibly impossible.
            onWheel={handler('onWheel')}
            onTouchCancel={handler('onTouchCancel')}
            onTouchEnd={handler('onTouchEnd')}
            onTouchMove={handler('onTouchMove')}
            onTouchStart={handler('onTouchStart')}
            // => Some issues.
            onDrag={handler('onDrag')} // @todo some strange behaviour if the drag goes outside the bounds.
            onDragEnd={handler('onDragEnd')} // @todo does not end drag if not moused over
            onMouseOut={handler('onMouseOut')} // @todo this should be delivered to items CONTAINED
            onPointerOut={handler('onPointerOut')} // @todo this should be delivered to items CONTAINED
            onMouseOver={handler('onMouseOver')} // @todo this has slightly different behaviour (like out)
            onPointerOver={handler('onPointerOver')} // @todo this has slightly different behaviour (like out)
            onPointerCancel={handler('onPointerCancel')} // @todo unable to verify - should be working.
            // => Not yet implemented.
            // onDragEnter={handler('onDragEnter')} // @todo Fired when a dragged element enters a valid drop target.
            // onDragExit={handler('onDragExit')} // @todo Fired when a dragged element leaves a valid drop target.
            // onDragOver={handler('onDragOver')} // @todo Fired when dragging an element over a drop target. (move)

            uri="http://iiif.io/api/presentation/2.1/example/fixtures/resources/page1-full.png"
            target={{ width: 1200, height: 1800 }}
            display={{ width: 1200, height: 1800 }}
          />
        </worldObject>
      </Atlas>
    </>
  );
};

export const HTMLPerformance = () => {
  const [c, setC] = useState(false);
  const boxes = [];
  const number = 40;
  const size = 100;
  for (let i = 0; i < number; i++) {
    for (let j = 0; j < number; j++) {
      boxes.push(
        <worldObject key={`${i}--${j}`} id={`${i}-${j}`} width={size} height={size} x={i * size} y={j * size}>
          <box
            className={c ? undefined : (j + i) % 2 ? 'red' : 'blue'}
            target={{ x: 0, y: 0, width: size, height: size }}
            style={c ? { backgroundColor: (j + i) % 2 ? 'red' : 'blue' } : undefined}
          />
        </worldObject>
      );
    }
  }

  return (
    <>
      <button onClick={() => setC((t) => !t)}>current: {c ? 'canvas' : 'html'}</button>
      <Atlas
        width={400}
        height={400}
        key={c ? 'a' : 'b'}
        renderPreset={['default-preset', { canvasBox: c }]}
        onCreated={(rt) => rt.runtime?.world.gotoRegion({ x: 0, y: 0, width: 300, height: 300, immediate: true })}
      >
        {boxes}
      </Atlas>
      <style>
        {`
          .blue{background: blue}
          .red{background: red}
        `}
      </style>
    </>
  );
};

export const RawTexture = () => {
  const video = useRef<HTMLVideoElement>(null);

  const updateTexture: UpdateTextureFunction = useCallback(() => {
    if (video.current) {
      return { source: video.current, hash: video.current.currentTime };
    }
    return { source: undefined, hash: -1 };
  }, [video]);

  return (
    <>
      <Atlas width={1280} height={720} unstable_webglRenderer>
        <worldObject x={0} y={0} height={1080} width={1920}>
          <texture
            getTexture={updateTexture}
            target={{ x: 0, y: 0, height: 1080, width: 1920 }}
            display={{ height: 1080, width: 1920 }}
          />
        </worldObject>
      </Atlas>
      <video
        style={{ opacity: 0 }}
        width={200}
        ref={video}
        src="http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4"
        crossOrigin="anonymous"
      />
      <button onClick={() => video.current?.play()}>play</button>
    </>
  );
};
