/** @vitest-environment happy-dom */
import React, { useEffect } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot } from 'react-dom/client';
import { expect, test, vi } from 'vitest';
import { useMeasure } from '../../../utility/use-measure';

test('visual viewport resize and scroll refresh container measurements and clean up', async () => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const viewport = new EventTarget();
  const add = vi.spyOn(viewport, 'addEventListener');
  const remove = vi.spyOn(viewport, 'removeEventListener');
  vi.stubGlobal('visualViewport', viewport);
  let height = 600;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 360,
        bottom: height,
        width: 360,
        height,
      } as DOMRect)
  );
  function Measurement() {
    const [ref, bounds, refresh] = useMeasure();
    useEffect(refresh, [refresh]);
    return (
      <div ref={ref}>
        <output>
          {bounds.width}×{bounds.height}
        </output>
      </div>
    );
  }
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<Measurement />);
    });
    expect(container.textContent).toBe('360×600');
    height = 320;
    await act(async () => {
      viewport.dispatchEvent(new Event('resize'));
    });
    expect(container.textContent).toBe('360×320');
    height = 500;
    await act(async () => {
      viewport.dispatchEvent(new Event('scroll'));
    });
    expect(container.textContent).toBe('360×500');
    expect(add.mock.calls.map((call) => call[0])).toEqual(['resize', 'scroll']);
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
  expect(remove.mock.calls.map((call) => call[0])).toEqual(['resize', 'scroll']);
});
