import * as React from 'react';
import '../src/modules/react-reconciler/types';
import { Atlas } from '../src/modules/react-reconciler/Atlas';

export default { title: 'Atlas demos' };

export const Default = () => (
  <>
    <h1>Atlas</h1>
    <p>A thing.</p>
    <Atlas width={600} height={400}>
      <worldObject id="1" height={1800} width={1200}>
        <worldImage
          uri="http://iiif.io/api/presentation/2.1/example/fixtures/resources/page1-full.png"
          target={{ width: 1200, height: 1800 }}
          display={{ width: 1200, height: 1800 }}
        />
      </worldObject>
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
