import { applyGenericObjectProps, genericObjectDefaults } from '../../clean-objects/traits/generic-object';
import { append, remove, insertBefore } from '../../clean-objects/traits/container';
import { DnaFactory } from '@atlas-viewer/dna';

describe.only('Container', function () {
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
    applyGenericObjectProps(object, {
      target: { x: 0, y: 0, width: 100, height: 100 },
    });

    const child1 = genericObjectDefaults('node');
    applyGenericObjectProps(child1, {
      target: { x: 0, y: 0, width: 50, height: 50 },
    });
    const child2 = genericObjectDefaults('node');
    applyGenericObjectProps(child2, {
      target: { x: 50, y: 0, width: 50, height: 50 },
    });

    append(object, child1);
    append(object, child2);

    // What do we want?
    expect(object.node.listPoints.slice(0, 5)).toEqual(DnaFactory.singleBox(50, 50, 0, 0));
    expect(object.node.listPoints.slice(5, 10)).toEqual(DnaFactory.singleBox(50, 50, 50, 0));
    expect(object.node.list[0]!.points).toEqual(DnaFactory.singleBox(50, 50, 0, 0));
  });

  test('adding 2 items, removing one to container', () => {
    const object = genericObjectDefaults('container');
    applyGenericObjectProps(object, {
      target: { x: 0, y: 0, width: 100, height: 100 },
    });

    const child1 = genericObjectDefaults('node');
    applyGenericObjectProps(child1, {
      target: { x: 0, y: 0, width: 50, height: 50 },
    });
    const child2 = genericObjectDefaults('node');
    applyGenericObjectProps(child2, {
      target: { x: 50, y: 0, width: 50, height: 50 },
    });

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
    expect(object.node.list[0]!.id).toEqual('child-1');
    expect(object.node.order).toEqual([0]);
    expect(object.node.listPoints[0]).toEqual(1);

    remove(object, { id: 'child-1' } as any);

    expect(object.node.list[0]!).toEqual(null);
    expect(object.node.order).toEqual([]);
    expect(object.node.listPoints[0]).toEqual(0);

    expect(() => {
      remove(object, { id: 'child-NOT_EXIST' } as any);
    }).not.toThrow();
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
});
