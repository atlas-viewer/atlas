import React, { useRef, useState } from 'react';
import { AtlasAuto } from '../src/modules/react-reconciler/components/AtlasAuto';
import { ImageService } from '../src/modules/react-reconciler/components/ImageService';
import { MapAttribution } from '../src/modules/react-reconciler/components/MapAttribution';
import { TextLabel } from '../src/modules/react-reconciler/components/TextLabel';
import type { TextLabelProps } from '../src/modules/react-reconciler/components/TextLabel';
import { WarpedMapLayer } from '../src/modules/react-reconciler/components/WarpedMapLayer';
import type { WarpControlPoint, WarpTransformationType } from '../src/modules/maps/warped/types';
import type { Runtime } from '../src/renderer/runtime';
import annotation from './fixtures/allmaps-east-boston.json';

export default { title: 'Maps / Image overlays' };

const source = annotation.target.source;
const points: WarpControlPoint[] = annotation.body.features.map(({ properties, geometry }) => ({
  image: { x: properties.resourceCoords[0], y: properties.resourceCoords[1] },
  map: { lng: geometry.coordinates[0], lat: geometry.coordinates[1] },
}));
// The polygon from the fixture's SvgSelector, in original image pixels.
const mask: [number, number][] = [
  [237, 275],
  [6752, 270],
  [6768, 4913],
  [231, 4916],
];

// Hand-drawn label regions in the original sheet's image coordinates.
const bostonLabels: Array<Pick<TextLabelProps, 'id' | 'text' | 'points' | 'open'>> = [
  {
    id: 'east-boston',
    text: 'East Boston',
    points: [
      [700, 1700],
      [2300, 1400],
      [3000, 2600],
      [1800, 3400],
      [700, 2800],
    ],
  },
  {
    id: 'winthrop',
    text: 'Winthrop',
    points: [
      [4350, 1200],
      [6200, 1250],
      [6200, 2700],
      [4700, 2950],
      [4250, 2200],
    ],
  },
  {
    id: 'harbor',
    text: 'Boston Harbor',
    points: [
      [3200, 3600],
      [5400, 3350],
      [6200, 4400],
      [3400, 4550],
    ],
  },
  {
    id: 'saratoga',
    text: 'Saratoga Street',
    open: true,
    points: [
      [1350, 2560],
      [2880, 1130],
    ],
  },
  {
    id: 'inlet',
    text: 'Belle Isle Inlet',
    open: true,
    points: [
      [3300, 1450],
      [4200, 2960],
    ],
  },
];

const WarpedMapExample = ({ labels = false }: { labels?: boolean }) => {
  const runtime = useRef<Runtime>();
  const [showLabels, setShowLabels] = useState(true);
  const [showAreas, setShowAreas] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [fontSize, setFontSize] = useState(22);
  const [lastLabel, setLastLabel] = useState('Hover or click a label.');
  const [opacity, setOpacity] = useState(0.5);
  const [type, setType] = useState<WarpTransformationType>('thinPlateSpline');
  const [clipped, setClipped] = useState(true);
  const [showPoints, setShowPoints] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <div>
      <p>East Boston: the original IIIF sheet stays flat. OpenStreetMap is warped to match it.</p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <button onClick={() => runtime.current?.goHome()}>Home</button>
        <button onClick={() => runtime.current?.world.zoomIn()}>Zoom in</button>
        <button onClick={() => runtime.current?.world.zoomOut()}>Zoom out</button>
        <label>
          Map opacity{' '}
          <input
            aria-label="Map opacity"
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={opacity}
            onChange={(event) => setOpacity(event.target.valueAsNumber)}
          />
        </label>
        <label>
          Transformation{' '}
          <select
            value={type}
            onChange={(event) => {
              setError(undefined);
              setType(event.target.value as WarpTransformationType);
            }}
          >
            <option value="affine">Affine</option>
            <option value="thinPlateSpline">Thin plate spline</option>
            <option value="projective">Projective</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={clipped} onChange={(event) => setClipped(event.target.checked)} /> Clip to map
          border
        </label>
        <label>
          <input type="checkbox" checked={showPoints} onChange={(event) => setShowPoints(event.target.checked)} />{' '}
          Control points
        </label>
      </div>
      {labels ? (
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
          <label>
            <input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Custom text
            labels
          </label>
          <label>
            <input type="checkbox" checked={showAreas} onChange={(e) => setShowAreas(e.target.checked)} /> Areas
          </label>
          <label>
            <input type="checkbox" checked={showLines} onChange={(e) => setShowLines(e.target.checked)} /> Lines
          </label>
          <label>
            Text size {fontSize}px{' '}
            <input
              aria-label="Text size"
              type="range"
              min="14"
              max="36"
              value={fontSize}
              onChange={(e) => setFontSize(e.target.valueAsNumber)}
            />
          </label>
          <span role="status">{lastLabel}</span>
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <AtlasAuto
        height={620}
        runtimeOptions={{ maxOverZoom: 8 }}
        onCreated={(ctx) => {
          runtime.current = ctx.runtime;
        }}
        containerProps={{ style: { position: 'relative' } }}
        htmlChildren={
          <MapAttribution
            items={[
              { text: '© OpenStreetMap contributors', href: 'https://www.openstreetmap.org/copyright' },
              { text: 'Map: Digital Commonwealth', href: 'https://www.digitalcommonwealth.org/' },
              { text: 'Georeferencing: Allmaps', href: annotation.id },
            ]}
          />
        }
      >
        <world>
          <world-object width={source.width} height={source.height}>
            <ImageService id={source.id} width={source.width} height={source.height} />
            <WarpedMapLayer
              imageWidth={source.width}
              imageHeight={source.height}
              controlPoints={points}
              transformationType={type}
              opacity={opacity}
              resourceMask={clipped ? mask : undefined}
              onError={(reason) => setError(reason.message)}
            />
            {labels && showLabels
              ? bostonLabels
                  .filter((label) => (label.open ? showLines : showAreas))
                  .map((label) => (
                    <TextLabel
                      key={label.id}
                      {...label}
                      maxWidth={230}
                      padding={6}
                      style={{
                        fontSize,
                        fontFamily: 'Georgia, serif',
                        fontWeight: 'bold',
                        color: label.open ? '#863526' : '#153b57',
                        haloColor: '#fffdf2',
                        haloWidth: 3,
                        ':hover': { color: '#a12360', haloColor: '#ffffff' },
                        ':active': { color: '#e15516' },
                      }}
                      onClick={() => setLastLabel(`Selected: ${label.text}`)}
                    />
                  ))
              : null}
            {showPoints
              ? points.map((point, index) => (
                  <box
                    key={index}
                    target={{ x: point.image.x - 20, y: point.image.y - 20, width: 40, height: 40 }}
                    style={{ backgroundColor: '#ef4444', border: '2px solid white' }}
                  />
                ))
              : null}
          </world-object>
        </world>
      </AtlasAuto>
    </div>
  );
};

export const OSMOverIIIF = () => <WarpedMapExample />;
export const OSMOverIIIFWithTextLabels = () => <WarpedMapExample labels />;
