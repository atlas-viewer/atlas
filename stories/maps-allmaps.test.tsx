import React from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { AllmapsAnnotationOnOSM } from './maps.stories';
import { AtlasAuto } from '../src/modules/react-reconciler/components/AtlasAuto';
import annotation from './fixtures/allmaps-east-boston.json';

vi.mock('../src/modules/react-reconciler/components/AtlasAuto', () => ({
  AtlasAuto: vi.fn(() => null),
}));

const container = document.createElement('div');
let root: ReturnType<typeof createRoot>;
afterEach(() => {
  root?.unmount();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test("reports a failed IIIF request, then retries and uses the annotation's real control points", async () => {
  const source = annotation.target.source;
  const tiles = [{ width: 1024, scaleFactors: [1, 2, 4, 8] }];
  const fetchInfo = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 503 })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ width: source.width, height: source.height, tiles }),
    });
  vi.stubGlobal('fetch', fetchInfo);
  root = createRoot(container);
  root.render(<AllmapsAnnotationOnOSM />);

  await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain('503'));
  container.querySelector<HTMLButtonElement>('[role="alert"] button')!.click();
  await vi.waitFor(() => {
    expect(fetchInfo).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
  });
  expect(fetchInfo.mock.calls[1][0]).toBe(`${source.id}/info.json`);

  const atlasProps = vi.mocked(AtlasAuto).mock.calls.at(-1)![0];
  const world = atlasProps.children as React.ReactElement;
  const map = world.props.children;
  const warpedImage = map.props.children[1];
  expect(warpedImage.props.service).toEqual({ id: source.id, width: 6980, height: 5160, tiles });
  expect(warpedImage.props.controlPoints).toHaveLength(13);
  expect(warpedImage.props.controlPoints[0]).toEqual({
    image: { x: 1041.625, y: 2008.75 },
    map: { lng: -71.039271352, lat: 42.381360516 },
  });
  expect(warpedImage.props.transformationType).toBe('affine');
});

test('reports changed image dimensions instead of misplacing the historical map', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ width: 100, height: 100 }),
    })
  );
  root = createRoot(container);
  root.render(<AllmapsAnnotationOnOSM />);
  await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain('dimensions'));
});
