/** @vitest-environment happy-dom */
import React from 'react';
import { DnaFactory } from '@atlas-viewer/dna';
import { TextLabelObject } from '../../objects/text-label';
import { TextLabel } from '../../modules/react-reconciler/components/TextLabel';
import { CanvasRenderer } from '../../modules/canvas-renderer/canvas-renderer';
import { ReactAtlas } from '../../modules/react-reconciler/reconciler';
import { Runtime } from '../../renderer/runtime';
import { World } from '../../world';

function setup(dpi = 1) {
  const canvas = {
    width: 500 * dpi,
    height: 400 * dpi,
    style: {},
    dataset: {},
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 500, height: 400, top: 0, left: 0 }),
  } as any;
  const ctx = {
    canvas,
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    getTransform: () => ({ a: dpi, b: 0, c: 0, d: dpi, e: 0, f: 0 }),
    translate: vi.fn(),
    rotate: vi.fn(),
    measureText: (s: string) => ({ width: s.length * 10 }),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    fillRect: vi.fn(),
    stroke: vi.fn(),
  } as any;
  canvas.getContext = () => ctx;
  const renderer = new CanvasRenderer(canvas, { dpi });
  return { renderer, ctx };
}

test.each([1, 2])('keeps font size in CSS pixels across zoom and DPI %s, draws only text', (dpi) => {
  const { renderer, ctx } = setup(dpi);
  const label = new TextLabelObject();
  label.applyProps({
    text: 'Boston',
    points: [
      [100, 100],
      [500, 100],
      [500, 400],
      [100, 400],
    ],
    style: { fontSize: 24 },
  });
  renderer.paint(label, 0, 50, 50, 400, 300);
  expect(ctx.font).toContain('24px');
  expect(ctx.fillText).toHaveBeenCalledWith('Boston', 0, 0);
  const before = label.layout!.width;
  renderer.paint(label, 0, -400, -300, 1200, 900);
  expect(label.layout!.width).toBe(before);
  expect(label.layout!.x).toBeGreaterThan(0);
  expect(label.layout!.x).toBeLessThan(500);
  expect(ctx.fillRect).not.toHaveBeenCalled();
  expect(ctx.stroke).not.toHaveBeenCalled();
});

test('hits the displayed text rather than its placement shape and updates hover/active styles', () => {
  const { renderer, ctx } = setup();
  const label = new TextLabelObject();
  const props = {
    text: 'Boston',
    points: [
      [100, 50],
      [500, 50],
      [500, 350],
      [100, 350],
    ] as [number, number][],
    style: { color: 'blue', ':hover': { color: 'red' }, ':active': { color: 'orange' } },
  };
  label.applyProps(props);
  const draw = () => renderer.paint(label, 0, 0, 0, 400, 300);
  draw();
  expect(label.intersects([label.layout!.x, label.layout!.y])).toBe(true);
  expect(label.intersects([10, 10])).toBe(false);
  label.dispatchEvent('onPointerEnter', {});
  draw();
  expect(ctx.fillStyle).toBe('red');
  label.dispatchEvent('onPointerDown', {});
  draw();
  expect(ctx.fillStyle).toBe('orange');
  label.dispatchEvent('onPointerLeave', {});
  draw();
  expect(ctx.fillStyle).toBe('blue');
  label.applyProps({ ...props, interactive: false });
  draw();
  expect(label.intersects([label.layout!.x, label.layout!.y])).toBe(false);
});

test('validates geometry and updates line bounds for screen-sized hit testing', () => {
  const label = new TextLabelObject();
  expect(() =>
    label.applyProps({
      text: 'bad',
      points: [
        [NaN, 0],
        [1, 1],
      ],
      open: true,
    })
  ).toThrow(/finite/);
  expect(() =>
    label.applyProps({
      text: 'bad',
      points: [
        [0, 0],
        [1, 1],
      ],
      open: true,
      style: { fontSize: 0 },
    })
  ).toThrow(/fontSize/);
  label.applyProps({
    text: 'Road',
    points: [
      [0, 100],
      [400, 100],
    ],
    open: true,
  });
  const target = DnaFactory.singleBox(500, 400);
  label.getAllPointsAt(target, undefined, 1);
  const height = label.height;
  label.getAllPointsAt(target, undefined, 0.5);
  expect(label.height).toBeCloseTo(height * 2);
});

test('rotated geometry uses the visible screen region and keeps text hit testing aligned', () => {
  const { renderer, ctx } = setup(2);
  ctx.getTransform = () => ({ a: 0, b: 2, c: -2, d: 0, e: 800, f: 0 });
  const label = new TextLabelObject();
  label.applyProps({
    text: 'Boston',
    points: [
      [0, 0],
      [300, 0],
      [300, 300],
      [0, 300],
    ],
  });
  renderer.paint(label, 0, 0, 0, 300, 300);
  const layout = label.layout!;
  expect(layout).toBeDefined();
  expect(layout.angle).toBe(0);
  // Inverse of the 90-degree view transform, in CSS pixels.
  expect(label.intersects([layout.y, 400 - layout.x])).toBe(true);
  expect(label.intersects([0, 0])).toBe(false);
  renderer.paint(label, 0, 1000, 1000, 300, 300);
  expect(label.layout).toBeUndefined();
  expect(label.intersects([layout.y, 400 - layout.x])).toBe(false);
});

test('reconciles TextLabel, registers pointer events and updates its text in place', async () => {
  const { renderer } = setup();
  const runtime = new Runtime(renderer, new World(500, 400), { x: 0, y: 0, width: 500, height: 400, scale: 1 });
  runtime.stop();
  const ref = React.createRef<TextLabelObject>(),
    click = vi.fn();
  const render = (text: string) =>
    ReactAtlas.render(
      <world>
        <world-object width={500} height={400}>
          <TextLabel
            ref={ref}
            text={text}
            points={[
              [0, 0],
              [500, 0],
              [500, 400],
              [0, 400],
            ]}
            onClick={click}
          />
        </world-object>
      </world>,
      runtime
    );
  render('Boston');
  await new Promise((resolve) => setTimeout(resolve, 20));
  const label = ref.current!;
  expect(label).toBeInstanceOf(TextLabelObject);
  expect(runtime.world.activatedEvents).toContain('onPointerEnter');
  label.dispatchEvent('onClick', {});
  expect(click).toHaveBeenCalledOnce();
  render('Winthrop');
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(ref.current).toBe(label);
  expect(label.props.text).toBe('Winthrop');
  ReactAtlas.render(<world />, runtime);
  runtime.stop();
});
