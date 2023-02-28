import { Inpsector } from './index';
import { World } from '../objects/world';
import { StyledContainer } from '../objects/styled-container';
import { Box } from '../objects/box';
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { runContainerTransitions } from '../traits/transitional-container';
import { AnimatedBox } from '../objects/animated-box';

const world = World.create();
World.applyProps(world, {
  height: 300,
  width: 300,
});

const container = StyledContainer.create();
StyledContainer.applyProps(container, {
  width: 200,
  height: 200,
  style: { background: '#333' },
});

const box = Box.create();
Box.applyProps(box, {
  width: 100,
  height: 100,
  style: { background: 'red', border: '2px solid green' },
});

const box2 = AnimatedBox.create();
AnimatedBox.applyProps(box2, {
  width: 70,
  height: 100,
  x: 50,
  y: 50,
  style: { background: 'blue' },
  transition: 'display 1000ms linear',
});

StyledContainer.append(container, box);
StyledContainer.append(container, box2);
World.append(world, container);

const frame = (delta: number) => {
  runContainerTransitions(world, delta);
  requestAnimationFrame(frame);
};

frame(0);

const root = createRoot(document.getElementById('inspector')!);
// Render inspector.
root.render(createElement(Inpsector, { container: world }));
