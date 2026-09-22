/** @vitest-environment happy-dom */
import React, { useEffect, useState } from 'react';
import { expect, test, vi } from 'vitest';
import { AtlasContext, ReactAtlas, staticPreset, useRuntime } from '../../../react';

test('the DOM-free entry renders, updates and unmounts a scene using React hooks', async () => {
  const container = document.createElement('div');
  const preset = staticPreset({
    containerElement: container,
    viewport: { x: 0, y: 0, width: 100, height: 80, scale: 1 },
    forceRefresh() {},
    interactive: false,
  });
  preset.runtime.stop();
  const cleanup = vi.fn();
  let update!: (width: number) => void;
  function Scene() {
    expect(useRuntime()).toBe(preset.runtime);
    const [width, setWidth] = useState(100);
    update = setWidth;
    useEffect(() => cleanup, []);
    return (
      <world-object width={width} height={80}>
        <world-image uri="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'/%3E" target={{ width, height: 80 }} display={{ width, height: 80 }} />
      </world-object>
    );
  }
  try {
    ReactAtlas.render(<AtlasContext.Provider value={preset}><Scene /></AtlasContext.Provider>, preset.runtime);
    await vi.waitFor(() => expect(preset.runtime.world.getObjects().filter(Boolean)).toHaveLength(1));
    const object = preset.runtime.world.getObjects().filter(Boolean)[0]!;
    expect(object.width).toBe(100);
    expect(object.layers[0].display.width).toBe(100);
    update(200);
    await vi.waitFor(() => expect(object.width).toBe(200));
    expect(object.layers[0].display.width).toBe(200);
    await new Promise<void>((resolve) => ReactAtlas.unmountComponentAtNode(preset.runtime, () => resolve()));
    expect(preset.runtime.world.getObjects().filter(Boolean)).toHaveLength(0);
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1));
  } finally {
    preset.unmount();
  }
});
