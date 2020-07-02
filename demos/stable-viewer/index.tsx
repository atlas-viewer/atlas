import React, { useEffect, useRef, useState } from 'react';
import { render } from 'react-dom';
import {
  Atlas,
  HTMLPortal,
  useBeforeFrame,
  useFrame,
  useMode,
  useRuntime,
} from '../../src/modules/react-reconciler/Atlas';
import { GetTile, getTileFromImageService } from '../../src/modules/iiif/get-tiles';
import { TiledImage } from '../../src/modules/react-reconciler/TiledImage';

function useController() {
  return {
    zoomTo() {
      // @todo implement.
    },
    panTo() {
      // @todo implement.
    },
    constrainBounds() {
      // @todo implement.
    },
    zoomIn() {
      // @todo implement.
    },
    zoomOut() {
      // @todo implement.
    },
    goHome() {
      // @todo implement.
    },
    // From OSD, possible
    fitHorizontally() {
      // @todo implement.
    },
    fitVertically() {
      // @todo implement.
    },
    fitTo() {
      // @todo implement.
    },
    panBy() {
      // @todo implement.
    },
    zoomBy() {
      // @todo implement.
    },
    setMargins() {
      // @todo implement.
    },
  };
}

const Wunder = () => {
  const [tile, setTile] = useState<GetTile | undefined>();

  useEffect(() => {
    getTileFromImageService('https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f/info.json', 4093, 2743).then(s => {
      setTile(s);
    });
  });

  if (!tile) {
    return (
      <worldObject height={2743} width={4093}>
        <box target={{ x: 0, y: 0, width: 4093, height: 2743 }} id="123" backgroundColor="#000" />
      </worldObject>
    );
  }

  return <TiledImage tile={tile} x={0} y={0} width={4093} height={2743} />;
};

// Static
// Explore
// Sketch
// Sketch-explore (space-bar)

const ChangeMode = () => {
  const [mode, changeMode] = useMode();
  return (
    <worldObject height={30} width={50} x={0} y={0}>
      <HTMLPortal interactive backgroundColor="blue">
        <div>
          <button onClick={() => changeMode('sketch')}>{mode.current}</button>
        </div>
      </HTMLPortal>
    </worldObject>
  );
};

const ResizableWorld = () => {
  const [size, setSize] = useState({ max: false, width: 500, height: 500 });

  const maximise = () => {
    setSize({ max: true, width: window.innerWidth, height: window.innerHeight });
  };

  const minimise = () => {
    setSize({ max: false, width: 500, height: 500 });
  };

  return (
    <div style={size.max ? { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } : { position: 'relative' }}>
      <Atlas width={size.width} height={size.height}>
        <world>
          <Wunder />
          {/*<ChangeMode />*/}
        </world>
      </Atlas>
      {size.max ? (
        <button style={{ position: 'absolute', zIndex: 10, left: 0, top: 0 }} onClick={minimise}>
          Minimise
        </button>
      ) : (
        <button style={{ position: 'absolute', zIndex: 10, left: 0, top: 0 }} onClick={maximise}>
          Maximise
        </button>
      )}
    </div>
  );
};

render(
  <div>
    <ResizableWorld />
  </div>,
  document.getElementById('root')
);
