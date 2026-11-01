/** @vitest-environment happy-dom */
import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, test, vi } from 'vitest';
import { TwoFingerDrawing } from '../../../../stories/mobile.stories';

const { handlers } = vi.hoisted(() => ({ handlers: { current: {} as Record<string, (event?: any) => void> } }));

// Exercise the story's real drawing callbacks and overlay with React's batched
// updates, without starting the image renderer or requiring a phone browser.
vi.mock('../../../modules/react-reconciler/components/AtlasAuto', () => ({
  AtlasAuto: ({ children }: any) => {
    handlers.current = children.props.children.props;
    return null;
  },
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
let unmount: (() => Promise<void>) | undefined;
afterEach(async () => {
  await unmount?.();
  unmount = undefined;
});

async function renderStory() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  unmount = async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  };
  await act(async () => {
    root.render(<TwoFingerDrawing />);
  });
  return container;
}

function stroke(from: { x: number; y: number }, to: { x: number; y: number }) {
  handlers.current.onPointerDown({ atlas: from });
  handlers.current.onPointerMove({ atlas: to });
  handlers.current.onPointerUp();
}

test('commits batched strokes without reading a cleared draft ref during render', async () => {
  const container = await renderStory();
  await act(async () => {
    stroke({ x: 10, y: 20 }, { x: 40, y: 50 });
  });
  expect(container.querySelector('polygon')?.getAttribute('points')).toBe('10,20 40,50');
  expect(container.querySelectorAll('circle')).toHaveLength(2);
  expect(container.querySelector('output')?.textContent).toContain('regions: 1');

  await act(async () => {
    stroke({ x: 60, y: 70 }, { x: 90, y: 100 });
  });
  expect(Array.from(container.querySelectorAll('polygon'), (node) => node.getAttribute('points'))).toEqual([
    '10,20 40,50',
    '60,70 90,100',
  ]);
  expect(container.querySelector('.mobile-drawing > polyline')?.getAttribute('points')).toBe('');
});

test('cancellation followed by release does not commit the discarded stroke', async () => {
  const container = await renderStory();
  await act(async () => {
    handlers.current.onPointerDown({ atlas: { x: 10, y: 20 } });
    handlers.current.onPointerMove({ atlas: { x: 40, y: 50 } });
    handlers.current.onPointerCancel();
    handlers.current.onPointerUp();
  });
  expect(container.querySelectorAll('polygon')).toHaveLength(0);
  expect(container.querySelector('output')?.textContent).toContain('Cancelled strokes: 1');
});
