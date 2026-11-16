import { ViewportClipHosts } from '../../modules/comparison/clip-hosts';
import React from 'react';
import { DnaFactory, scale } from '@atlas-viewer/dna';
import { createComparison, ComparisonController } from '../../modules/comparison/comparison';
import {
  resolveComparisonClip,
  resolveComparisonLine,
  comparisonPositionAtPoint,
  comparisonLineEndpoints,
  normalizeSplit,
} from '../../modules/comparison/geometry';
import { createComparisonDivider } from '../../modules/comparison/divider';
import { World } from '../../world';
import { WorldObject } from '../../world-objects/world-object';
import { Zone } from '../../world-objects/zone';
import { SingleImage } from '../../spacial-content/single-image';
import { Box } from '../../objects/box';
import { Runtime } from '../../renderer/runtime';
import type { Renderer } from '../../renderer/renderer';
import { ReactAtlas, unmountComponentAtNode } from '../../modules/react-reconciler/reconciler';
import { Comparison } from '../../modules/react-reconciler/components/Comparison';
import { OverlayRenderer } from '../../modules/overlay-renderer/overlay-renderer';
import { CanvasRenderer } from '../../modules/canvas-renderer/canvas-renderer';

function setup() {
  const renderer = {
    supportsViewportClip: true,
    beforeFrame() {},
    afterFrame() {},
    prepareLayer: vi.fn(),
    finishLayer() {},
    afterPaintLayer() {},
    paint: vi.fn(),
    getScale: () => 1,
    getPointsAt: (world, target, aggregate, factor, selection, options) =>
      world.getPointsAt(target, aggregate, factor, selection, options),
    getViewportBounds: () => null,
    pendingUpdate: () => false,
    isReady: () => true,
    resize() {},
    reset() {},
    getRendererScreenPosition: () => ({ x: 0, y: 0, top: 0, left: 0, width: 200, height: 100 }),
  } satisfies Renderer;
  const world = new World(200, 100);
  const runtime = new Runtime(renderer, world, { x: 0, y: 0, width: 200, height: 100, scale: 1 });
  runtime.stop();
  const makeObject = (id: string) => {
    const object = new WorldObject();
    object.applyProps({ id, width: 200, height: 100 });
    const image = new SingleImage();
    image.applyProps({
      uri: `/${id}.png`,
      target: { x: 0, y: 0, width: 200, height: 100 },
      display: { width: 200, height: 100 },
    });
    object.appendChild(image);
    world.appendChild(object);
    return object;
  };
  const first = makeObject('first'),
    second = makeObject('second');
  return { runtime, renderer, world, first, second };
}
const flush = async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
};

describe('comparison geometry', () => {
  test.each([0, 35, 90, 180, 215, 270])(
    'complementary polygons partition a non-square viewport at %s degrees',
    (angle) => {
      const split = { angle, position: 0.37 };
      const first = resolveComparisonClip(split, 800, 300, 'first'),
        second = resolveComparisonClip(split, 800, 300, 'second');
      const area = (polygon: typeof first.polygon) =>
        Math.abs(
          polygon.reduce((sum, p, i) => {
            const q = polygon[(i + 1) % polygon.length];
            return sum + p.x * q.y - q.x * p.y;
          }, 0)
        ) / 2;
      expect(area(first.polygon) + area(second.polygon)).toBeCloseTo(800 * 300);
      const [a, b] = comparisonLineEndpoints(split, 800, 300);
      expect(comparisonPositionAtPoint(split, 800, 300, a)).toBeCloseTo(split.position);
      expect(comparisonPositionAtPoint(split, 800, 300, b)).toBeCloseTo(split.position);
      const line = resolveComparisonLine({ angle, position: 0.5 }, 800, 300);
      expect(400 * line.normal.x + 150 * line.normal.y).toBeCloseTo(line.distance);
    }
  );
  test('normalizes input, rejects nonfinite values and handles end positions', () => {
    expect(normalizeSplit({ angle: -90, position: 2 })).toEqual({ angle: 270, position: 1 });
    expect(() => normalizeSplit({ angle: NaN, position: 0 })).toThrow();
    expect(() => resolveComparisonLine({ angle: 0, position: 0 }, 0, 1)).toThrow();
    expect(resolveComparisonClip({ angle: 0, position: 0 }, 200, 100, 'first').polygon.every((p) => p.x === 0)).toBe(
      true
    );
  });
});

describe('comparison scene and input', () => {
  test('carries per-occurrence context, leaves the ordinary overview unmasked, and overrides zone filtering', () => {
    const { runtime, renderer, world, first, second } = setup();
    const zone = new Zone({ id: 'first-zone', x: 0, y: 0, width: 200, height: 100, objects: [first] });
    world.addZone(zone);
    world.selectZone('first-zone');
    const comparison = createComparison(runtime, { first: { zoneId: 'first-zone' }, second: { objects: [second] } });
    const target = DnaFactory.singleBox(200, 100);
    const paints = world.getPointsAt(target, scale(1), 1, target, {
      comparison: { controller: comparison, width: 200, height: 100 },
    });
    expect(paints.map((p) => p[3]?.viewportClip?.side)).toEqual(['first', 'second']);
    expect(world.getPointsAt(target).every((p) => !p[3])).toBe(true);
    expect((second.layers[0] as any).__zoneVisibilityAlpha).toBeLessThan(1); // ordinary active-zone drawing still dims it
    runtime.render(performance.now());
    runtime.stop();
    expect(renderer.prepareLayer.mock.calls.some((call) => call[2]?.viewportClip?.side === 'second')).toBe(true);
    comparison.destroy();
    expect(runtime.comparison).toBeUndefined();
    runtime.dispose();
  });
  test('hit tests only the visible annotations, including after view rotation and flipping', () => {
    const { runtime, world, first, second } = setup();
    const comparison = createComparison(runtime, { first: { objects: [first] }, second: { objects: [second] } });
    const a = vi.fn(),
      b = vi.fn();
    first.addEventListener('click', a);
    second.addEventListener('click', b);
    world.propagatePointerEvent('onClick', {}, 50, 50, { comparison });
    expect(a).toHaveBeenCalledOnce();
    expect(b).not.toHaveBeenCalled();
    world.propagatePointerEvent('onClick', {}, 150, 50, { comparison });
    expect(b).toHaveBeenCalledOnce();
    runtime.viewRotation = 180;
    world.propagatePointerEvent('onClick', {}, 50, 50, { comparison });
    expect(b).toHaveBeenCalledTimes(2);
    runtime.viewFlip = true;
    world.propagatePointerEvent('onClick', {}, 50, 50, { comparison });
    expect(a).toHaveBeenCalledTimes(2);
    runtime.dispose();
  });
  test('controlled requests wait for props; listeners can be removed; duplicate attachment is rejected', () => {
    const { runtime, first, second } = setup();
    const onSplitChange = vi.fn();
    const options = {
      first: { objects: [first] },
      second: { objects: [second] },
      split: { angle: 0, position: 0.5 },
      onSplitChange,
    };
    const comparison = createComparison(runtime, options);
    const listener = vi.fn();
    comparison.addEventListener('change', listener);
    comparison.setSplit({ angle: 20, position: 0.8 });
    expect(comparison.getState().split.position).toBe(0.5);
    expect(onSplitChange).toHaveBeenCalledOnce();
    comparison.updateOptions({ ...options, split: { angle: 20, position: 0.8 } });
    expect(listener).toHaveBeenCalledOnce();
    comparison.removeEventListener('change', listener);
    comparison.setEnabled(false);
    expect(listener).toHaveBeenCalledOnce();
    expect(() => createComparison(runtime, options)).toThrow('Only one');
    runtime.dispose();
  });
});

describe('comparison DOM helper', () => {
  test.each([0, 35, 90, 215])('uses the release position without a final move at %s degrees', (angle) => {
    const { runtime, first, second } = setup();
    const comparison = createComparison(runtime, {
      first: { objects: [first] },
      second: { objects: [second] },
      defaultSplit: { angle, position: 0.5 },
    });
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 100 } as DOMRect);
    const divider = createComparisonDivider(comparison, { container, label: 'Compare' });
    divider.element.setPointerCapture = vi.fn();
    const commits = vi.fn();
    divider.element.addEventListener('comparisoncommit', commits);
    const pointer = (type: string, x: number, y: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerId: 7, pointerType: 'mouse', button: 0, clientX: x, clientY: y });
      divider.element.dispatchEvent(event);
    };
    const { normal, lo, hi } = resolveComparisonLine({ angle, position: 0.5 }, 200, 100);
    const distance = 0.4 * (hi - lo);
    pointer('pointerdown', 110, 70);
    pointer('pointerup', 110 + normal.x * distance, 70 + normal.y * distance);
    expect(comparison.getState().split.position).toBeCloseTo(0.9);
    expect(commits.mock.calls[0][0].detail.split.position).toBeCloseTo(0.9);
    runtime.dispose();
  });
  test('window blur cancels capture and leaves the next drag usable', () => {
    const { runtime, first, second } = setup();
    const comparison = createComparison(runtime, { first: { objects: [first] }, second: { objects: [second] } });
    const container = document.createElement('div');
    container.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 100 } as DOMRect);
    const divider = createComparisonDivider(comparison, { container, label: 'Compare' });
    divider.element.setPointerCapture = vi.fn();
    const commits = vi.fn();
    divider.element.addEventListener('comparisoncommit', commits);
    const pointer = (type: string, x: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { pointerId: 7, pointerType: 'mouse', button: 0, clientX: x, clientY: 70 });
      divider.element.dispatchEvent(event);
    };
    pointer('pointerdown', 110);
    pointer('pointermove', 150);
    expect(comparison.getState().split.position).toBeCloseTo(0.7);
    window.dispatchEvent(new Event('blur'));
    expect(comparison.getState().split.position).toBe(0.5);
    expect(commits).not.toHaveBeenCalled();
    pointer('pointerdown', 110);
    pointer('pointermove', 170);
    pointer('pointerup', 170);
    expect(comparison.getState().split.position).toBeCloseTo(0.8);
    expect(commits).toHaveBeenCalledOnce();
    runtime.dispose();
  });

  test('custom handles restore their original attributes, and disabled helpers ignore keys', () => {
    const { runtime, first, second } = setup();
    const comparison = createComparison(runtime, { first: { objects: [first] }, second: { objects: [second] } });
    const container = document.createElement('div'),
      element = document.createElement('button');
    element.setAttribute('class', 'existing atlas-comparison-divider');
    element.setAttribute('aria-valuenow', '25');
    container.appendChild(element);
    const before = element.outerHTML;
    const divider = createComparisonDivider(comparison, { container, element, label: 'Compare' });
    comparison.setEnabled(false);
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'End' }));
    expect(comparison.getState().split.position).toBe(0.5);
    divider.destroy();
    expect(element.outerHTML).toBe(before);
    runtime.dispose();
  });
  test('concealed focusable descendants become inert even when the host spans both sides, then recover', () => {
    const container = document.createElement('div'),
      host = document.createElement('div'),
      button = document.createElement('button');
    const rect = (x: number, width: number) =>
      ({ left: x, top: 0, right: x + width, bottom: 50, width, height: 50 } as DOMRect);
    container.getBoundingClientRect = () => rect(0, 200);
    host.getBoundingClientRect = () => rect(0, 200);
    button.getBoundingClientRect = () => rect(150, 30);
    host.appendChild(button);
    container.appendChild(host);
    const clips = new ViewportClipHosts(container);
    clips.update(host, resolveComparisonClip({ angle: 0, position: 0.5 }, 200, 100, 'first'));
    expect((host.parentElement as HTMLElement & { inert: boolean }).inert).toBe(false);
    expect((button as HTMLElement & { inert: boolean }).inert).toBe(true);
    clips.update(host);
    expect((button as HTMLElement & { inert: boolean }).inert).not.toBe(true);
    clips.reset();
    expect(host.parentNode).toBe(container);
  });

  test('keyboard commits, pointer capture/cancellation, and runtime cleanup', () => {
    const { runtime, first, second } = setup();
    const comparison = createComparison(runtime, { first: { objects: [first] }, second: { objects: [second] } });
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.getBoundingClientRect = () => ({ left: 10, top: 20, width: 200, height: 100 } as DOMRect);
    const divider = createComparisonDivider(comparison, { container, label: 'Compare' });
    const commit = vi.fn();
    divider.element.addEventListener('comparisoncommit', commit);
    divider.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(comparison.getState().split.position).toBeCloseTo(0.51);
    expect(commit).toHaveBeenCalledOnce();
    divider.element.setPointerCapture = vi.fn();
    divider.element.hasPointerCapture = () => true;
    divider.element.releasePointerCapture = vi.fn();
    const pointer = (type: string, x: number) => {
      const e = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(e, { pointerId: 7, button: 0, clientX: x, clientY: 70 });
      divider.element.dispatchEvent(e);
    };
    pointer('pointerdown', 112);
    pointer('pointermove', 152);
    expect(comparison.getState().split.position).toBeCloseTo(0.71);
    pointer('pointercancel', 152);
    expect(comparison.getState().split.position).toBeCloseTo(0.51);
    expect(commit).toHaveBeenCalledOnce();
    expect(divider.element.releasePointerCapture).toHaveBeenCalledWith(7);
    pointer('pointerdown', 110);
    pointer('pointermove', -100);
    pointer('pointerup', -100);
    expect(comparison.getState().split.position).toBe(0);
    expect(commit).toHaveBeenCalledTimes(2);
    runtime.dispose();
    expect(container.children).toHaveLength(0);
    container.remove();
  });
  test('HTML clipping wraps outside content transforms and disappears cleanly', () => {
    const container = document.createElement('div');
    const renderer = new OverlayRenderer(container, { box: true, inlineStyles: true });
    const box = new Box();
    box.applyProps({ target: { x: 0, y: 0, width: 80, height: 30 }, html: true });
    const points = DnaFactory.singleBox(80, 30);
    renderer.beforeFrame(new World(), 1, points, {
      filters: {},
      viewRotation: 35,
      viewCenter: { x: 100, y: 50 },
    } as any);
    renderer.prepareLayer(box, points, {
      viewportClip: resolveComparisonClip({ angle: 35, position: 0.5 }, 200, 100, 'first'),
    });
    renderer.paint(box, 0, 0, 0, 80, 30);
    const element = box.__host.element as HTMLElement,
      wrapper = element.parentElement!;
    expect(wrapper.style.clipPath).toContain('polygon');
    expect(wrapper.style.transform).toBe('');
    expect(element.style.transform).toContain('rotate(35deg)');
    renderer.afterFrame(new World(), 1, points);
    renderer.beforeFrame(new World(), 1, points);
    renderer.afterFrame(new World(), 1, points);
    expect(wrapper.parentNode).toBeNull();
  });
  test('Canvas installs viewport clip outside camera/object transforms and restores state', () => {
    const renderer = Object.create(CanvasRenderer.prototype) as CanvasRenderer;
    const saved = { a: 0, b: 2, c: -2, d: 0, e: 40, f: 0 };
    const ctx = {
      save: vi.fn(),
      restore: vi.fn(),
      getTransform: () => saved,
      setTransform: vi.fn(),
      beginPath() {},
      moveTo() {},
      lineTo() {},
      closePath() {},
      clip: vi.fn(),
    };
    Object.assign(renderer, { ctx, dpi: 2, options: {}, hasActiveLayerClip: false });
    const box = new Box();
    renderer.prepareLayer(box, DnaFactory.singleBox(100, 100), {
      viewportClip: resolveComparisonClip({ angle: 35, position: 0.5 }, 200, 100, 'first'),
    });
    expect(ctx.setTransform.mock.calls).toEqual([[2, 0, 0, 2, 0, 0], [saved]]);
    expect(ctx.clip).toHaveBeenCalledOnce();
    renderer.finishLayer();
    expect(ctx.save).toHaveBeenCalledTimes(ctx.restore.mock.calls.length);
  });
});

describe('comparison reconciler declaration', () => {
  test('discarded suspended world construction does not attach a comparison', async () => {
    const { runtime } = setup();
    function Suspend(): React.ReactElement {
      throw new Promise(() => {});
    }
    ReactAtlas.render(
      React.createElement(
        React.Suspense,
        { fallback: null },
        React.createElement(
          'world',
          { width: 200, height: 100 },
          React.createElement(Comparison, { first: { zoneId: 'a' }, second: { zoneId: 'b' } }),
          React.createElement(Suspend)
        )
      ),
      runtime
    );
    await flush();
    expect(runtime.comparison).toBeUndefined();
    unmountComponentAtNode(runtime);
    await flush();
    runtime.dispose();
  });
  test('a declaration inside world attaches after commit and survives StrictMode', async () => {
    const { runtime } = setup();
    ReactAtlas.render(
      React.createElement(
        React.StrictMode,
        null,
        React.createElement(
          'world',
          { width: 200, height: 100 },
          React.createElement(Comparison, { first: { zoneId: 'a' }, second: { zoneId: 'b' } })
        )
      ),
      runtime
    );
    await flush();
    expect(runtime.comparison).toBeInstanceOf(ComparisonController);
    unmountComponentAtNode(runtime);
    await flush();
    expect(runtime.comparison).toBeUndefined();
    runtime.dispose();
  });

  test('resolves sibling zones, exposes the core controller, preserves uncontrolled split, and detaches', async () => {
    const { runtime } = setup();
    let controller: ComparisonController | null = null;
    const ref = (value: ComparisonController | null) => {
      controller = value;
    };
    const render = () =>
      ReactAtlas.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(Comparison, { ref, first: { zoneId: 'a' }, second: { zoneId: 'b' } }),
          React.createElement(
            'zone',
            { id: 'a', x: 0, y: 0, width: 200, height: 100 },
            React.createElement('world-object', { id: 'a', width: 200, height: 100 })
          ),
          React.createElement(
            'zone',
            { id: 'b', x: 0, y: 0, width: 200, height: 100 },
            React.createElement('world-object', { id: 'b', width: 200, height: 100 })
          )
        ),
        runtime
      );
    render();
    await flush();
    expect(controller).toBeInstanceOf(ComparisonController);
    expect(runtime.comparison).toBe(controller);
    runtime.comparison!.setSplit({ angle: 30, position: 0.7 });
    render();
    await flush();
    expect(runtime.comparison!.getState().split).toEqual({ angle: 30, position: 0.7 });
    expect(runtime.comparison!.sideFor(runtime.world.getZoneById('b')!.objects[0], runtime.world)).toBe('second');
    unmountComponentAtNode(runtime);
    await flush();
    expect(runtime.comparison).toBeUndefined();
    expect(controller).toBeNull();
    runtime.dispose();
  });
});
