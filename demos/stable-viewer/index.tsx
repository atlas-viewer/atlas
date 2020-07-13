import React, { useEffect, useState } from 'react';
import { render } from 'react-dom';
import { Atlas } from '../../src/modules/react-reconciler/Atlas';
import { GetTile, getTileFromImageService } from '../../src/modules/iiif/get-tiles';
import { TileSet } from '../../src/modules/react-reconciler/components/TileSet';
import { DrawBox } from '../../src/modules/react-reconciler/components/BoxDraw';
import { RegionHighlight } from '../../src/modules/react-reconciler/components/RegionHighlight';
import { useControlledAnnotationList } from '../../src/modules/react-reconciler/hooks/use-controlled-annotation-list';
import { AtlasAuto } from '../../src/modules/react-reconciler/components/AtlasAuto';

// function useController() {
//   return {
//     zoomTo() {
//       // @todo implement.
//     },
//     panTo() {
//       // @todo implement.
//     },
//     constrainBounds() {
//       // @todo implement.
//     },
//     zoomIn() {
//       // @todo implement.
//     },
//     zoomOut() {
//       // @todo implement.
//     },
//     goHome() {
//       // @todo implement.
//     },
//     // From OSD, possible
//     fitHorizontally() {
//       // @todo implement.
//     },
//     fitVertically() {
//       // @todo implement.
//     },
//     fitTo() {
//       // @todo implement.
//     },
//     panBy() {
//       // @todo implement.
//     },
//     zoomBy() {
//       // @todo implement.
//     },
//     setMargins() {
//       // @todo implement.
//     },
//   };
// }

const Wunder = () => {
  const [tiles, setTile] = useState<GetTile | undefined>();

  useEffect(() => {
    getTileFromImageService(
      'https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f/info.json',
      4093,
      2743
    ).then(s => {
      setTile(s);
    });
  }, []);

  if (!tiles) {
    return (
      <worldObject height={2743} width={4093}>
        <box target={{ x: 0, y: 0, width: 4093, height: 2743 }} id="123" backgroundColor="#000" />
      </worldObject>
    );
  }

  return <TileSet tiles={tiles} x={0} y={0} width={4093} height={2743} />;
};

const sizes = [
  { width: 800, height: 600 },
  { width: 400, height: 300 },
  { width: 900, height: 600 },
  { width: 1000, height: 600 },
];

const Demo = () => {
  const {
    isEditing,
    onDeselect,
    selectedAnnotation,
    onCreateNewAnnotation,
    annotations,
    onUpdateAnnotation,
    setIsEditing,
    setSelectedAnnotation,
    editAnnotation,
    addNewAnnotation,
  } = useControlledAnnotationList();

  const [size, setSize] = useState({ width: 800, height: 600, idx: 0 });

  return (
    <div>
      <div>
        <h3>Viewer</h3>
        <p>isEditing: {isEditing ? 'true' : 'false'}</p>
        <button
          onClick={() => {
            const idx = (size.idx + 1) % sizes.length;
            const newSize = sizes[idx];
            setSize({ width: newSize.width, height: newSize.height, idx });
          }}
        >
          Change size
        </button>
        <div>
          <AtlasAuto mode={isEditing ? 'sketch' : 'explore'} style={{ width: '100%', height: size.height }}>
            <world onClick={onDeselect}>
              <Wunder />
              {isEditing && !selectedAnnotation ? <DrawBox onCreate={onCreateNewAnnotation} /> : null}
              {annotations.map(annotation => (
                <RegionHighlight
                  key={annotation.id}
                  region={annotation}
                  isEditing={selectedAnnotation === annotation.id}
                  onSave={onUpdateAnnotation}
                  onClick={anno => {
                    setIsEditing(true);
                    setSelectedAnnotation(anno.id);
                  }}
                />
              ))}
            </world>
          </AtlasAuto>
        </div>
      </div>
      <div>
        {annotations.map(annotation => (
          <div key={annotation.id}>
            {annotation.id} <button onClick={() => editAnnotation(annotation.id)}>edit</button>
          </div>
        ))}
        <button onClick={addNewAnnotation}>Add new</button>
      </div>
    </div>
  );
};

render(
  <div>
    <Demo />
  </div>,
  document.getElementById('root')
);
