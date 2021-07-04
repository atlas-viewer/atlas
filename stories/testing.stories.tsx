import { AtlasAuto } from '../src/modules/react-reconciler/components/AtlasAuto';
import { ImageService } from '../src/modules/react-reconciler/components/ImageService';
import * as React from 'react';
import { Atlas } from '../src/modules/react-reconciler/Atlas';

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
