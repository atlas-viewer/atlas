import React, { CSSProperties, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { DnaFactory } from '@atlas-viewer/dna';
import { useRuntime } from '../hooks/use-runtime';
import {
  getDevToolsRegistrySnapshot,
  getRuntimeEntry,
  registerDevToolsCandidate,
  setSelectedRuntimeId,
  subscribeDevToolsRegistry,
  updateDevToolsCandidateRuntime,
} from '../devtools/registry';
import { collectImageDiagnostics, getCompositeSelectionsByFrame, getRendererSummary } from '../devtools/diagnostics';
import { resetImageLoadingState } from '../devtools/actions';
import { DevToolsTab, RuntimeDebugEvent, WorldDebugEvent } from '../devtools/types';
import { renderReactDom } from '../utility/react-dom';

const TABS: DevToolsTab[] = ['Overview', 'World', 'Inspector', 'Events', 'Images', 'Actions'];
let candidateCount = 0;

type InspectorNode = {
  key: string;
  depth: number;
  label: string;
  ref: any;
};

export const DevTools: React.FC<DevToolsProps> = (props) => {
  const contextRuntime = useRuntime();
  const resolvedRuntimeId = props.runtimeId || contextRuntime?.id;
  const portalContainerRef = useRef<HTMLDivElement | null>(null);
  const portalRoot = useRef<any>(null);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const container = document.createElement('div');
    container.dataset.atlasDevtools = 'true';
    document.body.appendChild(container);
    portalContainerRef.current = container;

    return () => {
      if (portalRoot.current?.unmount) {
        portalRoot.current.unmount();
      }
      container.remove();
      portalContainerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const container = portalContainerRef.current;
    if (!container) {
      return;
    }

    renderReactDom(container, <DevToolsPanel {...props} runtimeId={resolvedRuntimeId} />, portalRoot);
  });

  return null;
};

function pushBounded<T>(arr: T[], item: T, max: number) {
  arr.push(item);
  if (arr.length > max) {
    arr.splice(0, arr.length - max);
  }
}

function formatPoints(points?: any) {
  if (!points || points.length < 5) {
    return undefined;
  }
  return {
    x1: Number(points[1].toFixed ? points[1].toFixed(2) : points[1]),
    y1: Number(points[2].toFixed ? points[2].toFixed(2) : points[2]),
    x2: Number(points[3].toFixed ? points[3].toFixed(2) : points[3]),
    y2: Number(points[4].toFixed ? points[4].toFixed(2) : points[4]),
  };
}

function typeName(ref: any) {
  return ref?.constructor?.name || ref?.type || 'Unknown';
}

function buildInspectorNodes(runtime: any) {
  const nodes: InspectorNode[] = [];
  const seen = new Set<any>();

  const walk = (ref: any, depth: number, key: string) => {
    if (!ref || seen.has(ref)) {
      return;
    }
    seen.add(ref);

    const id = ref.id ? ` #${ref.id}` : '';
    nodes.push({
      key,
      depth,
      label: `${typeName(ref)}${id}`,
      ref,
    });

    if (Array.isArray(ref.layers)) {
      for (let i = 0; i < ref.layers.length; i++) {
        walk(ref.layers[i], depth + 1, `${key}.layers.${i}`);
      }
    }

    if (Array.isArray(ref.images) || Array.isArray(ref.allImages)) {
      const set = new Set<any>([...(ref.allImages || []), ...(ref.images || [])]);
      let index = 0;
      for (const image of set) {
        walk(image, depth + 1, `${key}.images.${index}`);
        index++;
      }
    }
  };

  walk(runtime.world, 0, 'world');

  const objects = runtime.world.getObjects();
  for (let i = 0; i < objects.length; i++) {
    const object = objects[i];
    if (!object) {
      continue;
    }
    walk(object, 1, `world.objects.${i}`);
  }

  return nodes;
}

function getHostSummary(ref: any) {
  if (!ref?.__host) {
    return 'No host';
  }

  if (ref.__host.canvas) {
    return `Canvas host loading=${!!ref.__host.canvas.loading} indices=${ref.__host.canvas.indices?.length || 0} loaded=${
      ref.__host.canvas.loaded?.length || 0
    }`;
  }

  if (ref.__host.webgl) {
    return `WebGL host loading=${ref.__host.webgl.loading?.length || 0} loaded=${ref.__host.webgl.loaded?.length || 0}`;
  }

  return 'Host attached';
}

export type DevToolsProps = {
  initialOpen?: boolean;
  bottom?: number;
  right?: number;
  zIndex?: number;
  maxEvents?: number;
  maxRuntimeEvents?: number;
  runtimeId?: string;
  className?: string;
  style?: CSSProperties;
};

const DevToolsPanel: React.FC<DevToolsProps> = ({
  initialOpen = false,
  bottom = 16,
  right = 16,
  zIndex = 1000,
  maxEvents = 500,
  maxRuntimeEvents = 1000,
  runtimeId: explicitRuntimeId,
  className,
  style,
}) => {
  const candidateId = useRef(`devtools-${++candidateCount}`);

  const [open, setOpen] = useState(initialOpen);
  const [tab, setTab] = useState<DevToolsTab>('Overview');
  const [pauseEventLog, setPauseEventLog] = useState(false);
  const [pickMode, setPickMode] = useState(false);
  const [selectedNodeRef, setSelectedNodeRef] = useState<any>(null);
  const [modeDraft, setModeDraft] = useState('explore');
  const [zoneDraft, setZoneDraft] = useState('');
  const [pausedRuntime, setPausedRuntime] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [eventFilter, setEventFilter] = useState<'all' | 'trigger' | 'pointer' | 'touch'>('all');
  const [, forceUpdate] = useState(0);

  const runtimeEventsRef = useRef<RuntimeDebugEvent[]>([]);
  const worldEventsRef = useRef<WorldDebugEvent[]>([]);
  const pauseHandleRef = useRef<(() => void) | null>(null);
  const scheduledRefresh = useRef(false);

  const scheduleRefresh = () => {
    if (scheduledRefresh.current) {
      return;
    }
    scheduledRefresh.current = true;
    requestAnimationFrame(() => {
      scheduledRefresh.current = false;
      forceUpdate((v) => v + 1);
    });
  };

  const preferredRuntimeId = explicitRuntimeId;

  useEffect(() => {
    const unregister = registerDevToolsCandidate({
      id: candidateId.current,
      runtimeId: preferredRuntimeId,
    });

    return unregister;
  }, []);

  useEffect(() => {
    updateDevToolsCandidateRuntime(candidateId.current, preferredRuntimeId);
  }, [preferredRuntimeId]);

  const snapshot = useSyncExternalStore(subscribeDevToolsRegistry, getDevToolsRegistrySnapshot, getDevToolsRegistrySnapshot);

  const isActiveHost = snapshot.activeCandidateId === candidateId.current;

  const selectedRuntimeId = snapshot.selectedRuntimeId || preferredRuntimeId || snapshot.runtimes[0]?.id;
  const runtimeEntry = getRuntimeEntry(selectedRuntimeId);
  const runtime = runtimeEntry?.runtime;
  const preset = runtimeEntry?.preset;

  useEffect(() => {
    if (selectedRuntimeId && selectedRuntimeId !== snapshot.selectedRuntimeId) {
      setSelectedRuntimeId(selectedRuntimeId);
    }
  }, [selectedRuntimeId, snapshot.selectedRuntimeId]);

  useEffect(() => {
    if (!runtime) {
      return;
    }
    setModeDraft(runtime.mode);
  }, [runtime?.id]);

  useEffect(() => {
    if (!isActiveHost || !open || !runtime) {
      return;
    }

    const unsubscribeRuntime = runtime.addDebugSubscriber((event) => {
      if (pauseEventLog) {
        return;
      }
      pushBounded(runtimeEventsRef.current, event, maxRuntimeEvents);
      scheduleRefresh();
    });

    const unsubscribeWorld = runtime.world.addDebugSubscriber((event) => {
      if (pauseEventLog) {
        return;
      }
      pushBounded(worldEventsRef.current, event, maxEvents);
      scheduleRefresh();
    });

    return () => {
      unsubscribeRuntime();
      unsubscribeWorld();
    };
  }, [isActiveHost, open, runtime?.id, pauseEventLog, maxEvents, maxRuntimeEvents]);

  useEffect(() => {
    if (!isActiveHost || !open) {
      return;
    }

    const interval = setInterval(() => {
      forceUpdate((v) => v + 1);
    }, 250);

    return () => {
      clearInterval(interval);
    };
  }, [isActiveHost, open]);

  useEffect(() => {
    if (!pickMode || !runtime || !preset?.em?.element) {
      return;
    }

    const element = preset.em.element;

    const onPointerDown = (e: PointerEvent) => {
      const bounds = element.getBoundingClientRect();
      const { x, y } = runtime.viewerToWorld(e.clientX - bounds.left, e.clientY - bounds.top);
      const point = DnaFactory.singleBox(1, 1, x, y);
      const hits = runtime.world.getObjectsAt(point, true);
      const hit = hits[hits.length - 1];
      if (hit) {
        const nested = hit[1];
        const target = nested.length ? nested[nested.length - 1] : hit[0];
        setSelectedNodeRef(target);
      }
      setTab('Inspector');
      setPickMode(false);
      scheduleRefresh();
      e.preventDefault();
      e.stopPropagation();
    };

    element.addEventListener('pointerdown', onPointerDown, true);

    return () => {
      element.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [pickMode, runtime?.id, preset?.em?.element]);

  useEffect(() => {
    return () => {
      const resume = pauseHandleRef.current;
      if (resume) {
        pauseHandleRef.current = null;
        resume();
      }
    };
  }, []);

  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  if (!isActiveHost) {
    return null;
  }

  const inspectorNodes = runtime ? buildInspectorNodes(runtime) : [];
  const selectedNode = selectedNodeRef || inspectorNodes[0]?.ref;
  const rendererSummary = runtime ? getRendererSummary(runtime) : { rendererTypes: [], canvas: [], webgl: [] };
  const imageDiagnostics = runtime ? collectImageDiagnostics(runtime.world) : [];
  const compositeFrames = getCompositeSelectionsByFrame(runtimeEventsRef.current, 15);
  const filteredWorldEvents = worldEventsRef.current.filter((event) => eventFilter === 'all' || event.type === eventFilter);

  const worldMap = (() => {
    if (!runtime) {
      return { width: 220, height: 220, rects: [], viewport: null };
    }

    const points = runtime.world.getPoints();
    const worldWidth = Math.max(1, runtime.world.width);
    const worldHeight = Math.max(1, runtime.world.height);
    const width = 220;
    const height = 220;

    const scaleX = width / worldWidth;
    const scaleY = height / worldHeight;
    const rects: Array<{ x: number; y: number; width: number; height: number }> = [];

    const maxRects = Math.min(points.length / 5, 300);
    for (let i = 0; i < maxRects; i++) {
      const key = i * 5;
      if (points[key] === 0) {
        continue;
      }
      rects.push({
        x: points[key + 1] * scaleX,
        y: points[key + 2] * scaleY,
        width: Math.max(1, (points[key + 3] - points[key + 1]) * scaleX),
        height: Math.max(1, (points[key + 4] - points[key + 2]) * scaleY),
      });
    }

    const viewport = {
      x: runtime.target[1] * scaleX,
      y: runtime.target[2] * scaleY,
      width: Math.max(1, (runtime.target[3] - runtime.target[1]) * scaleX),
      height: Math.max(1, (runtime.target[4] - runtime.target[2]) * scaleY),
    };

    return { width, height, rects, viewport };
  })();

  const containerStyle: CSSProperties = {
    position: 'fixed',
    right,
    bottom,
    zIndex,
    color: '#eef1ff',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    pointerEvents: 'auto',
    ...(style || {}),
  };

  const buttonStyle: CSSProperties = {
    background: '#111827',
    color: '#f9fafb',
    border: '1px solid #374151',
    borderRadius: 999,
    fontSize: 12,
    padding: '8px 12px',
    cursor: 'pointer',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
  };

  const panelStyle: CSSProperties = {
    width: 460,
    maxHeight: '70vh',
    overflow: 'hidden',
    background: '#0f172a',
    border: '1px solid #334155',
    borderRadius: 10,
    boxShadow: '0 12px 36px rgba(0, 0, 0, 0.4)',
    marginBottom: 10,
    display: 'flex',
    flexDirection: 'column',
  };

  const sectionStyle: CSSProperties = {
    padding: 10,
    overflow: 'auto',
    fontSize: 12,
    lineHeight: 1.4,
    display: 'grid',
    gap: 8,
  };

  const pauseRuntime = () => {
    if (!runtime || pauseHandleRef.current) {
      return;
    }
    pauseHandleRef.current = runtime.stop();
    setPausedRuntime(true);
  };

  const resumeRuntime = () => {
    const resume = pauseHandleRef.current;
    pauseHandleRef.current = null;
    if (resume) {
      resume();
    }
    setPausedRuntime(false);
  };

  const stepRuntime = () => {
    if (!runtime) {
      return;
    }

    if (pauseHandleRef.current) {
      const resume = pauseHandleRef.current;
      pauseHandleRef.current = null;
      resume();
      requestAnimationFrame(() => {
        if (runtime) {
          pauseHandleRef.current = runtime.stop();
          setPausedRuntime(true);
        }
      });
      return;
    }

    runtime.updateNextFrame();
  };

  const clearLogs = () => {
    runtimeEventsRef.current = [];
    worldEventsRef.current = [];
    setActionMessage('Logs cleared');
    scheduleRefresh();
  };

  return (
    <div className={className} style={containerStyle}>
      {open ? (
        <div style={panelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 10, borderBottom: '1px solid #1f2937' }}>
            <strong style={{ fontSize: 12, letterSpacing: 0.4 }}>Atlas DevTools</strong>
            <select
              style={{ marginLeft: 'auto', fontSize: 12, background: '#111827', color: '#e2e8f0', border: '1px solid #334155' }}
              value={selectedRuntimeId || ''}
              onChange={(e) => setSelectedRuntimeId(e.target.value)}
            >
              {snapshot.runtimes.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </select>
            <button style={buttonStyle} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, padding: 8, borderBottom: '1px solid #1f2937', flexWrap: 'wrap' }}>
            {TABS.map((tabName) => (
              <button
                key={tabName}
                style={{
                  ...buttonStyle,
                  padding: '4px 8px',
                  borderRadius: 6,
                  background: tab === tabName ? '#334155' : '#111827',
                }}
                onClick={() => setTab(tabName)}
              >
                {tabName}
              </button>
            ))}
          </div>

          <div style={sectionStyle}>
            {!runtime ? <div>No Atlas runtime available.</div> : null}

            {runtime && tab === 'Overview' ? (
              <>
                <div>Runtime id: {runtime.id}</div>
                <div>Mode: {runtime.mode}</div>
                <div>Scale factor: {runtime.getScaleFactor().toFixed(4)}</div>
                <div>World: {runtime.world.width} x {runtime.world.height}</div>
                <div>Target: {JSON.stringify(formatPoints(runtime.target))}</div>
                <div>Pending update: {String(runtime.pendingUpdate)}</div>
                <div>Renderer chain: {rendererSummary.rendererTypes.join(' -> ') || 'None'}</div>
                <div>Runtime log entries: {runtimeEventsRef.current.length}</div>
                <div>World log entries: {worldEventsRef.current.length}</div>
              </>
            ) : null}

            {runtime && tab === 'World' ? (
              <>
                <div>World dimensions: {runtime.world.width} x {runtime.world.height}</div>
                <div>Viewport target: {JSON.stringify(formatPoints(runtime.target))}</div>
                <svg width={worldMap.width} height={worldMap.height} style={{ background: '#020617', border: '1px solid #334155' }}>
                  {worldMap.rects.map((rect, idx) => (
                    <rect
                      key={`rect-${idx}`}
                      x={rect.x}
                      y={rect.y}
                      width={rect.width}
                      height={rect.height}
                      fill="rgba(56, 189, 248, 0.18)"
                      stroke="rgba(56, 189, 248, 0.7)"
                    />
                  ))}
                  {worldMap.viewport ? (
                    <rect
                      x={worldMap.viewport.x}
                      y={worldMap.viewport.y}
                      width={worldMap.viewport.width}
                      height={worldMap.viewport.height}
                      fill="rgba(251, 191, 36, 0.1)"
                      stroke="rgba(251, 191, 36, 1)"
                    />
                  ) : null}
                </svg>
              </>
            ) : null}

            {runtime && tab === 'Inspector' ? (
              <>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button style={buttonStyle} onClick={() => setPickMode((v) => !v)}>
                    {pickMode ? 'Cancel Pick' : 'Pick in Viewport'}
                  </button>
                </div>
                <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid #1f2937', borderRadius: 6 }}>
                  {inspectorNodes.map((node) => (
                    <button
                      key={node.key}
                      onClick={() => setSelectedNodeRef(node.ref)}
                      style={{
                        width: '100%',
                        display: 'block',
                        textAlign: 'left',
                        padding: `2px 6px 2px ${6 + node.depth * 14}px`,
                        background: selectedNode === node.ref ? '#1e293b' : 'transparent',
                        color: '#e2e8f0',
                        border: 0,
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      {node.label}
                    </button>
                  ))}
                </div>
                {selectedNode ? (
                  <div style={{ border: '1px solid #1f2937', borderRadius: 6, padding: 8 }}>
                    <div>Type: {typeName(selectedNode)}</div>
                    <div>ID: {selectedNode.id || '(none)'}</div>
                    <div>Points: {JSON.stringify(formatPoints(selectedNode.points))}</div>
                    <div>Display scale: {selectedNode.display?.scale ?? '(n/a)'}</div>
                    <div>Crop: {selectedNode.cropData ? JSON.stringify(selectedNode.cropData) : '(none)'}</div>
                    <div>Host: {getHostSummary(selectedNode)}</div>
                  </div>
                ) : null}
              </>
            ) : null}

            {runtime && tab === 'Events' ? (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={buttonStyle} onClick={() => setPauseEventLog((v) => !v)}>
                    {pauseEventLog ? 'Resume Log' : 'Pause Log'}
                  </button>
                  <button style={buttonStyle} onClick={clearLogs}>Clear</button>
                  <select
                    value={eventFilter}
                    onChange={(e) => setEventFilter(e.target.value as any)}
                    style={{ fontSize: 12, background: '#111827', color: '#e2e8f0', border: '1px solid #334155' }}
                  >
                    <option value="all">All</option>
                    <option value="trigger">Trigger</option>
                    <option value="pointer">Pointer</option>
                    <option value="touch">Touch</option>
                  </select>
                </div>
                <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #1f2937', borderRadius: 6, padding: 6 }}>
                  {filteredWorldEvents
                    .slice()
                    .reverse()
                    .map((event, index) => (
                      <div key={`event-${index}`} style={{ marginBottom: 4 }}>
                        [{event.type}] {JSON.stringify(event)}
                      </div>
                    ))}
                </div>
              </>
            ) : null}

            {runtime && tab === 'Images' ? (
              <>
                <div>Renderer health</div>
                {rendererSummary.canvas.map((entry, index) => (
                  <div key={`canvas-${index}`} style={{ border: '1px solid #1f2937', borderRadius: 6, padding: 8 }}>
                    <div>{entry.type}</div>
                    <div>loadingQueue: {entry.loadingQueue}</div>
                    <div>imagesPending: {entry.imagesPending}</div>
                    <div>imagesLoaded: {entry.imagesLoaded}</div>
                    <div>tasksRunning: {entry.tasksRunning}</div>
                    <div>firstMeaningfulPaint: {String(entry.firstMeaningfulPaint)}</div>
                  </div>
                ))}
                {rendererSummary.webgl.map((entry, index) => (
                  <div key={`webgl-${index}`} style={{ border: '1px solid #1f2937', borderRadius: 6, padding: 8 }}>
                    <div>{entry.type}</div>
                  </div>
                ))}

                <div>Image hosts ({imageDiagnostics.length})</div>
                <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid #1f2937', borderRadius: 6, padding: 6 }}>
                  {imageDiagnostics.map((entry) => (
                    <div key={`${entry.type}-${entry.id}-${entry.ownerId || 'none'}`} style={{ marginBottom: 6 }}>
                      <div>{entry.type} #{entry.id}</div>
                      <div>owner: {entry.ownerId || '(none)'} composite: {entry.compositeId || '(none)'}</div>
                      <div>canvas: {entry.canvas ? JSON.stringify(entry.canvas) : '(none)'}</div>
                      <div>webgl: {entry.webgl ? JSON.stringify(entry.webgl) : '(none)'}</div>
                      {entry.anomalies.length ? <div>anomalies: {entry.anomalies.join(' | ')}</div> : null}
                    </div>
                  ))}
                </div>

                <div>Chosen composite layers by frame</div>
                <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid #1f2937', borderRadius: 6, padding: 6 }}>
                  {compositeFrames.map((frame) => (
                    <div key={`frame-${frame.frame}`} style={{ marginBottom: 8 }}>
                      <div>frame {frame.frame}</div>
                      {frame.composites.map((composite) => (
                        <div key={`${frame.frame}-${composite.compositeId}`} style={{ paddingLeft: 8 }}>
                          <div>composite {composite.compositeId}</div>
                          {composite.layers.map((layer, idx) => (
                            <div key={`${composite.compositeId}-${idx}`} style={{ paddingLeft: 10 }}>
                              {layer.paintType} #{layer.paintId} tile={layer.tileIndex}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {runtime && tab === 'Actions' ? (
              <>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={buttonStyle} onClick={pausedRuntime ? resumeRuntime : pauseRuntime}>
                    {pausedRuntime ? 'Resume Loop' : 'Pause Loop'}
                  </button>
                  <button style={buttonStyle} onClick={stepRuntime}>Step Frame</button>
                  <button style={buttonStyle} onClick={() => runtime.updateNextFrame()}>Repaint</button>
                  <button style={buttonStyle} onClick={() => runtime.triggerResize()}>Trigger Resize</button>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={modeDraft}
                    onChange={(e) => setModeDraft(e.target.value)}
                    style={{ fontSize: 12, background: '#111827', color: '#e2e8f0', border: '1px solid #334155' }}
                  >
                    <option value="explore">explore</option>
                    <option value="sketch">sketch</option>
                    <option value="static">static</option>
                  </select>
                  <button
                    style={buttonStyle}
                    onClick={() => {
                      runtime.mode = modeDraft as any;
                      runtime.updateNextFrame();
                    }}
                  >
                    Apply Mode
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button style={buttonStyle} onClick={() => runtime.world.goHome()}>goHome</button>
                  <button style={buttonStyle} onClick={() => runtime.world.zoomIn()}>zoomIn</button>
                  <button style={buttonStyle} onClick={() => runtime.world.zoomOut()}>zoomOut</button>
                  <button style={buttonStyle} onClick={() => runtime.world.constraintBounds(true)}>constrain-bounds</button>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={zoneDraft}
                    onChange={(e) => setZoneDraft(e.target.value)}
                    style={{ fontSize: 12, background: '#111827', color: '#e2e8f0', border: '1px solid #334155' }}
                  >
                    <option value="">Select zone</option>
                    {runtime.world.zones.map((zone, idx) => (
                      <option key={`${zone.id}-${idx}`} value={String(zone.id || idx)}>
                        {zone.id || `zone-${idx}`}
                      </option>
                    ))}
                  </select>
                  <button
                    style={buttonStyle}
                    onClick={() => {
                      if (zoneDraft) {
                        runtime.selectZone(zoneDraft);
                      }
                    }}
                  >
                    Select Zone
                  </button>
                  <button style={buttonStyle} onClick={() => runtime.deselectZone()}>
                    Deselect Zone
                  </button>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    style={buttonStyle}
                    onClick={() => {
                      const result = resetImageLoadingState(runtime);
                      setActionMessage(`Reset image hosts=${result.imageHostsReset}, renderers=${result.renderersReset}`);
                      scheduleRefresh();
                    }}
                  >
                    Recover Images
                  </button>
                  <button style={buttonStyle} onClick={clearLogs}>Clear Logs</button>
                </div>

                {actionMessage ? <div>{actionMessage}</div> : null}
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <button style={buttonStyle} onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide DevTools' : 'Open DevTools'}
      </button>
    </div>
  );
};
