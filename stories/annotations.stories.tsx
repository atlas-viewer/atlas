import React, { useEffect, useState } from 'react';
import '../src/modules/react-reconciler/types';
import { GetTile, getTileFromImageService } from '../src/modules/iiif/get-tiles';
import { TileSet } from '../src/modules/react-reconciler/components/TileSet';
import { DrawBox } from '../src/modules/react-reconciler/components/BoxDraw';
import { RegionHighlight } from '../src/modules/react-reconciler/components/RegionHighlight';
import { useControlledAnnotationList } from '../src/modules/react-reconciler/hooks/use-controlled-annotation-list';
import { AtlasAuto } from '../src/modules/react-reconciler/components/AtlasAuto';

export default { title: 'Annotations' }

const staticTiles = [
  {
    id: 'https://libimages1.princeton.edu/loris/pudl0001%2F4609321%2Fs42%2F00000001.jp2/info.json',
    width: 5233,
    height: 7200,
  },
  {
    id: 'https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f/info.json',
    width: 4093,
    height: 2743,
  },
];

const Wunder = () => {
  const [tiles, setTile] = useState<GetTile | undefined>();

  useEffect(() => {
    getTileFromImageService(staticTiles[1].id, staticTiles[1].width, staticTiles[1].height).then(s => {
      console.log(s)
      setTile(s);
    });
  }, []);

  if (!tiles) {
    return (
      <worldObject height={staticTiles[1].height} width={staticTiles[1].width}>
        <box
          target={{ x: 0, y: 0, width: staticTiles[1].width, height: staticTiles[1].height }}
          id="123"
          backgroundColor="#000"
        />
      </worldObject>
    );
  }

  return <TileSet tiles={tiles} x={0} y={0} width={staticTiles[1].width} height={staticTiles[1].height} />;
};

const sizes = [
  { width: 800, height: 600 },
  { width: 400, height: 300 },
  { width: 900, height: 600 },
  { width: 1000, height: 600 },
  { width: '100%', height: '100vh' },
];

export const SelectionDemo = () => {
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
  } = useControlledAnnotationList([
    {
      id: 'annotation-1',
      height: 100,
      width: 100,
      x: 500,
      y: 500,
    },
    {
      id: 'annotation-2',
      height: 100,
      width: 100,
      x: 700,
      y: 700,
    },
    {
      id: 'annotation-3',
      height: 100,
      width: 100,
      x: 900,
      y: 900,
    },
  ]);

  const [size, setSize] = useState<any>({ width: 800, height: 600, idx: 0 });

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
        <div style={{ display: 'flex' }}>
          <div style={{ flex: '1 1 0px' }}>
            <AtlasAuto mode={isEditing ? 'sketch' : 'explore'} style={{ width: size.width, height: size.height }}>
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
          <div style={{ width: 300 }}>
            {annotations.map(annotation => (
              <div key={annotation.id}>
                {annotation.id} <button onClick={() => editAnnotation(annotation.id)}>edit</button>
              </div>
            ))}
            <button onClick={addNewAnnotation}>Add new</button>
          </div>
        </div>
      </div>
    </div>
  );
};
