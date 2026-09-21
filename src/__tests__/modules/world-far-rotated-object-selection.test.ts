import { dna } from '@atlas-viewer/dna';
import { World } from '../../world';
import { WorldObject } from '../../world-objects/world-object';

function makeRotatedTopLevelObject(id: string, x: number, width: number) {
  const object = WorldObject.createWithProps({ id, x, y: 0, width, height: 400, rotation: 90 });
  return object;
}

describe('World#getObjectsAt / getScheduledUpdates keep a rotated top-level object candidate even when its raw bounds miss target', () => {
  test('getObjectsAt still returns a rotated object whose raw world bounds no longer overlap target', () => {
    const world = new World();
    const near = WorldObject.createWithProps({ id: 'near', x: 0, y: 0, width: 400, height: 400, rotation: 0 });
    const far = makeRotatedTopLevelObject('far', 2451, 2411);
    world.appendChild(near);
    world.appendChild(far);
    const target = dna([1, 100, 100, 300, 300]);

    const result = world.getObjectsAt(target, true);
    const ids = result.map(([owner]) => owner.id);

    expect(ids).toContain('near');
    expect(ids).toContain('far');
  });

  test('getScheduledUpdates still schedules a rotated object whose raw world bounds no longer overlap target', () => {
    const world = new World();
    const far = makeRotatedTopLevelObject('far', 2451, 2411);
    let scheduled = false;
    (far as any).getScheduledUpdates = () => {
      scheduled = true;
      return [];
    };
    world.appendChild(far);

    const target = dna([1, 100, 100, 300, 300]);
    world.getScheduledUpdates(target, 1);

    expect(scheduled).toBe(true);
  });

  test('an unrotated object with no rotation anywhere in its subtree is still excluded when genuinely off-screen', () => {
    const world = new World();
    const near = WorldObject.createWithProps({ id: 'near', x: 0, y: 0, width: 400, height: 400, rotation: 0 });
    const farUnrotated = WorldObject.createWithProps({
      id: 'far-unrotated',
      x: 2451,
      y: 0,
      width: 2411,
      height: 400,
      rotation: 0,
    });
    world.appendChild(near);
    world.appendChild(farUnrotated);

    const target = dna([1, 100, 100, 300, 300]);
    const result = world.getObjectsAt(target, true);
    const ids = result.map(([owner]) => owner.id);
    expect(ids).toContain('near');
    expect(ids).not.toContain('far-unrotated');
  });
});
