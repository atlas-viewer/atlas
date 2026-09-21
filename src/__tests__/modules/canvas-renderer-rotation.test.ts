import { WorldObject } from '../../world-objects/world-object';
import { CanvasRenderer } from '../../modules/canvas-renderer/canvas-renderer';

// Minimal 2D affine-matrix mock of CanvasRenderingContext2D, tracking only
// the ops applyTransform() calls: save/translate/rotate.
function createMatrixCtx() {
  // [a, b, c, d, e, f] such that x' = a*x + c*y + e, y' = b*x + d*y + f
  let m = [1, 0, 0, 1, 0, 0];
  const multiply = (m1: number[], m2: number[]) => [
    m1[0] * m2[0] + m1[2] * m2[1],
    m1[1] * m2[0] + m1[3] * m2[1],
    m1[0] * m2[2] + m1[2] * m2[3],
    m1[1] * m2[2] + m1[3] * m2[3],
    m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
    m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
  ];
  return {
    save: () => {},
    restore: () => {},
    translate(x: number, y: number) {
      m = multiply(m, [1, 0, 0, 1, x, y]);
    },
    rotate(angle: number) {
      m = multiply(m, [Math.cos(angle), Math.sin(angle), -Math.sin(angle), Math.cos(angle), 0, 0]);
    },
    apply(x: number, y: number): [number, number] {
      return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    },
  };
}

describe('CanvasRenderer.applyTransform rotation pivot', () => {
  test('rotates around the box own center', () => {
    const renderer = Object.create(CanvasRenderer.prototype) as CanvasRenderer;
    const ctx = createMatrixCtx();
    (renderer as any).ctx = ctx;

    const owner = { rotation: 90 };
    const paint = { __owner: { value: owner } } as any;

    // Box at x=100,y=100 width=50 height=50 -> own center is (125, 125)
    renderer.applyTransform(paint, 100, 100, 50, 50);

    const [cx, cy] = ctx.apply(125, 125);
    expect(cx).toBeCloseTo(125);
    expect(cy).toBeCloseTo(125);

    // A point 25px to the right of center should land 25px below center after a 90deg rotation.
    const [px, py] = ctx.apply(150, 125);
    expect(px).toBeCloseTo(125);
    expect(py).toBeCloseTo(150);
  });

  test('object position edits remain absolute across rotation and repeated prop updates', () => {
    const props = { id: "rotated-object", x: 100, y: 80, width: 60, height: 40, rotation: 0 };
    const owner = WorldObject.createWithProps(props);
    for (const rotation of [45, 90, 180, 270, 0]) {
      const next = { ...props, x: 110, y: 90, rotation };
      owner.applyProps(next);
      owner.applyProps(next);
      expect(Array.from(owner.points)).toEqual([1, 110, 90, 170, 130]);
      expect(owner.rotation).toBe(rotation);
    }
  });
});
