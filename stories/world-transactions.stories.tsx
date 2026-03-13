import * as React from 'react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ImageService } from '../src/modules/react-reconciler/components/ImageService';
import { Atlas, type AtlasCreatedMeta } from '../src/modules/react-reconciler/Atlas';
import '../src/modules/react-reconciler/types';

export default { title: 'Atlas / World Transactions' };

type DemoWorldId = 'ledger' | 'wall' | 'tower';
type EventLine = { id: number; text: string };

const demoWorlds: Record<
  DemoWorldId,
  {
    label: string;
    summary: string;
    render: (showOverlay: boolean) => React.ReactNode;
  }
> = {
  ledger: {
    label: 'Ledger spread',
    summary: 'Two oversized IIIF works with a long caption band and a wider home region.',
    render: (showOverlay) => (
      <>
        <world-object x={0} y={0} width={8240} height={140}>
          <box
            target={{ x: 0, y: 0, width: 8240, height: 140 }}
            style={{ backgroundColor: '#e8e1d3', border: '1px solid #c8bea8' }}
          />
          <paragraph
            target={{ x: 26, y: 38, width: 3400, height: 48 }}
            color="#241f17"
            fontSize={28}
            fontFamily="Iowan Old Style, Palatino, Georgia, serif"
          >
            Ledger spread
          </paragraph>
        </world-object>

        <ImageService
          id="https://libimages1.princeton.edu/loris/pudl0001%2F4609321%2Fs42%2F00000001.jp2/info.json"
          width={3625}
          height={4990}
          x={0}
          y={260}
          enableThumbnail
          renderOptions={{ renderLayers: 2, fadeInMs: 180, prefetchRadius: 0 }}
        />

        <ImageService
          id="https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f/info.json"
          width={4140}
          height={2775}
          x={3860}
          y={1230}
          enableThumbnail
          renderOptions={{ renderLayers: 2, fadeInMs: 180, prefetchRadius: 0 }}
        />

        <world-object x={240} y={5530} width={7760} height={560}>
          <box
            target={{ x: 0, y: 0, width: 7760, height: 560 }}
            style={{ backgroundColor: '#f4efe5', border: '1px solid #d7cdbd' }}
          />
          <paragraph
            target={{ x: 28, y: 26, width: 2500, height: 40 }}
            color="#31291f"
            fontSize={30}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Staged replacement keeps this world visible until the next one is ready.
          </paragraph>
          <paragraph
            target={{ x: 28, y: 96, width: 5200, height: 120 }}
            color="#5b4f43"
            fontSize={18}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Switch to another world from the panel. The requested key changes immediately, but the visible surface should
            not update until Atlas finishes building the staging runtime and the renderer emits ready.
          </paragraph>
        </world-object>

        {showOverlay ? (
          <world-object x={5460} y={420} width={2210} height={430}>
            <box
              target={{ x: 0, y: 0, width: 2210, height: 430 }}
              style={{ backgroundColor: 'rgba(243, 228, 196, 0.94)', border: '1px solid #9f7b3f' }}
            />
            <paragraph
              target={{ x: 24, y: 30, width: 1100, height: 42 }}
              color="#513f1d"
              fontSize={24}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              Same-key overlay
            </paragraph>
            <paragraph
              target={{ x: 24, y: 92, width: 1880, height: 120 }}
              color="#6a5730"
              fontSize={18}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              This box is controlled by ordinary React state without changing the `worldKey`. It should appear
              immediately, without staging a second Atlas surface.
            </paragraph>
          </world-object>
        ) : null}
      </>
    ),
  },
  wall: {
    label: 'Wall layout',
    summary: 'Three images on a darker wall with a narrower horizontal composition.',
    render: (showOverlay) => (
      <>
        <world-object x={0} y={0} width={9120} height={5660}>
          <box
            target={{ x: 0, y: 0, width: 9120, height: 5660 }}
            style={{ backgroundColor: '#181b1f' }}
          />
        </world-object>

        <ImageService
          id="https://dlcs-ida.org/iiif-img/2/1/M-1011_R-09_0182/info.json"
          width={2120}
          height={1665}
          x={420}
          y={560}
          enableThumbnail
          renderOptions={{ renderLayers: 2, fadeInMs: 180, prefetchRadius: 0 }}
        />

        <ImageService
          id="https://iiif.bodleian.ox.ac.uk/iiif/image/5009dea1-d1ae-435d-a43d-453e3bad283f/info.json"
          width={3320}
          height={2225}
          x={2870}
          y={360}
          enableThumbnail
          renderOptions={{ renderLayers: 2, fadeInMs: 180, prefetchRadius: 0 }}
        />

        <ImageService
          id="https://media.getty.edu/iiif/image/60a98920-e396-475a-83d4-707012dddd82/info.json"
          width={2680}
          height={4125}
          x={6460}
          y={600}
          enableThumbnail
          renderOptions={{ renderLayers: 2, fadeInMs: 180, prefetchRadius: 0 }}
        />

        <world-object x={360} y={4950} width={8460} height={420}>
          <box
            target={{ x: 0, y: 0, width: 8460, height: 420 }}
            style={{ backgroundColor: '#f1eee8', border: '1px solid #d4cdc3' }}
          />
          <paragraph
            target={{ x: 24, y: 34, width: 2000, height: 36 }}
            color="#1d2023"
            fontSize={26}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Wall layout
          </paragraph>
          <paragraph
            target={{ x: 24, y: 94, width: 5300, height: 110 }}
            color="#575b61"
            fontSize={18}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            This world has different proportions and object placement. Because the staged runtime homes itself before
            activation, the switch lands on the new composition in one frame.
          </paragraph>
        </world-object>

        {showOverlay ? (
          <world-object x={7040} y={220} width={1490} height={260}>
            <box
              target={{ x: 0, y: 0, width: 1490, height: 260 }}
              style={{ backgroundColor: 'rgba(255, 245, 225, 0.96)', border: '1px solid #a27836' }}
            />
            <paragraph
              target={{ x: 22, y: 24, width: 1000, height: 34 }}
              color="#674c20"
              fontSize={22}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              Immediate child diff
            </paragraph>
            <paragraph
              target={{ x: 22, y: 78, width: 1280, height: 96 }}
              color="#725f39"
              fontSize={16}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              Toggling the overlay changes children without changing `worldKey`.
            </paragraph>
          </world-object>
        ) : null}
      </>
    ),
  },
  tower: {
    label: 'Tower view',
    summary: 'A single tall image with side notes, useful for showing a strong re-home after swap.',
    render: (showOverlay) => (
      <>
        <world-object x={0} y={0} width={6120} height={8040}>
          <box
            target={{ x: 0, y: 0, width: 6120, height: 8040 }}
            style={{ backgroundColor: '#d9d6ce' }}
          />
        </world-object>

        <ImageService
          id="https://media.getty.edu/iiif/image/60a98920-e396-475a-83d4-707012dddd82/info.json"
          width={3880}
          height={5980}
          x={320}
          y={320}
          enableThumbnail
          renderOptions={{ renderLayers: 2, fadeInMs: 180, prefetchRadius: 0 }}
        />

        <world-object x={4440} y={540} width={1320} height={1960}>
          <box
            target={{ x: 0, y: 0, width: 1320, height: 1960 }}
            style={{ backgroundColor: '#f5f3ee', border: '1px solid #cbc4b6' }}
          />
          <paragraph
            target={{ x: 28, y: 28, width: 900, height: 34 }}
            color="#24282c"
            fontSize={24}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            Tower view
          </paragraph>
          <paragraph
            target={{ x: 28, y: 96, width: 1120, height: 180 }}
            color="#5d646b"
            fontSize={18}
            fontFamily="ui-sans-serif, system-ui, sans-serif"
          >
            This variant makes the home position substantially taller than the others. It is a good visual check that
            activation uses the staged runtime instead of reconstructing from scratch at commit time.
          </paragraph>
        </world-object>

        {showOverlay ? (
          <world-object x={4340} y={2810} width={1460} height={360}>
            <box
              target={{ x: 0, y: 0, width: 1460, height: 360 }}
              style={{ backgroundColor: 'rgba(243, 228, 196, 0.94)', border: '1px solid #9f7b3f' }}
            />
            <paragraph
              target={{ x: 24, y: 28, width: 1000, height: 36 }}
              color="#5b451e"
              fontSize={22}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              Overlay on same key
            </paragraph>
            <paragraph
              target={{ x: 24, y: 84, width: 1160, height: 110 }}
              color="#6c5832"
              fontSize={16}
              fontFamily="ui-sans-serif, system-ui, sans-serif"
            >
              Use this to contrast immediate child updates with staged world replacement.
            </paragraph>
          </world-object>
        ) : null}
      </>
    ),
  },
};

const worldOrder: DemoWorldId[] = ['ledger', 'wall', 'tower'];

function formatTime(value: number) {
  const date = new Date(value);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function AtomicWorldSwap() {
  const [requestedWorld, setRequestedWorld] = useState<DemoWorldId>('ledger');
  const [committedWorld, setCommittedWorld] = useState<DemoWorldId>('ledger');
  const [showOverlay, setShowOverlay] = useState(false);
  const [eventLog, setEventLog] = useState<EventLine[]>([{ id: 0, text: 'Story booted with `worldKey="ledger"`.' }]);
  const [lastCreated, setLastCreated] = useState<string>('active surface mounted for Ledger spread');
  const [lastReady, setLastReady] = useState<string>('waiting for first ready');
  const requestedWorldRef = useRef<DemoWorldId>('ledger');
  const nextEventIdRef = useRef(1);
  const imageLoading = useMemo(
    () => ({
      maxConcurrentRequests: 1,
      maxPrefetchPerFrame: 0,
      revealDelayFrames: 2,
      revealBatchWindowFrames: 2,
    }),
    []
  );

  const currentWorld = useMemo(() => demoWorlds[requestedWorld], [requestedWorld]);
  const renderedWorld = useMemo(() => currentWorld.render(showOverlay), [currentWorld, showOverlay]);
  const transactionState =
    requestedWorld === committedWorld ? 'Idle' : `Staging ${demoWorlds[requestedWorld].label}`;

  const pushEvent = useCallback((text: string) => {
    setEventLog((lines) => [{ id: nextEventIdRef.current++, text }, ...lines].slice(0, 10));
  }, []);

  const requestWorld = useCallback((nextWorld: DemoWorldId) => {
    if (nextWorld === requestedWorld) {
      return;
    }
    requestedWorldRef.current = nextWorld;
    setRequestedWorld(nextWorld);
    pushEvent(`Request ${demoWorlds[nextWorld].label} with worldKey="${nextWorld}".`);
  }, [pushEvent, requestedWorld]);

  const handleCreated = useCallback((_ctx: any, meta?: AtlasCreatedMeta) => {
    const stage = meta?.stage || 'active';
    const key = (meta?.worldKey as DemoWorldId | undefined) || requestedWorldRef.current;
    const line = `${stage === 'staging' ? 'Staging' : 'Active'} surface mounted for ${demoWorlds[key].label}.`;
    setLastCreated(line);
    pushEvent(line);
  }, [pushEvent]);

  const handleReady = useCallback(() => {
    const nextWorld = requestedWorldRef.current;
    const label = demoWorlds[nextWorld].label;
    setCommittedWorld(nextWorld);
    setLastReady(`${label} became visible at ${formatTime(Date.now())}.`);
    pushEvent(`Ready committed ${label}. Visible world switched in one frame.`);
  }, [pushEvent]);

  return (
    <div className="world-transaction-story">
      <div className="world-transaction-stage">
        <Atlas
          width={960}
          height={640}
          worldKey={requestedWorld}
          background="#111317"
          imageLoading={imageLoading}
          onCreated={handleCreated}
          onReady={handleReady}
          containerStyle={{ border: '1px solid #cfd4dc' }}
        >
          {renderedWorld}
        </Atlas>
      </div>

      <aside className="world-transaction-panel">
        <div className="world-transaction-header">
          <h1>Transactional world swap</h1>
          <p>
            Switch the `worldKey` to stage a full replacement. Toggle the overlay to send a same-key child update that
            should render immediately.
          </p>
        </div>

        <section className="world-transaction-section">
          <div className="world-transaction-label">World presets</div>
          <div className="world-transaction-button-list">
            {worldOrder.map((worldId) => {
              const world = demoWorlds[worldId];
              const selected = requestedWorld === worldId;
              return (
                <button
                  key={worldId}
                  type="button"
                  className={selected ? 'is-selected' : ''}
                  disabled={selected}
                  onClick={() => requestWorld(worldId)}
                >
                  <strong>{world.label}</strong>
                  <span>{world.summary}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="world-transaction-section">
          <div className="world-transaction-label">Immediate child diff</div>
          <button
            type="button"
            className="world-transaction-inline-button"
            onClick={() => {
              const nextShowOverlay = !showOverlay;
              setShowOverlay(nextShowOverlay);
              pushEvent(
                `${nextShowOverlay ? 'Added' : 'Removed'} same-key overlay on ${demoWorlds[requestedWorld].label}.`
              );
            }}
          >
            {showOverlay ? 'Hide overlay' : 'Show overlay'}
          </button>
        </section>

        <section className="world-transaction-section world-transaction-status">
          <div>
            <span>Requested</span>
            <strong>{demoWorlds[requestedWorld].label}</strong>
          </div>
          <div>
            <span>Visible</span>
            <strong>{demoWorlds[committedWorld].label}</strong>
          </div>
          <div>
            <span>Transaction</span>
            <strong>{transactionState}</strong>
          </div>
        </section>

        <section className="world-transaction-section world-transaction-notes">
          <div className="world-transaction-label">Lifecycle notes</div>
          <div className="world-transaction-note">{lastCreated}</div>
          <div className="world-transaction-note">{lastReady}</div>
        </section>

        <section className="world-transaction-section">
          <div className="world-transaction-label">Event log</div>
          <div className="world-transaction-log">
            {eventLog.map((line) => (
              <div key={line.id}>{line.text}</div>
            ))}
          </div>
        </section>
      </aside>

      <style>{`
        .world-transaction-story {
          display: grid;
          grid-template-columns: minmax(0, 960px) 320px;
          gap: 20px;
          align-items: start;
          padding: 20px;
          background: #ece8e1;
          color: #1f2328;
          font-family: "IBM Plex Sans", "Aptos", "Segoe UI", sans-serif;
        }

        .world-transaction-stage {
          min-width: 0;
        }

        .world-transaction-panel {
          background: #f9f7f2;
          border: 1px solid #cbc5b8;
          border-radius: 10px;
          padding: 16px;
          display: grid;
          gap: 18px;
        }

        .world-transaction-header h1 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          line-height: 1.2;
        }

        .world-transaction-header p {
          margin: 8px 0 0;
          font-size: 14px;
          line-height: 1.5;
          color: #5e5a52;
        }

        .world-transaction-section {
          display: grid;
          gap: 10px;
        }

        .world-transaction-label {
          font-size: 12px;
          font-weight: 600;
          color: #6f675a;
        }

        .world-transaction-button-list {
          display: grid;
          gap: 8px;
        }

        .world-transaction-button-list button,
        .world-transaction-inline-button {
          appearance: none;
          border: 1px solid #bdb4a4;
          background: #fffdf8;
          color: #23272d;
          border-radius: 8px;
          padding: 10px 12px;
          text-align: left;
          cursor: pointer;
          font: inherit;
        }

        .world-transaction-button-list button:hover,
        .world-transaction-inline-button:hover {
          background: #f2ede4;
        }

        .world-transaction-button-list button:disabled {
          cursor: default;
        }

        .world-transaction-button-list button.is-selected {
          border-color: #4d5b67;
          background: #e6ecef;
        }

        .world-transaction-button-list button strong {
          display: block;
          font-size: 14px;
          font-weight: 600;
        }

        .world-transaction-button-list button span {
          display: block;
          margin-top: 4px;
          font-size: 12px;
          line-height: 1.4;
          color: #5f615c;
        }

        .world-transaction-status {
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .world-transaction-status div {
          border: 1px solid #d9d2c6;
          background: #fffdf8;
          border-radius: 8px;
          padding: 10px;
        }

        .world-transaction-status span {
          display: block;
          font-size: 11px;
          color: #6b6457;
        }

        .world-transaction-status strong {
          display: block;
          margin-top: 6px;
          font-size: 13px;
          font-weight: 600;
          line-height: 1.35;
        }

        .world-transaction-notes {
          border-top: 1px solid #ddd6c9;
          padding-top: 12px;
        }

        .world-transaction-note {
          font-size: 13px;
          line-height: 1.45;
          color: #544f46;
        }

        .world-transaction-log {
          border: 1px solid #d8d1c5;
          background: #fffdf8;
          border-radius: 8px;
          min-height: 160px;
          max-height: 220px;
          overflow: auto;
          padding: 10px 12px;
          font-size: 12px;
          line-height: 1.5;
          color: #46423a;
        }

        .world-transaction-log div + div {
          margin-top: 6px;
          padding-top: 6px;
          border-top: 1px solid #efeadf;
        }

        @media (max-width: 1320px) {
          .world-transaction-story {
            grid-template-columns: minmax(0, 1fr);
          }

          .world-transaction-stage {
            overflow-x: auto;
            padding-bottom: 4px;
          }
        }
      `}</style>
    </div>
  );
}
