import React, { useEffect, useRef, useState } from 'react';
import { loadAllmaps, type LoadedAllmaps } from '../src/allmaps';
import { AtlasAuto } from '../src/modules/react-reconciler/components/AtlasAuto';
import { MapAttribution } from '../src/modules/react-reconciler/components/MapAttribution';
import { MapGeoJSON } from '../src/modules/react-reconciler/components/MapGeoJSON';
import { MapObject } from '../src/modules/react-reconciler/components/MapObject';
import { MapTileLayer } from '../src/modules/react-reconciler/components/MapTileLayer';
import { MapWarpedImage } from '../src/modules/react-reconciler/components/MapWarpedImage';
import type { Runtime } from '../src/renderer/runtime';

export default { title: 'Allmaps proof of concept' };

const EXAMPLES = {
  'East Boston (one map)': 'https://annotations.allmaps.org/maps/a9458d2f895dcdfb',
  'New York (two maps on one image)':
    'https://viewer.allmaps.org/?url=https://annotations.allmaps.org/images/d180902cb93d5bf2',
  'Ghent (unavailable IIIF example)': 'https://annotations.allmaps.org/manifests/8f9faeba73d67031',
};
const DEFAULT_URL = Object.values(EXAMPLES)[0];
export const LoadAllmapsURL: React.FC = () => {
  const [input, setInput] = useState(DEFAULT_URL);
  const [request, setRequest] = useState({ url: DEFAULT_URL, revision: 0 });
  const [loaded, setLoaded] = useState<LoadedAllmaps>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [opacity, setOpacity] = useState(0.75);
  const [showPoints, setShowPoints] = useState(false);
  const [showMasks, setShowMasks] = useState(true);
  const runtime = useRef<Runtime>();
  useEffect(() => {
    const abort = new AbortController();
    setLoading(true);
    setError(undefined);
    setLoaded(undefined);
    loadAllmaps(request.url, abort.signal)
      .then((result) => {
        if (!abort.signal.aborted) setLoaded(result);
      })
      .catch((reason) => {
        if (!abort.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (!abort.signal.aborted) setLoading(false);
      });
    return () => abort.abort();
  }, [request]);
  const load = (url: string) => {
    setInput(url);
    setRequest((previous) => ({ url, revision: previous.revision + 1 }));
  };
  return (
    <div style={{ font: '14px/1.5 system-ui, sans-serif', padding: 12 }}>
      <h2 style={{ marginTop: 0 }}>Allmaps → IIIF → Atlas on OpenStreetMap</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          load(input);
        }}
        style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}
      >
        <label htmlFor="allmaps-url">Allmaps URL</label>
        <input
          id="allmaps-url"
          type="url"
          required
          value={input}
          onChange={(event) => setInput(event.target.value)}
          style={{ flex: 1, minWidth: 280 }}
        />
        <button type="submit">Load map</button>
      </form>
      <p>
        Paste an annotation URL, an Allmaps Viewer/Editor share URL, or a IIIF resource with existing Allmaps
        annotations.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {Object.entries(EXAMPLES).map(([label, url]) => (
          <button key={url} onClick={() => load(url)}>
            {label}
          </button>
        ))}
      </div>
      {loading ? <p role="status">Loading annotations and IIIF tile metadata…</p> : null}
      {error ? (
        <pre role="alert" style={{ whiteSpace: 'pre-wrap', color: '#b91c1c' }}>
          {error}
        </pre>
      ) : null}
      {loaded ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <button onClick={() => runtime.current?.goHome()}>Fit maps</button>
            <button onClick={() => runtime.current?.world.zoomIn()}>Zoom in</button>
            <button onClick={() => runtime.current?.world.zoomOut()}>Zoom out</button>
            <label>
              Opacity {Math.round(opacity * 100)}%{' '}
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={opacity}
                onChange={(event) => setOpacity(event.target.valueAsNumber)}
              />
            </label>
            <label>
              <input type="checkbox" checked={showPoints} onChange={(event) => setShowPoints(event.target.checked)} />{' '}
              Control points
            </label>
            <label>
              <input type="checkbox" checked={showMasks} onChange={(event) => setShowMasks(event.target.checked)} />{' '}
              Mask outlines
            </label>
          </div>
          <AtlasAuto
            key={request.revision}
            height={560}
            containerProps={{ style: { position: 'relative' } }}
            runtimeOptions={{ maxOverZoom: 16 }}
            onCreated={(ctx) => {
              runtime.current = ctx.runtime;
            }}
            htmlChildren={
              <MapAttribution
                items={[
                  { text: '© OpenStreetMap contributors', href: 'https://www.openstreetmap.org/copyright' },
                  { text: 'Georeferencing: Allmaps', href: loaded.url },
                ]}
              />
            }
          >
            <world>
              <MapObject id="allmaps-poc" x={0} y={0} width={2400} height={loaded.frameHeight} bounds={loaded.bounds}>
                <MapTileLayer />
                {loaded.maps.map((map, index) => (
                  <MapWarpedImage
                    key={`${map.id}-${index}`}
                    id={`allmaps-sheet-${index}`}
                    service={map.service}
                    transformer={map.transformer}
                    resourceMask={map.mask.length ? map.mask : undefined}
                    opacity={opacity}
                    resolution={64}
                    renderOptions={{ renderLayers: 1, renderSmallestFallback: false }}
                    onError={(reason) => setError(reason.message)}
                  />
                ))}
                {showMasks ? (
                  <MapGeoJSON
                    data={loaded.outlines}
                    lineStyle={{ borderColor: '#0891b2', borderWidth: '2', borderStyle: 'solid' }}
                  />
                ) : null}
                {showPoints ? (
                  <MapGeoJSON
                    data={loaded.markers}
                    markerSize={10}
                    markerSizeUnit="screen"
                    markerStyle={{ backgroundColor: '#f59e0b', border: '2px solid white' }}
                  />
                ) : null}
              </MapObject>
            </world>
          </AtlasAuto>
          <p role="status">
            Loaded {loaded.maps.length} map(s), {new Set(loaded.maps.map((map) => map.service.id)).size} IIIF
            service(s).{' '}
            <a href={loaded.url} target="_blank" rel="noreferrer">
              Annotation JSON
            </a>{' '}
            ·{' '}
            <a
              href={`https://viewer.allmaps.org/?url=${encodeURIComponent(loaded.url)}`}
              target="_blank"
              rel="noreferrer"
            >
              Compare in Allmaps
            </a>
          </p>
          <details open={loaded.warnings.length > 0}>
            <summary>Native implementation review</summary>
            {loaded.warnings.length ? (
              <ul>
                {loaded.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            ) : null}
            <p>
              Masks clip each tile in image space before warping. Bounds are sampled over the masked regions and padded
              in Web Mercator. Atlas fits transformations in Mercator; Allmaps may use a different fitting projection.
              Opacity uses one tile level, so new levels can appear progressively while zooming.
            </p>
            <p>
              Bounds: W {loaded.bounds.west.toFixed(5)}, S {loaded.bounds.south.toFixed(5)}, E{' '}
              {loaded.bounds.east.toFixed(5)}, N {loaded.bounds.north.toFixed(5)}.
            </p>
            <ul>
              {loaded.maps.map((map, index) => (
                <li key={index}>
                  <a href={`${map.service.id}/info.json`} target="_blank" rel="noreferrer">
                    IIIF service {index + 1}
                  </a>
                  : {map.service.width} × {map.service.height}, Image API {map.service.version3 ? 3 : 2},{' '}
                  {map.points.length} GCPs, {map.transformer.type}.
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : null}
    </div>
  );
};
