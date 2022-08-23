import { Box } from './objects/box';
import { Container } from './objects/container';
import { World } from './objects/world';
import { getAllPointsAt } from './traits/paintable';
import { compose, DnaFactory, scale, transform, translate } from '@atlas-viewer/dna';
import { createElement } from './helpers/dom';
import { hasStyles } from './traits/has-styles';
import { StyledContainer } from './objects/styled-container';

console.log('Hello demo.');

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

const box2 = Box.create();
Box.applyProps(box2, {
  width: 70,
  height: 100,
  x: 50,
  y: 50,
  style: { background: 'blue' },
});

StyledContainer.append(container, box);
StyledContainer.append(container, box2);
World.append(world, container);

console.log(world);

const scaleFactor = 1;
const target = DnaFactory.singleBox(320, 320, -50, -50);

const $world = document.getElementById('world')!;
$world.style.position = 'relative';
$world.style.background = '#000';
$world.style.height = `320px`;
$world.style.width = `320px`;

// The goal for this scratch file: render the world once.
const translation = compose(scale(scaleFactor), translate(-target[1], -target[2]));
const worldTarget = transform(target, translation);

const points = getAllPointsAt(world, worldTarget, 1, { aggregate: translation });

const parentStack = [$world];
const parentStackItem: any[] = [world];
let lastItem;
let $lastDom;
const STRATEGY = 0;
for (let i = 0; i < points.length; i++) {
  const paint = points[i][0];
  const point = points[i][1];
  const transformation = points[i][2];

  if (transformation) {
    // Creating host.
    const $div = createElement('div');
    $div.style.position = 'absolute';

    // Updating styles (if changed)
    if (hasStyles(paint)) {
      Object.assign($div.style, paint.style.rules);
    }

    // Updating position.
    const p = transform(point, transformation);
    $div.style.transform = `translate(${p[1]}px, ${p[2]}px)`;
    $div.style.width = `${p[3] - p[1]}px`;
    $div.style.height = `${p[4] - p[2]}px`;

    // Mounting host.
    // This would likely be a helper to get parentHostNode

    if (STRATEGY === 0) {
      parentStack[parentStack.length - 1].appendChild($div);
      if (paint.node.type === 'container') {
        parentStack.push($div);
      }
    } else {
      let key = parentStack.length - 1;
      while (key >= 0) {
        if (paint.node.parent !== parentStackItem[key]) {
          parentStack.splice(-1, 1);
          parentStackItem.splice(-1, 1);
          key--;
          continue;
        }

        const $dom = parentStack[key];
        const item = parentStackItem[key];

        if ($lastDom && lastItem && lastItem.node.parent === item) {
          $lastDom.after($div);
        } else {
          $dom.appendChild($div);
        }

        // parentStack[parentStack.length - (paint.node.type === 'node' ? 1 : 2)].appendChild($div);
        break;
      }

      // This is just for this demo.
      if (paint.node.type === 'container') {
        parentStackItem.push(paint);
        parentStack.push($div);
      } else {
        lastItem = paint;
        $lastDom = $div;
      }
    }
  }
}
