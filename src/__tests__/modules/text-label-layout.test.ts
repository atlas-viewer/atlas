import { layoutTextLabel, type LabelPoint } from '../../modules/canvas-renderer/text-label-layout';

const rectangle = (x: number, y: number, w: number, h: number): LabelPoint[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];
const defaults = {
  text: 'Boston',
  points: rectangle(0, 0, 400, 300),
  viewportWidth: 400,
  viewportHeight: 300,
  lineHeight: 20,
  padding: 4,
  maxWidth: 200,
  maxLines: 3,
  measure: (text: string) => text.length * 10,
};

test('keeps text centered in the visible polygon when its original center is offscreen', () => {
  const label = layoutTextLabel({ ...defaults, points: rectangle(-1000, -1000, 1200, 1200) })!;
  expect(label).toBeDefined();
  expect(label.x - label.width / 2).toBeGreaterThan(0);
  expect(label.y - label.height / 2).toBeGreaterThan(0);
  expect(label.x + label.width / 2).toBeLessThan(200);
});

test('fits the entire text rectangle around polygon holes', () => {
  const label = layoutTextLabel({ ...defaults, holes: [rectangle(100, 80, 200, 140)] })!;
  expect(label).toBeDefined();
  expect(
    label.y + label.height / 2 < 80 ||
      label.y - label.height / 2 > 220 ||
      label.x + label.width / 2 < 100 ||
      label.x - label.width / 2 > 300
  ).toBe(true);
});

test('places text in a concave polygon without spanning its notch', () => {
  const points: LabelPoint[] = [
    [0, 0],
    [300, 0],
    [300, 60],
    [60, 60],
    [60, 300],
    [0, 300],
  ];
  const label = layoutTextLabel({ ...defaults, points })!;
  expect(label.y + label.height / 2).toBeLessThan(60);
});

test('wraps within maxWidth and hides text when there is insufficient space', () => {
  const label = layoutTextLabel({ ...defaults, text: 'East Boston Harbor', maxWidth: 80 })!;
  expect(label.lines).toEqual(['East', 'Boston', 'Harbor']);
  expect(layoutTextLabel({ ...defaults, points: rectangle(0, 0, 20, 20) })).toBeUndefined();
  expect(layoutTextLabel({ ...defaults, text: 'East Boston Harbor', maxWidth: 80, maxLines: 1 })).toBeUndefined();
});

test('line placement clips to the viewport, remains upright, and handles two-point lines', () => {
  const a = layoutTextLabel({
    ...defaults,
    open: true,
    points: [
      [-500, 150],
      [900, 150],
    ],
  })!;
  const b = layoutTextLabel({
    ...defaults,
    open: true,
    points: [
      [900, 150],
      [-500, 150],
    ],
  })!;
  expect(a.x).toBeCloseTo(200);
  expect(b.x).toBeCloseTo(a.x);
  expect(a.angle).toBe(0);
  expect(b.angle).toBe(0);
  expect(
    layoutTextLabel({
      ...defaults,
      open: true,
      points: [
        [0, 0],
        [10, 0],
      ],
    })
  ).toBeUndefined();
  expect(
    layoutTextLabel({
      ...defaults,
      open: true,
      points: [
        [0, -20],
        [400, -20],
      ],
    })
  ).toBeUndefined();
});
