import * as React from 'react';
import { AtlasAuto } from '../src/modules/react-reconciler/components/AtlasAuto';
import '../src/modules/react-reconciler/types';
import { useState } from 'react';
import { ImageService } from '../src/modules/react-reconciler/components/ImageService';

export default { title: 'Resize layouts' };

const widths = [800, 1400];
const heights = [800, 1400];

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
      <div style={{ display: 'flex', height: '100vh' }}>
        <div style={{ width: widths[widthIdx] / 2 }}>
          Left bar
          <button onClick={() => setWidth((n) => (n + 1) % widths.length)}>resize {widths[widthIdx]}px</button>
        </div>
        <div style={{ display: 'flex', flex: '1 1 0px', minWidth: 0 }}>
          <div className="container">
            <AtlasAuto renderPreset='static-preset' containerStyle={{ height: heights[widthIdx] }}>
              <world width={5233} height={7200}>
                <worldObject id="1" height={7200} width={5233}>
                  <ImageService
                    id="https://iiif.princeton.edu/loris/pudl0001%2F4609321%2Fs42%2F00000001.jp2/info.json"
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


export const Gines: React.FC = () => {
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
      <div style={{ display: 'flex', height: '100vh' }}>
        <div style={{ width: widths[widthIdx] }}>
          Left bar
          <button onClick={() => setWidth((n) => (n + 1) % widths.length)}>resize {widths[widthIdx]}px</button>
        </div>
        <div style={{ display: 'flex', flex: '1 1 0px', minWidth: 0 }}>
          <div className="container" style={{ '--atlas-background': 'red' }}>
            <AtlasAuto containerStyle={{ height: heights[widthIdx] }}>
              <world width={5233} height={7200}>
                <worldObject id="1" height={7200} width={5233}>
                  <ImageService
                    id="https://media.getty.edu/iiif/image/bb72d5f1-e230-4797-a7dc-262bf948b256"
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
