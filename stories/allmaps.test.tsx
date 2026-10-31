import React from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { LoadAllmapsURL } from './allmaps.stories';
import { AtlasAuto } from '../src/modules/react-reconciler/components/AtlasAuto';
import annotation from './fixtures/allmaps-east-boston.json';

vi.mock('../src/modules/react-reconciler/components/AtlasAuto', () => ({ AtlasAuto: vi.fn(() => null) }));
const container = document.createElement('div');
let root: ReturnType<typeof createRoot>;
const source = annotation.target.source;
const info = {
  '@id': source.id,
  width: source.width,
  height: source.height,
  tiles: [{ width: 1024, scaleFactors: [1, 2, 4, 8] }],
};
const response = (json: unknown) => ({ ok: true, json: async () => json });
function mount() {
  root = createRoot(container);
  root.render(<LoadAllmapsURL />);
}
function click(text: string) {
  Array.from(container.querySelectorAll('button'))
    .find((button) => button.textContent === text)!
    .click();
}
function mapProps() {
  const world = vi.mocked(AtlasAuto).mock.calls.at(-1)![0].children as React.ReactElement;
  return world.props.children.props;
}
afterEach(() => {
  root?.unmount();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test('loads a live annotation and IIIF metadata and fits the sheet beyond its control points', async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce(response(annotation)).mockResolvedValueOnce(response(info));
  vi.stubGlobal('fetch', fetchMock);
  mount();
  await vi.waitFor(() => expect(container.textContent).toContain('Loaded 1 map(s)'));
  expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([annotation.id, `${source.id}/info.json`]);
  const map = mapProps();
  expect(map.bounds.west).toBeLessThan(-71.05);
  expect(map.bounds.east).toBeGreaterThan(-70.965);
  expect(map.bounds.south).toBeLessThan(42.355);
  expect(map.bounds.north).toBeGreaterThan(42.4);
  const warped = map.children[1][0].props;
  expect(warped.service.width).toBe(6980);
  expect(warped.transformer.type).toBe('polynomial1');
  expect(warped.resourceMask).toEqual([
    [237, 275],
    [6752, 270],
    [6768, 4913],
    [231, 4916],
  ]);
});

test('unwraps a viewer URL, follows a linked page, shares IIIF metadata and unions shifted sheets', async () => {
  const shifted = JSON.parse(JSON.stringify(annotation));
  shifted.id = 'https://example.org/second-map';
  shifted.body.features.forEach((f: { geometry: { coordinates: number[] } }) => {
    f.geometry.coordinates[0] += 1;
  });
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith('/info.json')) return response({ ...info, type: 'ImageService3', id: source.id });
    if (url.endsWith('/images/d180902cb93d5bf2'))
      return response({ type: 'AnnotationPage', items: [annotation], next: 'https://example.org/page-2' });
    if (url === 'https://example.org/page-2') return response({ type: 'AnnotationPage', items: [shifted] });
    return response(annotation);
  });
  vi.stubGlobal('fetch', fetchMock);
  mount();
  await vi.waitFor(() => expect(container.textContent).toContain('Loaded 1 map(s)'));
  fetchMock.mockClear();
  click('New York (two maps on one image)');
  await vi.waitFor(() => expect(container.textContent).toContain('Loaded 2 map(s), 1 IIIF service(s)'));
  expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/info.json'))).toHaveLength(1);
  expect(mapProps().bounds.east).toBeGreaterThan(-70);
  expect(mapProps().bounds.west).toBeLessThan(-71);
  expect(mapProps().children[1][0].props.service.version3).toBe(true);
});

test('reports a bad sheet without dropping the valid sheet', async () => {
  const invalid = {
    ...annotation,
    id: 'broken-sheet',
    body: { ...annotation.body, transformation: { type: 'unsupported' } },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) =>
      response(url.endsWith('/info.json') ? info : { type: 'AnnotationPage', items: [annotation, invalid] })
    )
  );
  mount();
  await vi.waitFor(() => expect(container.textContent).toContain('Loaded 1 map(s)'));
  expect(container.textContent).toContain('broken-sheet: Atlas does not support');
});

test('aborts superseded loads and ignores late results', async () => {
  let resolveFirst!: (value: unknown) => void;
  const delayed = new Promise((resolve) => {
    resolveFirst = resolve;
  });
  const fetchMock = vi
    .fn()
    .mockReturnValueOnce(delayed)
    .mockResolvedValueOnce(response({ type: 'AnnotationPage', items: [annotation] }))
    .mockResolvedValueOnce(response(info));
  vi.stubGlobal('fetch', fetchMock);
  mount();
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  click('Ghent (unavailable IIIF example)');
  await vi.waitFor(() => expect(container.textContent).toContain('Loaded 1 map(s)'));
  expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  resolveFirst({ ok: false, status: 500 });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).toContain('Loaded 1 map(s)');
});

test('failed URLs can be retried with the same form', async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, status: 404 })
    .mockResolvedValueOnce(response(annotation))
    .mockResolvedValueOnce(response(info));
  vi.stubGlobal('fetch', fetchMock);
  mount();
  await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain('404'));
  container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await vi.waitFor(() => expect(container.textContent).toContain('Loaded 1 map(s)'));
  expect(container.querySelector('[role="alert"]')).toBeNull();
});
