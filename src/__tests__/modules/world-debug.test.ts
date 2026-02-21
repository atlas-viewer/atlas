import { World } from '../../world';

describe('World debug subscribers', () => {
  test('emits trigger, pointer and touch events', () => {
    const world = new World(100, 100);
    const events: any[] = [];

    const unsubscribe = world.addDebugSubscriber((event) => {
      events.push(event);
    });

    world.trigger('go-home', { immediate: true });
    world.propagatePointerEvent('onClick' as any, {} as any, 10, 20);
    world.propagateTouchEvent('onTouchStart', {} as any, [{ x: 1, y: 2 }]);

    expect(events.some((event) => event.type === 'trigger')).toBe(true);
    expect(events.some((event) => event.type === 'pointer')).toBe(true);
    expect(events.some((event) => event.type === 'touch')).toBe(true);

    unsubscribe();
  });
});
