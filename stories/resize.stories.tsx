import * as React from 'react';
import { AtlasAuto } from '../src/modules/react-reconciler/components/AtlasAuto';
import '../src/modules/react-reconciler/types';
import { useState } from 'react';
import { ImageService } from '../src/modules/react-reconciler/components/ImageService';

export default { title: 'Resize layouts' };

const widths = [100, 500, 800];
const heights = [500, 600, 800];

export const ResizeAll: React.FC = () => {
  const [widthIdx, setWidth] = useState(2);

  return (
    <>
      <style>{`
        .container {
          display: flex;
          flex: 1 1 0px;
          min-width: 0px;
          flex-direction: column;
          --atlas-container-flex: 1 1 0px;
        }
      `}</style>
      <div style={{ display: 'flex', height: '100vh', width: 'calc(100vw - 32px)' }}>
        <div style={{ width: widths[widthIdx] / 2, maxWidth: '20%', flexShrink: 0 }}>
          Left bar
          <button onClick={() => setWidth((n) => (n + 1) % widths.length)}>resize {widths[widthIdx]}px</button>
        </div>
        <div style={{ display: 'flex', flex: '1 1 0px', minWidth: 0 }}>
          <div className="container">
            <AtlasAuto unstable_webglRenderer height={heights[widthIdx]} containerProps={{ style: { minWidth: 0, overflow: 'hidden' } }}>
              <world width={5233} height={7200}>
                <worldObject id="1" height={7200} width={5233}>
                  <ImageService
                    id="https://iiif.princeton.edu/iiif/2/pudl0001/4609321/s42/00000001/info.json"
                    width={5233}
                    height={7200}
                  />
                </worldObject>
              </world>
            </AtlasAuto>
          </div>
          <div style={{ width: widths[widthIdx], maxWidth: '30%', flexShrink: 0 }}>Sidebar</div>
        </div>
      </div>
    </>
  );
};
