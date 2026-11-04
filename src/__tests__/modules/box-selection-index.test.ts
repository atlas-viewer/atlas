import { afterEach, describe, expect, test, vi } from 'vitest';
import { Box } from '../../objects/box';
import { WorldObject } from '../../world-objects/world-object';
import { BoxSelectionIndex } from '../../world-objects/box-selection-index';
import { World } from '../../world';
import { SingleImage } from '../../spacial-content/single-image';
import { dna } from '../../utility/precise-dna';

const target = (x: number, y = 0, width = 20, height = 20) => dna([1, x, y, x + width, y + height]);
function makeBox(x: number, options: any = {}) {
  const box = new Box();
  box.applyProps({
    target: { x, y: 0, width: 10, height: 10 },
    relativeStyle: true,
    style: { border: '2px solid red', backgroundColor: 'rgba(255,0,0,.1)' },
    ...options,
  });
  return box;
}
function fixture() {
  const owner = WorldObject.createWithProps({ id: 'canvas', width: 100000, height: 1000 });
  const boxes = Array.from({ length: 512 }, (_, i) => makeBox(i * 100));
  for (const box of boxes) owner.appendChild(box as any);
  return { owner, boxes };
}
afterEach(() => vi.restoreAllMocks());

describe('indexed native annotation boxes', () => {
  test('image-only selection skips annotation collection through nested world objects', () => {
    const { owner } = fixture();
    const nested = WorldObject.createWithProps({ id: 'nested', width: 100000, height: 1000 });
    const image = new SingleImage({ uri: 'image.jpg', width: 100, height: 100 });
    nested.appendChild(image);
    nested.appendChild(makeBox(0) as any);
    owner.appendChild(nested as any);
    const world = new World(100000, 1000);
    world.appendChild(owner);
    const paint = vi.spyOn(Box.prototype, 'getAllPointsAt');
    const region = target(0, 0, 100000, 1000);
    const selected = world.getPointsAt(region, undefined, 1, region, { includeAnnotations: false });
    expect(selected.map((item) => item[0])).toEqual([image]);
    expect(paint).not.toHaveBeenCalled();
    expect(world.getPointsAt(region).some((item) => item[0] instanceof Box)).toBe(true);
  });

  test('adapts local box selection to translated and scaled parent coordinates', () => {
    const { owner, boxes } = fixture();
    owner.applyProps({ id: 'canvas', x: 100, y: 50, width: 100000, height: 1000, scale: 2 });
    const result = owner.getAllPointsAt(target(2100, 50, 40), undefined as any, 1);
    expect(result.map((item) => item[0])).toContain(boxes[10]);
    expect(result.length).toBeLessThan(5);
  });

  test('selects only nearby boxes and preserves painter order, including fallback layers', () => {
    const boxes = Array.from({ length: 512 }, (_, i) => makeBox((511 - i) * 100));
    const html = makeBox(90000, { html: true });
    const layers = [...boxes.slice(0, 20), html, ...boxes.slice(20)];
    const index = new BoxSelectionIndex(layers as any);
    expect(index.query(target(49090, 0, 130), 1)).toEqual([boxes[19], html, boxes[20]]);
    expect(index.query(target(0, 0, 100000), 1)).toBe(layers);
  });

  test('does not dispatch per-box paint or scheduled work to thousands of offscreen annotations', () => {
    const { owner, boxes } = fixture();
    const paint = vi.spyOn(Box.prototype, 'getAllPointsAt');
    const schedule = vi.spyOn(Box.prototype, 'getScheduledUpdates');
    const result = owner.getAllPointsAt(target(1000), undefined as any, 1);
    expect(result.map((item) => item[0])).toEqual([boxes[10]]);
    expect(paint).toHaveBeenCalledTimes(1);
    owner.getScheduledUpdates(target(1000), 1);
    expect(schedule).not.toHaveBeenCalled();
  });

  test('keeps hit testing precise and in the same order, including transparent boxes', () => {
    const { owner, boxes } = fixture();
    boxes[10].applyProps({ style: { border: '2px solid rgba(0,0,0,0)', backgroundColor: 'transparent' } });
    expect(owner.getObjectsAt(target(1005, 5, 0, 0), true)).toEqual([boxes[10]]);
    expect(owner.getObjectsAt(target(1050, 5, 0, 0), true)).toEqual([]);
  });

  test('accounts for pixel-scaled borders, outlines, and hover footprints near the viewport edge', () => {
    const boxes = Array.from({ length: 512 }, (_, i) => makeBox(i * 100));
    boxes[10].applyProps({
      relativeStyle: true,
      style: { border: '20px solid red', outline: '4px solid blue', outlineOffset: '3px' },
    });
    const index = new BoxSelectionIndex(boxes as any);
    expect(index.query(target(1200), 0.1)).toContain(boxes[10]);
    expect(index.query(target(1200), 1)).not.toContain(boxes[10]);
  });

  test('rebuilds after geometry changes, removal, insertion and direct raw-point edits', () => {
    const { owner, boxes } = fixture();
    expect(owner.getAllPointsAt(target(1000), undefined as any, 1)).toHaveLength(1);
    boxes[10].translate(2000, 0);
    expect(owner.getAllPointsAt(target(1000), undefined as any, 1)).toHaveLength(0);
    boxes[11].applyProps({ target: { x: 1000, y: 0, width: 10, height: 10 } });
    expect(owner.getAllPointsAt(target(1000), undefined as any, 1)[0][0]).toBe(boxes[11]);
    owner.removeChild(boxes[11] as any);
    expect(owner.getAllPointsAt(target(1000), undefined as any, 1)).toHaveLength(0);
    const inserted = makeBox(1000);
    owner.insertBefore(inserted as any, boxes[12] as any);
    expect(owner.getAllPointsAt(target(1000), undefined as any, 1)[0][0]).toBe(inserted);
    inserted.points[1] = 5000;
    inserted.points[3] = 5010;
    expect(owner.getAllPointsAt(target(1000), undefined as any, 1)).toHaveLength(0);
  });

  test('preserves custom objects, subclasses and CSS shadows without assuming their bounds are safe', () => {
    const { owner } = fixture();
    class CustomBox extends Box {
      getAllPointsAt(t: any, a: any) {
        return super.getAllPointsAt(t, a);
      }
    }
    const custom = new CustomBox();
    custom.applyProps({ target: { x: 90000, y: 0, width: 10, height: 10 } });
    const shadow = makeBox(90000, { style: { boxShadow: '0px 0px 100px black' } });
    owner.appendChild(custom as any);
    owner.appendChild(shadow as any);
    const scheduled = vi.spyOn(custom, 'getScheduledUpdates').mockReturnValue([() => {}]);
    owner.invalidateLayerSelection();
    expect(owner.getAllPointsAt(target(1000), undefined as any, 1).map((p) => p[0])).toContain(custom);
    expect(owner.getAllPointsAt(target(1000), undefined as any, 1).map((p) => p[0])).toContain(shadow);
    expect(owner.getScheduledUpdates(target(1000), 1)).toHaveLength(1);
    expect(scheduled).toHaveBeenCalled();
  });
});
