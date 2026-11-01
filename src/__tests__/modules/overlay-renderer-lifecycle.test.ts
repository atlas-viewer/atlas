import { OverlayRenderer } from '../../modules/overlay-renderer/overlay-renderer';
import { Box } from '../../objects/box';
import { World } from '../../world';

function setup() {
  const container = document.createElement('div');
  const renderer = new OverlayRenderer(container);
  const world = new World(1000, 1000);
  const box = new Box();
  box.applyProps({
    html: true,
    interactive: false,
    relativeStyle: true,
    target: { x: 100, y: 100, width: 120, height: 80 },
    style: { border: '2px solid #488afc' },
  });
  renderer.prepareLayer(box);
  const element = box.__host.element as HTMLElement;
  const frame = (visible: boolean, x = 100, y = 100, width = 120, height = 80) => {
    renderer.beforeFrame(world, 16, world.points);
    if (visible) renderer.paint(box, 0, x, y, width, height);
    renderer.afterFrame(world, 16, world.points);
  };
  frame(true);
  return { renderer, container, box, element, frame };
}

test('disposing a visible overlay removes its host and lets subsequent frames finish', () => {
  const { renderer, container, box, element, frame } = setup();
  expect(element.parentNode).toBe(container);
  box.dispose();
  expect(() => frame(false)).not.toThrow();
  expect(element.parentNode).toBeNull();
  expect(renderer.previousVisible).toEqual([]);
  expect(() => box.dispose()).not.toThrow();
});

test('an overlay detached before frame cleanup does not stop rendering', () => {
  const { renderer, element, frame } = setup();
  element.remove();
  expect(() => frame(false)).not.toThrow();
  expect(renderer.previousVisible).toEqual([]);
});

test('highlights resize on zoom, leave the viewport, and reappear at their new position', () => {
  const { container, element, frame } = setup();
  frame(true, 50, 25, 240, 160);
  expect(element.style.transform).toBe('translate(50px, 25px)');
  expect(element.style.width).toBe('240px');
  expect(element.style.height).toBe('160px');
  frame(false);
  expect(element.parentNode).toBeNull();
  frame(true, 10, 20, 360, 240);
  expect(element.parentNode).toBe(container);
  expect(element.style.transform).toBe('translate(10px, 20px)');
  expect(element.style.width).toBe('360px');
});
