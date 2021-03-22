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
      <button onClick={() => setWidth(n => (n + 1) % widths.length)}>resize {widths[widthIdx]}px</button>
      <div style={{ display: 'flex' }}>
        <div style={{ width: widths[widthIdx] / 2 }}>Left bar</div>
        <div style={{ display: 'flex', flex: '1 1 0px', minWidth: 0 }}>
          <div style={{ flex: '1 1 0px', minWidth: 0 }}>
            <AtlasAuto unstable_webglRenderer style={{ height: heights[widthIdx] }}>
              <world width={5233} height={7200}>
                <worldObject id="1" height={7200} width={5233}>
                  <ImageService
                    id="https://libimages1.princeton.edu/loris/pudl0001%2F4609321%2Fs42%2F00000001.jp2/info.json"
                    width={5233}
                    height={7200}
                  />
                </worldObject>
              </world>
            </AtlasAuto>
          </div>
          <div style={{ width: widths[widthIdx] }}>Sidebar</div>
        </div>
      </div>
    </>
  );
};
