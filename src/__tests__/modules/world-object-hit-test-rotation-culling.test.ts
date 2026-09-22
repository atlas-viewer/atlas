import { dna, DnaFactory, Strand } from '@atlas-viewer/dna';
import { WorldObject, HitTestCullingDebugEvent } from '../../world-objects/world-object';
function forwardRenderPosition(cx: number, cy: number, x: number, y: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + (dx * cos - dy * sin), y: cy + (dx * sin + dy * cos) };
}

describe('WorldObject#debugHitTestCulling hook', () => {
  afterEach(() => {
    WorldObject.debugHitTestCulling = undefined;
  });

  test('does not fire for an unrotated object', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 0, y: 0, width: 200, height: 100, rotation: 0 });
    const events: HitTestCullingDebugEvent[] = [];
    WorldObject.debugHitTestCulling = (event) => events.push(event);

    owner.getObjectsAt(DnaFactory.singleBox(1, 1, 50, 25));

    expect(events).toEqual([]);
  });

  test('fires for a rotated object and reports the target rotated into local space', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 0, y: 0, width: 200, height: 100, rotation: 87 });
    const events: HitTestCullingDebugEvent[] = [];
    WorldObject.debugHitTestCulling = (event) => events.push(event);

    const rendered = forwardRenderPosition(100, 50, 100, 50, 87);
    const target = DnaFactory.singleBox(1, 1, rendered.x, rendered.y);
    owner.getObjectsAt(target);

    expect(events.length).toBe(1);
    expect(Array.from(events[0].rawTarget)).toEqual(Array.from(target));
    expect(events[0].culled).toBe(false);
  });
});

describe('WorldObject#getObjectsAt hit-testing a rotated object around its own center', () => {
  afterEach(() => {
    WorldObject.debugHitTestCulling = undefined;
  });

  test('a click at the object\'s true rendered position registers as a hit', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 0, y: 0, width: 200, height: 100, rotation: 87 });

    const leaf = { points: dna([1, 0, 0, 200, 100]) } as any;
    (owner as any).layers = [leaf];

    const centerX = 190;
    const centerY = 50;
    const rendered = forwardRenderPosition(100, 50, centerX, centerY, 87);

    const events: HitTestCullingDebugEvent[] = [];
    WorldObject.debugHitTestCulling = (event) => events.push(event);

    const target = DnaFactory.singleBox(1, 1, rendered.x, rendered.y);
    const result = owner.getObjectsAt(target);

    expect(events[0].culled).toBe(false);
    expect(result.length).toBe(1);
  });

  test('a click at the object\'s raw un-rotated position misses, outside the rotated rectangle', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 0, y: 0, width: 200, height: 100, rotation: 87 });

    const leaf = { points: dna([1, 0, 0, 200, 100]) } as any;
    (owner as any).layers = [leaf];

    const events: HitTestCullingDebugEvent[] = [];
    WorldObject.debugHitTestCulling = (event) => events.push(event);
    const target = DnaFactory.singleBox(1, 1, 190, 50);
    const result = owner.getObjectsAt(target);

    expect(events[0].culled).toBe(true);
    expect(result.length).toBe(0);
  });

  test('a target genuinely nowhere near the object, rotated or not, is still culled', () => {
    const owner = WorldObject.createWithProps({ id: 'a', x: 0, y: 0, width: 200, height: 100, rotation: 87 });

    const leaf = { points: dna([1, 0, 0, 200, 100]) } as any;
    (owner as any).layers = [leaf];

    const events: HitTestCullingDebugEvent[] = [];
    WorldObject.debugHitTestCulling = (event) => events.push(event);

    const target = DnaFactory.singleBox(1, 1, 999999, 999999);
    const result = owner.getObjectsAt(target);

    expect(events[0].culled).toBe(true);
    expect(result.length).toBe(0);
  });
});
describe('WorldObject#getObjectsAt reaches a offset descendant through unrotated ancestors', () => {
  afterEach(() => {
    WorldObject.debugHitTestCulling = undefined;
  });
  function makeOffsetFixture() {
    const rotated = WorldObject.createWithProps({ id: 'rotated', x: -80, y: -80, width: 200, height: 100, rotation: 90 });
    const leaf = { points: dna([1, 0, 0, 200, 100]), getObjectsAt: () => [] } as any;
    (rotated as any).layers = [leaf];

    const inner = WorldObject.createWithProps({ id: 'inner', x: 0, y: 0, width: 200, height: 100 });
    (inner as any).layers = [rotated];

    const outer = WorldObject.createWithProps({ id: 'outer', x: 0, y: 0, width: 200, height: 100 });
    (outer as any).layers = [inner];

    return { outer, inner, rotated, leaf };
  }

  test('a click at the offset descendant\'s own center reaches it through two stale-bounds ancestors', () => {
    const { outer, rotated } = makeOffsetFixture();
    const centerX = (rotated.points[1] + rotated.points[3]) / 2;
    const centerY = (rotated.points[2] + rotated.points[4]) / 2;
    expect(centerY).toBeLessThan(0); // sanity: genuinely outside the stale ancestor bounds

    const events: HitTestCullingDebugEvent[] = [];
    WorldObject.debugHitTestCulling = (event) => events.push(event);

    const target = DnaFactory.singleBox(1, 1, centerX, centerY);
    const result = outer.getObjectsAt(target, true);

    expect(result.length).toBeGreaterThan(0);
    expect(events.some((e) => e.ownerId === 'outer' && e.culled === false)).toBe(true);
  });

  test('a click genuinely outside even the widened bounds is still culled at the outer ancestor', () => {
    const { outer } = makeOffsetFixture();

    const events: HitTestCullingDebugEvent[] = [];
    WorldObject.debugHitTestCulling = (event) => events.push(event);
    const target = DnaFactory.singleBox(1, 1, 999999, 999999);
    const result = outer.getObjectsAt(target, true);

    expect(result.length).toBe(0);
    expect(events.some((e) => e.ownerId === 'outer' && e.culled === true)).toBe(true);
  });
});
