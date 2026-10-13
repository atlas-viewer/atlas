import React, { useEffect, useRef, useState } from 'react';
import { AtlasAuto, type Preset } from '../src/index';
import { TileSet } from '../src/modules/react-reconciler/components/TileSet';
import type { GetTile } from '../src/modules/iiif/shared';
import { TiledImage } from '../src/spacial-content/tiled-image';

export default { title: 'IIIF / Stress test' };
const imageLoading = { maxConcurrentRequests: 6, maxPrefetchPerFrame: 0 };
const infoUrl = 'https://osm-xyz-to-iiif.val.run/iiif/osm/info.json';
const canvasPreset = ['default-preset', { canvasBox: true }] as const;
const webglPreset = ['default-preset', { unstable_webglRenderer: true }] as const;
const places = [
  { name: 'London', lng: -0.1276, lat: 51.5072 },
  { name: 'New York', lng: -74.006, lat: 40.7128 },
  { name: 'Tokyo', lng: 139.6917, lat: 35.6895 },
  { name: 'Sydney', lng: 151.2093, lat: -33.8688 },
];

export function MassiveOpenStreetMap() {
  const [tiles, setTiles] = useState<GetTile>();
  const [error, setError] = useState('');
  const [preset, setPreset] = useState<Preset>();
  const [webgl, setWebgl] = useState(false);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [zoom, setZoom] = useState(16);
  const [place, setPlace] = useState(0);
  const status = useRef<HTMLOutputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(infoUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`info.json: HTTP ${response.status}`);
        const service = await response.json();
        if (
          !Number.isFinite(service.width) ||
          service.width <= 0 ||
          !Number.isFinite(service.height) ||
          service.height <= 0 ||
          !service.tiles?.length
        ) {
          throw new Error('The service did not return a valid tiled image.');
        }
        setTiles({ id: service.id, width: service.width, height: service.height, imageService: service });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(String(error));
      });
    return () => controller.abort();
  }, []);

  const visit = (location: number, level: number) => {
    if (!preset || !tiles) return;
    const { lng, lat } = places[location];
    const phi = (lat * Math.PI) / 180;
    const cx = ((lng + 180) / 360) * tiles.width;
    const cy = ((1 - Math.asinh(Math.tan(phi)) / Math.PI) / 2) * tiles.height;
    const screen = preset.runtime.getRendererScreenPosition();
    const factor = 2 ** (19 - level);
    const width = (screen?.width || 800) * factor;
    const height = (screen?.height || 600) * factor;
    preset.runtime.world.gotoRegion({ x: cx - width / 2, y: cy - height / 2, width, height, immediate: true });
    setPlace(location);
    setZoom(level);
  };

  useEffect(() => {
    if (!running || !preset || !tiles) return;
    let index = 0;
    const timer = window.setInterval(() => {
      if (index === 24) {
        setRunning(false);
        return;
      }
      // Alternate far-apart cities, zoom levels and native-resolution views.
      visit(index % places.length, [3, 10, 16, 19, 17, 19][index % 6]);
      setStep(++index);
    }, 1500);
    return () => window.clearInterval(timer);
  }, [running, preset, tiles]);

  useEffect(() => {
    if (!preset) return;
    let last = 0;
    return preset.runtime.registerHook('useFrame', () => {
      const now = performance.now();
      if (now - last < 250) return;
      last = now;
      let levels = 0;
      let rectangles = 0;
      let bytes = 0;
      const count = (object: any) => {
        if (object instanceof TiledImage) {
          levels++;
          rectangles += object.points.length / 5;
          bytes += object.points.byteLength + object.display.points.byteLength;
        }
        for (const child of object.allImages || object.objects || object.layers || []) count(child);
      };
      count(preset.runtime.world);
      const target = preset.runtime.target;
      const screen = preset.runtime.getRendererScreenPosition();
      const scale = (screen?.width || 1) / (target[3] - target[1]);
      if (status.current)
        status.current.textContent = `${levels} levels · ${rectangles.toLocaleString()} allocated tile rectangles · ${(
          bytes / 1024
        ).toFixed(0)} KiB geometry · ${(scale * 100).toFixed(2)}% native scale`;
    });
  }, [preset]);

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <h2 style={{ marginTop: 0 }}>An 18-petapixel IIIF image</h2>
      <p>134,217,728 × 134,217,728 pixels. All 20 levels, from the world to individual streets.</p>
      <p>
        <button
          disabled={!tiles}
          onClick={() => {
            setRunning(false);
            preset?.runtime.world.goHome(true);
          }}
        >
          World
        </button>{' '}
        {places.map((entry, index) => (
          <button
            key={entry.name}
            disabled={!tiles}
            onClick={() => {
              setRunning(false);
              visit(index, zoom);
            }}
          >
            {entry.name}
          </button>
        ))}{' '}
        <label>
          Zoom level{' '}
          <select
            value={zoom}
            onChange={(event) => {
              setRunning(false);
              visit(place, Number(event.target.value));
            }}
          >
            {Array.from({ length: 20 }, (_, index) => (
              <option key={index} value={index}>
                {index}
                {index === 19 ? ' (native)' : ''}
              </option>
            ))}
          </select>
        </label>{' '}
        <label>
          <input
            type="checkbox"
            checked={webgl}
            onChange={(event) => {
              setRunning(false);
              setPreset(undefined);
              setWebgl(event.target.checked);
            }}
          />{' '}
          WebGL
        </label>
      </p>
      <p>
        <button
          disabled={!tiles}
          onClick={() => {
            setStep(0);
            setRunning(!running);
          }}
        >
          {running ? 'Stop stress tour' : 'Run 24-stop stress tour'}
        </button>{' '}
        {step ? `${step}/24 stops` : 'The tour jumps between cities and zoom levels for 36 seconds.'}
      </p>
      <p>
        <output ref={status}>Loading image metadata…</output>
      </p>
      {error && <p role="alert">{error}</p>}
      <div
        style={{
          height: '65vh',
          minHeight: 350,
          position: 'relative',
          background: '#d9e6eb',
          border: '1px solid #9aaab2',
        }}
      >
        {tiles && (
          <AtlasAuto
            key={String(webgl)}
            onCreated={setPreset}
            renderPreset={(webgl ? webglPreset : canvasPreset) as any}
            runtimeOptions={{ maxOverZoom: 2, maxUnderZoom: 1 }}
            imageLoading={imageLoading}
            onImageError={(event) => setError(`Tile request failed: ${event.imageUrl || 'unknown URL'}`)}
          >
            <TileSet
              tiles={tiles}
              width={tiles.width}
              height={tiles.height}
              renderOptions={{
                quality: 1,
                useDevicePixelRatio: false,
                layerPolicy: 'fallback-only',
                renderLayers: 2,
                renderSmallestFallback: true,
                prefetchRadius: 0,
              }}
            />
          </AtlasAuto>
        )}
      </div>
      <p style={{ fontSize: 13 }}>
        ©{' '}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
          OpenStreetMap contributors
        </a>{' '}
        ·{' '}
        <a href={infoUrl} target="_blank" rel="noreferrer">
          IIIF service metadata
        </a>
        . Live tiles require network access. Drag to pan; scroll to zoom.
      </p>
    </div>
  );
}
