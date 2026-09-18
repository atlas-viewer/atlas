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
  test('rotates around the box own center when no cx/cy is given', () => {
    const renderer = Object.create(CanvasRenderer.prototype) as CanvasRenderer;
    const ctx = createMatrixCtx();
    (renderer as any).ctx = ctx;

    const owner = { rotation: 90 };
    const paint = { __owner: { value: owner } } as any;

    // Box at x=100,y=100 width=50 height=50 -> own center is (125, 125)
    renderer.applyTransform(paint, 100, 100, 50, 50, undefined as any, undefined as any);

    const [cx, cy] = ctx.apply(125, 125);
    expect(cx).toBeCloseTo(125);
    expect(cy).toBeCloseTo(125);

    // A point 25px to the right of center should land 25px below center after a 90deg rotation.
    const [px, py] = ctx.apply(150, 125);
    expect(px).toBeCloseTo(125);
    expect(py).toBeCloseTo(150);
  });

  test('rotates around a supplied pivot (cx, cy) instead of the box center', () => {
    const renderer = Object.create(CanvasRenderer.prototype) as CanvasRenderer;
    const ctx = createMatrixCtx();
    (renderer as any).ctx = ctx;

    const owner = { rotation: 90 };
    const paint = { __owner: { value: owner } } as any;

    // Box at x=100,y=100 width=50 height=50 (own center 125,125), but pivot is
    // the viewport center at (400, 300) -- far from the box.
    renderer.applyTransform(paint, 100, 100, 50, 50, 400, 300);

    // The pivot itself must be a fixed point of the transform.
    const [pivotX, pivotY] = ctx.apply(400, 300);
    expect(pivotX).toBeCloseTo(400);
    expect(pivotY).toBeCloseTo(300);

    // The box's own center (125,125) must rotate 90deg *around the pivot* (400,300).
    // delta = (125-400, 125-300) = (-275,-175); rotating 90deg gives (-dy, dx) = (175, -275);
    // add the pivot back: (400+175, 300-275) = (575, 25).
    const [cx, cy] = ctx.apply(125, 125);
    expect(cx).toBeCloseTo(575);
    expect(cy).toBeCloseTo(25);
  });
});
