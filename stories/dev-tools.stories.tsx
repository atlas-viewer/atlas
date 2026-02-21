import * as React from 'react';
import { Atlas } from '../src/modules/react-reconciler/Atlas';
import { DevTools } from '../src/modules/react-reconciler/components/DevTools';
import { ImageService } from '../src/modules/react-reconciler/components/ImageService';
import '../src/modules/react-reconciler/types';

export default { title: 'DevTools' };

const tile = {
  id: 'https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f/info.json',
  width: 4093,
  height: 2743,
};

export const ManualDevTools = () => {
  return (
    <Atlas width={700} height={420}>
      <ImageService id={tile.id} width={tile.width} height={tile.height} />
      <DevTools initialOpen />
    </Atlas>
  );
};

export const AtlasPropDevTools = () => {
  return (
    <Atlas width={700} height={420} devTools={{ initialOpen: true }}>
      <ImageService id={tile.id} width={tile.width} height={tile.height} />
    </Atlas>
  );
};

export const MultiAtlasSelector = () => {
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <Atlas width={500} height={280} devTools={{ initialOpen: true }}>
        <ImageService id={tile.id} width={tile.width} height={tile.height} />
      </Atlas>
      <Atlas width={500} height={280}>
        <world-object id="second-world" width={1500} height={900}>
          <box target={{ x: 100, y: 120, width: 600, height: 300 }} style={{ backgroundColor: 'rgba(0, 180, 255, .35)' }} />
          <box target={{ x: 860, y: 300, width: 360, height: 220 }} style={{ backgroundColor: 'rgba(255, 80, 0, .35)' }} />
        </world-object>
      </Atlas>
    </div>
  );
};

export const CompositeDiagnostics = () => {
  return (
    <Atlas width={700} height={420} devTools={{ initialOpen: true }}>
      <ImageService
        id={tile.id}
        width={tile.width}
        height={tile.height}
        renderOptions={{
          renderLayers: 2,
          renderSmallestFallback: true,
          quality: 1.5,
          minSize: 255,
          maxImageSize: 2048,
        }}
      />
    </Atlas>
  );
};
