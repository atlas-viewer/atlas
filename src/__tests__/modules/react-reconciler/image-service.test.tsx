import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { ImageService } from '../../../modules/react-reconciler/components/ImageService';
import { getTileFromImageService } from '../../../modules/iiif/get-tiles';
import { ImageResourceLoadingContext } from '../../../modules/react-reconciler/components/ImageResourceLoadingContext';
vi.mock('../../../modules/iiif/get-tiles', () => ({ getTileFromImageService: vi.fn() }));
vi.mock('../../../modules/react-reconciler/components/TileSet', () => ({
  TileSet: ({ tiles }: any) => <span>{tiles.id}</span>,
}));

test('ignores stale metadata after changing image and reports failures without unhandled rejections', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const pending: Record<string, { resolve: (value: any) => void; reject: (error: Error) => void }> = {};
  vi.mocked(getTileFromImageService).mockImplementation(
    (id) =>
      new Promise((resolve, reject) => {
        pending[id] = { resolve, reject };
      })
  );
  const container = document.createElement('div');
  const root = createRoot(container);
  const onError = vi.fn();
  await act(async () => root.render(<ImageService id="first" width={100} height={100} onError={onError} />));
  await act(async () => root.render(<ImageService id="second" width={100} height={100} onError={onError} />));
  await act(async () => pending.first.resolve({ id: 'stale' }));
  expect(container.textContent).toBe('');
  const error = new Error('HTTP 404');
  await act(async () => pending.second.reject(error));
  expect(onError).toHaveBeenCalledWith(error);
  await act(async () => root.unmount());
});

test('reports metadata loading and failures to the export context and disposes replaced loads', async () => {
  const complete = vi.fn();
  const dispose = vi.fn();
  const beginLoad = vi.fn(() => ({ complete, dispose }));
  const resourceLoading = { beginLoad };
  const error = new Error('Metadata HTTP 404');
  vi.mocked(getTileFromImageService)
    .mockRejectedValueOnce(error)
    .mockResolvedValueOnce({ id: 'good' } as any);
  const root = createRoot(document.createElement('div'));
  const render = (id: string) => (
    <ImageResourceLoadingContext.Provider value={resourceLoading}>
      <ImageService id={id} width={100} height={100} />
    </ImageResourceLoadingContext.Provider>
  );
  await act(async () => root.render(render('failed')));
  expect(beginLoad).toHaveBeenCalledTimes(1);
  expect(complete).toHaveBeenCalledWith(error);
  await act(async () => root.render(render('good')));
  expect(dispose).toHaveBeenCalledTimes(1);
  expect(beginLoad).toHaveBeenCalledTimes(2);
  expect(complete).toHaveBeenLastCalledWith();
  await act(async () => root.unmount());
  expect(dispose).toHaveBeenCalledTimes(2);
});
