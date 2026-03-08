import * as React from 'react';
import { useState } from 'react';
import { Atlas } from '../src/modules/react-reconciler/Atlas';
import { AtlasAuto } from '../src/modules/react-reconciler/components/AtlasAuto';
import { useZoneRuntimeState } from '../src/modules/react-reconciler/hooks/use-zone-runtime-state';
import type { Runtime } from '../src/renderer/runtime';
import '../src/modules/react-reconciler/types';

export default { title: 'PDF Scroll Zone' };

const navigatorOptions = {
  pdfScrollZoneZoneWindow: { total: 3, before: 1, after: 1 },
};

const testPages = [
  {
    id: 'https://iiif.wellcomecollection.org/image/b18035723_0001.JP2/full/715,/0/default.jpg',
    width: 7150,
    height: 10000,
  },
  {
    id: 'https://iiif.wellcomecollection.org/image/b18035723_0002.JP2/full/715,/0/default.jpg',
    width: 7150,
    height: 10000,
  },
  {
    id: 'https://iiif.wellcomecollection.org/image/b18035723_0003.JP2/full/715,/0/default.jpg',
    width: 7150,
    height: 10000,
  },
  {
    id: 'https://iiif.wellcomecollection.org/image/b18035723_0004.JP2/full/715,/0/default.jpg',
    width: 7150,
    height: 10000,
  },
  {
    id: 'https://iiif.wellcomecollection.org/image/b18035723_0005.JP2/full/715,/0/default.jpg',
    width: 7150,
    height: 10000,
  },
  {
    id: 'https://iiif.wellcomecollection.org/image/b18035723_0006.JP2/full/715,/0/default.jpg',
    width: 7150,
    height: 10000,
  },
];

function getPageLayouts() {
  const pageGap = 24;
  const maxPageWidth = Math.max(...testPages.map((page) => page.width));
  return testPages.map((page, index) => {
    return {
      ...page,
      pageNumber: index + 1,
      x: Math.round((maxPageWidth - page.width) / 2),
      y: index === 0 ? 0 : testPages.slice(0, index).reduce((sum, current) => sum + current.height + pageGap, 0),
    };
  });
}

function ZoneColorOverlay({ zoneId, pageWidth }: { zoneId: string; pageWidth: number }) {
  const state = useZoneRuntimeState(zoneId);
  const status = !state.exists
    ? 'missing'
    : state.active
    ? 'active'
    : state.visibleInViewport
    ? 'visible'
    : 'offscreen';
  const backgroundColor =
    status === 'active'
      ? 'rgba(22, 163, 74, 0.35)'
      : status === 'visible'
      ? 'rgba(2, 132, 199, 0.25)'
      : 'rgba(71, 85, 105, 0.3)';
  const borderColor =
    status === 'active' ? 'rgb(21, 128, 61)' : status === 'visible' ? 'rgb(14, 116, 144)' : 'rgb(71, 85, 105)';
  const overlayWidth = Math.round(Math.min(pageWidth * 0.45, 2800));

  return (
    <box
      target={{ x: 180, y: 180, width: overlayWidth, height: 360 }}
      style={{
        backgroundColor,
        border: `12px solid ${borderColor}`,
      }}
    />
  );
}

function Page({
  pageId,
  pageNumber,
  width,
  height,
  x,
  y,
  withZoneProbe = false,
}: {
  pageId: string;
  pageNumber: number;
  width: number;
  height: number;
  x: number;
  y: number;
  withZoneProbe?: boolean;
}) {
  const zoneId = `page-${pageNumber}`;

  return (
    <zone id={zoneId} x={x} y={y} width={width} height={height} margin={20}>
      <world-object id={`page-object-${pageNumber}`} x={x} y={y} width={width} height={height}>
        <world-image
          uri={pageId}
          target={{ x: 0, y: 0, width: width, height: height }}
          display={{ width: width, height: height }}
        />
        {withZoneProbe ? <ZoneColorOverlay zoneId={zoneId} pageWidth={width} /> : null}
      </world-object>
    </zone>
  );
}

export function WrapperZonesAndGoToZone() {
  const [runtime, setRuntime] = useState<Runtime | undefined>();
  const pageLayouts = getPageLayouts();

  return (
    <div style={{ background: '#f3f4f6', minHeight: '100vh', padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {pageLayouts.map((page) => (
          <button key={page.pageNumber} onClick={() => runtime?.goToZone(`page-${page.pageNumber}`)}>
            Go to page {page.pageNumber}
          </button>
        ))}
        <button onClick={() => runtime?.deselectZone()}>Exit zone</button>
      </div>

      <Atlas
        enableNavigator
        width={1280}
        height={800}
        interactionMode="pdf-scroll-zone"
        onCreated={(ctx) => setRuntime(ctx.runtime)}
        containerStyle={{ border: '1px solid #d0d7de' }}
        devTools
        navigatorOptions={navigatorOptions}
      >
        {pageLayouts.map((page) => (
          <Page
            key={page.pageNumber}
            pageId={page.id}
            pageNumber={page.pageNumber}
            width={page.width}
            height={page.height}
            x={page.x}
            y={page.y}
          />
        ))}
      </Atlas>
    </div>
  );
}

export function WrapperZonesWithInZoneStateProbe() {
  const [runtime, setRuntime] = useState<Runtime | undefined>();
  const pageLayouts = getPageLayouts();

  return (
    <div style={{ background: '#f3f4f6', minHeight: '100vh', padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {pageLayouts.map((page) => (
          <button key={page.pageNumber} onClick={() => runtime?.goToZone(`page-${page.pageNumber}`)}>
            Go to page {page.pageNumber}
          </button>
        ))}
        <button onClick={() => runtime?.deselectZone()}>Exit zone</button>
      </div>

      <Atlas
        enableNavigator
        width={1280}
        height={800}
        interactionMode="pdf-scroll-zone"
        onCreated={(ctx) => setRuntime(ctx.runtime)}
        containerStyle={{ border: '1px solid #d0d7de' }}
        devTools
        navigatorOptions={navigatorOptions}
      >
        {pageLayouts.map((page) => (
          <Page
            key={page.pageNumber}
            pageId={page.id}
            pageNumber={page.pageNumber}
            width={page.width}
            height={page.height}
            x={page.x}
            y={page.y}
            withZoneProbe
          />
        ))}
      </Atlas>
    </div>
  );
}

export function MobileFullscreenWebGL() {
  const pageLayouts = getPageLayouts();

  return (
    <>
      <style>{`
				.mobile-pdf-scroll-root {
					display: flex;
					height: 100vh;
					width: 100%;
					overflow: hidden;
					background: #e5e7eb;
				}

				.mobile-pdf-scroll-container {
					display: flex;
					flex: 1 1 0px;
					min-width: 0px;
					min-height: 0px;
					flex-direction: column;
					--atlas-container-flex: 1 1 0px;
				}
			`}</style>
      <div className="mobile-pdf-scroll-root">
        <div className="mobile-pdf-scroll-container">
          <AtlasAuto
            enableNavigator={false}
            interactionMode="pdf-scroll-zone"
            navigatorOptions={navigatorOptions}
            unstable_webglRenderer
            homePaddingPx={12}
            background="#e5e7eb"
            containerProps={{
              style: {
                minHeight: 0,
                overflow: 'hidden',
                touchAction: 'none',
                overscrollBehavior: 'none',
              },
            }}
            containerStyle={{
              background: '#e5e7eb',
            }}
          >
            {pageLayouts.map((page) => (
              <Page
                key={page.pageNumber}
                pageId={page.id}
                pageNumber={page.pageNumber}
                width={page.width}
                height={page.height}
                x={page.x}
                y={page.y}
                withZoneProbe
              />
            ))}
          </AtlasAuto>
        </div>
      </div>
    </>
  );
}

MobileFullscreenWebGL.parameters = {
  layout: 'fullscreen',
};
