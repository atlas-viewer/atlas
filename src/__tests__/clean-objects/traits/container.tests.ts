import {
  applyGenericObjectProps,
  constrainObjectBounds,
  genericObjectDefaults,
  getBounds,
  homePosition,
} from '../../../clean-objects/traits/generic-object';
import { append, remove, insertBefore, hideInstance } from '../../../clean-objects/traits/container';
import { dna, DnaFactory, dnaLength } from '@atlas-viewer/dna';

describe('Container', function () {
  test('adding single item to container', () => {
    const object = genericObjectDefaults('container');
    applyGenericObjectProps(object, {
      target: { x: 0, y: 0, width: 100, height: 100 },
    });

    const child = genericObjectDefaults('node');
    applyGenericObjectProps(child, {
      target: { x: 0, y: 0, width: 50, height: 50 },
    });

    append(object, child);

    // What do we want?
    expect(object.node.listPoints.slice(0, 5)).toEqual(DnaFactory.singleBox(50, 50, 0, 0));
    expect(object.node.list[0]!.points).toEqual(DnaFactory.singleBox(50, 50, 0, 0));
  });

  test('adding 2 items to container', () => {
    const object = genericObjectDefaults('container');
    applyGenericObjectProps(object, { x: 0, y: 0, width: 100, height: 100 });

    const child1 = genericObjectDefaults('node');
    applyGenericObjectProps(child1, { x: 0, y: 0, width: 50, height: 50 });
    const child2 = genericObjectDefaults('node');
    applyGenericObjectProps(child2, { x: 50, y: 0, width: 50, height: 50 });

    append(object, child1);
    append(object, child2);

    // What do we want?
    expect(object.node.listPoints.slice(0, 5)).toEqual(DnaFactory.singleBox(50, 50, 0, 0));
    expect(object.node.listPoints.slice(5, 10)).toEqual(DnaFactory.singleBox(50, 50, 50, 0));
    expect(object.node.list[0]!.points).toEqual(DnaFactory.singleBox(50, 50, 0, 0));
  });

  test('adding 2 items, removing one to container', () => {
    const object = genericObjectDefaults('container');
    applyGenericObjectProps(object, { x: 0, y: 0, width: 100, height: 100 });

    const child1 = genericObjectDefaults('node');
    applyGenericObjectProps(child1, { x: 0, y: 0, width: 50, height: 50 });
    const child2 = genericObjectDefaults('node');
    applyGenericObjectProps(child2, { x: 50, y: 0, width: 50, height: 50 });

    append(object, child1);
    append(object, child2);

    expect(object.node.listPoints[0]).toEqual(1); // visible
    expect(object.node.listPoints[5]).toEqual(1); // visible
    expect(object.node.order).toEqual([0, 1]);

    remove(object, child1);

    expect(object.node.listPoints[0]).toEqual(0); // hidden
    expect(object.node.listPoints[5]).toEqual(1); // visible
    expect(object.node.order).toEqual([1]);

    append(object, child1);

    expect(object.node.listPoints[0]).toEqual(0); // hidden
    expect(object.node.listPoints[5]).toEqual(1); // visible
    expect(object.node.listPoints[10]).toEqual(1); // visible
    expect(object.node.order).toEqual([1, 2]);
  });

  test('Insert before', () => {
    const object = genericObjectDefaults('container');
    applyGenericObjectProps(object, {
      target: { x: 0, y: 0, width: 100, height: 100 },
    });

    const child1 = genericObjectDefaults('node');
    (child1 as any).id = '1';
    applyGenericObjectProps(child1, {
      target: { x: 0, y: 0, width: 50, height: 50 },
    });
    const child2 = genericObjectDefaults('node');
    (child2 as any).id = '2';
    applyGenericObjectProps(child2, {
      target: { x: 50, y: 0, width: 50, height: 50 },
    });
    const child3 = genericObjectDefaults('node');
    (child3 as any).id = '3';
    applyGenericObjectProps(child3, {
      target: { x: 50, y: 0, width: 50, height: 50 },
    });

    append(object, child1);
    append(object, child3);
    insertBefore(object, child2, child3);

    expect(object.node.order).toEqual([0, 2, 1]);
    const itemIds = object.node.order.map((i) => object.node.list[i]!.id);
    expect(itemIds).toEqual(['1', '2', '3']);
  });

  test('Insert before (invalid)', () => {
    const object = genericObjectDefaults('container');
    applyGenericObjectProps(object, {
      target: { x: 0, y: 0, width: 100, height: 100 },
    });

    const child1 = genericObjectDefaults('node');
    (child1 as any).id = '1';
    applyGenericObjectProps(child1, {
      target: { x: 0, y: 0, width: 50, height: 50 },
    });
    const child2 = genericObjectDefaults('node');
    (child2 as any).id = '2';
    applyGenericObjectProps(child2, {
      target: { x: 50, y: 0, width: 50, height: 50 },
    });
    const child3 = genericObjectDefaults('node');
    (child3 as any).id = '3';
    applyGenericObjectProps(child3, {
      target: { x: 50, y: 0, width: 50, height: 50 },
    });

    append(object, child1);
    insertBefore(object, child2, child3);

    // 2 + 3 were not inserted, a silent fail?
    expect(object.node.order).toEqual([0]);
  });

  test('Removing by id', () => {
    const object = genericObjectDefaults('container');
    applyGenericObjectProps(object, {
      target: { x: 0, y: 0, width: 100, height: 100 },
    });

    const child1 = genericObjectDefaults('node');
    (child1 as any).id = 'child-1';
    applyGenericObjectProps(child1, {
      target: { x: 0, y: 0, width: 50, height: 50 },
    });

    append(object, child1);

    expect(object.node.list).toHaveLength(1);
    expect(object.node.list[0]?.id).toEqual('child-1');
    expect(object.node.order).toEqual([0]);
    expect(object.node.listPoints[0]).toEqual(1);

    remove(object, { id: 'child-1' } as any);

    expect(object.node.list[0]).toEqual(null);
    expect(object.node.order).toEqual([]);
    expect(object.node.listPoints[0]).toEqual(0);

    expect(() => {
      remove(object, { id: 'child-NOT_EXIST' } as any);
    }).not.toThrow();
  });

  test('append lots of items', () => {
    const object = genericObjectDefaults('container');

    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        const child = genericObjectDefaults('node');

        applyGenericObjectProps(child, {
          target: { x: x * 50, y: y * 50, width: 50, height: 50 },
        });

        append(object, child);
      }
    }

    expect(object.node.list).toHaveLength(100);
    expect(dnaLength(object.node.listPoints)).toEqual(128);
  });

  test('hide instance', () => {
    const container = genericObjectDefaults('container');
    const node = genericObjectDefaults('node');

    hideInstance(container);
    expect(container.node.hidden).toEqual(true);

    hideInstance(node);
    expect(node.node.hidden).toEqual(true);
  });

  test('Can only put into one parent', () => {
    const object1 = genericObjectDefaults('container');
    const object2 = genericObjectDefaults('container');
    const child = genericObjectDefaults('node');

    append(object1, child);
    expect(() => {
      append(object2, child);
    }).toThrow('Can only insert into one container');
  });

  test('non-container', () => {
    const object = genericObjectDefaults('node');
    const child1 = genericObjectDefaults('node');

    expect(() => append(object as any, child1)).toThrowErrorMatchingInlineSnapshot(`"Can only insert into container"`);
    expect(() => remove(object as any, child1)).toThrowErrorMatchingInlineSnapshot(`"Can only remove from container"`);
    expect(() => insertBefore(object as any, child1, child1)).toThrowErrorMatchingInlineSnapshot(
      `"Can only insert into container"`
    );
  });

  describe('getBounds', () => {
    test('single box', () => {
      const object = genericObjectDefaults('node');

      applyGenericObjectProps(object, {
        target: { x: 0, y: 0, width: 100, height: 100 },
        display: { width: 100, height: 100 },
      });

      const bounds = getBounds(object, DnaFactory.singleBox(200, 100, 0, 0));

      //  |----- 200 -----|
      //
      //  |- 100 -|
      //  ^_____ maxX    (0)
      //
      //          |- 100 -|
      //  ^_____ minX (-100)

      expect(bounds).toEqual({
        // X: (-100 – 0)
        maxX: 0,
        minX: -100,

        // Y: 0
        maxY: 0,
        minY: 0,
      });
    });
  });

  describe('constrainBounds', () => {
    test('constrain simple', () => {
      const object = genericObjectDefaults('node');

      applyGenericObjectProps(object, {
        target: { x: 0, y: 0, width: 100, height: 100 },
        display: { width: 100, height: 100 },
      });

      const [isConstrained1] = constrainObjectBounds(object, DnaFactory.singleBox(200, 100, 0, 0));
      const [isConstrained2] = constrainObjectBounds(object, DnaFactory.singleBox(200, 100, -100, 0));
      const [isConstrained3, constrain3] = constrainObjectBounds(object, DnaFactory.singleBox(200, 100, -101, 0));
      const [isConstrained4, constrain4] = constrainObjectBounds(object, DnaFactory.singleBox(200, 100, -200, 0));
      const [isConstrained5, constrain5] = constrainObjectBounds(object, DnaFactory.singleBox(200, 100, 0, -1));
      const [isConstrained6, constrain6] = constrainObjectBounds(object, DnaFactory.singleBox(200, 100, 0, 1));
      const [isConstrained7, constrain7] = constrainObjectBounds(object, DnaFactory.singleBox(200, 100, 10, 0));

      expect(isConstrained1).toEqual(false);
      expect(isConstrained2).toEqual(false);
      expect(isConstrained3).toEqual(true);
      expect(isConstrained4).toEqual(true);
      expect(isConstrained5).toEqual(true);
      expect(isConstrained6).toEqual(true);
      expect(isConstrained7).toEqual(true);

      // Constrained to the left
      expect(constrain3).toEqual(DnaFactory.singleBox(200, 100, -100, 0));
      expect(constrain4).toEqual(DnaFactory.singleBox(200, 100, -100, 0));

      // Constrained up/down
      expect(constrain5).toEqual(DnaFactory.singleBox(200, 100, 0, 0));
      expect(constrain6).toEqual(DnaFactory.singleBox(200, 100, 0, 0));

      // Constrained to the right
      expect(constrain7).toEqual(DnaFactory.singleBox(200, 100, 0, 0));
    });
  });

  describe('homePosition', () => {
    test('horizontal case', () => {
      const object = genericObjectDefaults('node');

      applyGenericObjectProps(object, {
        target: { x: 0, y: 0, width: 100, height: 100 },
        display: { width: 100, height: 100 },
      });
      // 100x100
      // Viewport: 200x100@-50,0
      // Home position: 0, -50, 0, 150, 100

      const home = homePosition(object, 2);

      expect(home).toEqual(DnaFactory.singleBox(200, 100, -50, 0));
    });
    test.skip('vertical case', () => {
      const object = genericObjectDefaults('node');

      applyGenericObjectProps(object, {
        target: { x: 0, y: 0, width: 100, height: 100 },
        display: { width: 100, height: 100 },
      });

      const home = homePosition(object, 0.5);
      const expected = DnaFactory.singleBox(100, 200, 0, -50);
      expect(home).toEqual(expected);
    });
  });
});
