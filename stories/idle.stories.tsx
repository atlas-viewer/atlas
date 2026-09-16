import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { AtlasAuto } from '../src/modules/react-reconciler/components/AtlasAuto';
import type { CanvasRenderer } from '../src/modules/canvas-renderer/canvas-renderer';
import type { CompositeRenderer } from '../src/modules/composite-renderer/composite-renderer';
import type { Runtime } from '../src/renderer/runtime';
import type { Presets } from '../src/modules/react-reconciler/presets';
import '../src/modules/react-reconciler/types';

export default { title: 'Image loading / Idle viewers' };

const localImage = new URL('./assets/img.png', import.meta.url).href;
const iiifImage = 'https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f';
const viewers = Array.from({ length: 60 }, (_, index) => index);
const preset: Presets = ['default-preset', { interactive: false }];

function Viewer({ index, idle, loadWhenVisible, tiled, runtimes }: {
  index: number;
  idle: boolean;
  loadWhenVisible: boolean;
  tiled: boolean;
  runtimes: Map<number, Runtime>;
}) {
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => () => { runtimes.delete(index); }, [index, runtimes]);

  return (
    <article style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 8, overflow: 'hidden', isolation: 'isolate' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12 }}>
        <span>Viewer {index + 1} · {ready ? 'Painted' : 'Waiting for image'}</span>
        <button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>
          {paused ? 'Resume viewer' : 'Pause viewer'}
        </button>
      </div>
      <AtlasAuto
        height={360}
        idle={idle || paused}
        loadWhenVisible={loadWhenVisible}
        renderPreset={preset}
        background="#e2e8f0"
        onCreated={({ runtime }) => { runtimes.set(index, runtime); }}
        onReady={() => setReady(true)}
      >
        {tiled ? (
          <world-object width={4093} height={2743}>
            <composite-image width={4093} height={2743}>
              {[1, 2, 4, 8, 16].map((scaleFactor) => (
                <tiled-image key={scaleFactor} uri={iiifImage} display={{ width: 4093, height: 2743 }}
                  tile={{ width: 512 }} scaleFactor={scaleFactor} crop={undefined} />
              ))}
            </composite-image>
          </world-object>
        ) : (
          <world-object width={600} height={900}>
            <world-image uri={`${localImage}?viewer=${index}`} target={{ width: 600, height: 900 }}
              display={{ width: 600, height: 900 }} />
          </world-object>
        )}
      </AtlasAuto>
    </article>
  );
}

function Gallery({ tiled = false }: { tiled?: boolean }) {
  const [idle, setIdle] = useState(false);
  const [loadWhenVisible, setLoadWhenVisible] = useState(true);
  const [mounted, setMounted] = useState(true);
  const runtimes = useRef(new Map<number, Runtime>());
  const lastViewer = useRef<HTMLDivElement>(null);
  const [stats, setStats] = useState({ mounted: 0, idle: 0, requests: 0, queued: 0, tiles: 0 });

  useEffect(() => {
    const timer = setInterval(() => {
      const next = { mounted: runtimes.current.size, idle: 0, requests: 0, queued: 0, tiles: 0 };
      for (const runtime of runtimes.current.values()) {
        if (runtime.idle) next.idle++;
        const renderer = (runtime.renderer as CompositeRenderer).renderers[0] as CanvasRenderer;
        next.requests += renderer.inFlightImageLoads.size;
        next.queued += renderer.loadingQueue.length;
        next.tiles += renderer.hostCache.size;
      }
      setStats(next);
    }, 250);
    return () => clearInterval(timer);
  }, []);

  return (
    <main style={{ background: '#f1f5f9', color: '#0f172a', padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 10, background: '#f1f5f9', padding: '12px 0' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 24 }}>60 Atlas viewers · {tiled ? 'IIIF tiles' : 'unique image URLs'}</h1>
        <p>Scroll to load visible viewers. Pause cancels requests and keeps painted content. Unmount releases tile canvases.</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
          <label><input type="checkbox" checked={loadWhenVisible}
            onChange={(event) => setLoadWhenVisible(event.target.checked)} /> Load only when visible</label>
          <button type="button" aria-pressed={idle} onClick={() => setIdle(!idle)}>
            {idle ? 'Resume all' : 'Pause all'}
          </button>
          <button type="button" onClick={() => setMounted(!mounted)}>{mounted ? 'Unmount all' : 'Mount all'}</button>
          <button type="button" onClick={() => lastViewer.current?.scrollIntoView({ block: 'end' })}>Jump to last viewer</button>
        </div>
        <p role="status" style={{ fontVariantNumeric: 'tabular-nums', marginBottom: 0 }}>
          {stats.mounted} mounted · {stats.idle} idle · {stats.requests} requests · {stats.queued} queued · {stats.tiles} tile canvases
        </p>
      </header>
      <p>Use the browser Network panel with throttling to inspect cancellation. {tiled
        ? 'These viewers use an external Bodleian IIIF service.'
        : 'Each viewer uses a distinct URL for the bundled 1200 × 1800 image; no external image service is required.'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 24 }}>
        {mounted && viewers.map((index) => (
          <div key={index} ref={index === 59 ? lastViewer : undefined}>
            <Viewer index={index} idle={idle} loadWhenVisible={loadWhenVisible} tiled={tiled} runtimes={runtimes.current} />
          </div>
        ))}
      </div>
    </main>
  );
}

export const ManyImages = () => <Gallery />;
export const ManyIIIFViewers = () => <Gallery tiled />;
