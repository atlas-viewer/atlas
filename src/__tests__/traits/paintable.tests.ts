import { getAllPointsAt, getObjectsAt, isPaintable } from '../../clean-objects/traits/paintable';
import { applyGenericObjectProps, genericObjectDefaults } from '../../clean-objects/traits/generic-object';
import { DnaFactory } from '@atlas-viewer/dna';
import { eventsDefaults } from '../../clean-objects/traits/evented';
import { append, insertBefore } from '../../clean-objects/traits/container';

describe('Paintable', function () {
  describe('getObjectsAt', () => {
    test('getObjectsAt in node', () => {
      const object = { ...genericObjectDefaults('node'), ...eventsDefaults() };

      expect(isPaintable(object)).toEqual(true);

      applyGenericObjectProps(object, {
        target: { x: 0, y: 0, width: 100, height: 100 },
      });

      expect(getObjectsAt(object, DnaFactory.singleBox(500, 500, 0, 0))).toHaveLength(1);

      expect(getObjectsAt(object, DnaFactory.singleBox(500, 500, 200, 200))).toHaveLength(0);
    });

    test('getObjectsAt in container', () => {
      const object1 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const object2 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const container = { ...genericObjectDefaults('container'), ...eventsDefaults() };

      applyGenericObjectProps(object1, {
        target: { x: 0, y: 0, width: 100, height: 100 },
      });
      applyGenericObjectProps(object2, {
        target: { x: 100, y: 0, width: 100, height: 100 },
      });

      append(container, object1);
      expect(container.points).toEqual(object1.points);

      append(container, object2);

      expect(getObjectsAt(container, DnaFactory.singleBox(200, 200, 0, 0))).toHaveLength(2);
      expect(getObjectsAt(container, DnaFactory.singleBox(200, 200, 100, 0))).toHaveLength(1);
      expect(getObjectsAt(container, DnaFactory.singleBox(200, 200, 200, 0))).toHaveLength(0);
    });

    test('getObjectsAt in container (lazy)', () => {
      const object1 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const object2 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const container = { ...genericObjectDefaults('container'), ...eventsDefaults() };
      // Set lazy.
      container.node.lazy = true;

      applyGenericObjectProps(object1, { target: { x: 0, y: 0, width: 100, height: 100 } });
      applyGenericObjectProps(object2, { target: { x: 100, y: 0, width: 100, height: 100 } });

      append(container, object1);
      append(container, object2);

      expect(getObjectsAt(container, DnaFactory.singleBox(200, 200, 0, 0))).toHaveLength(1);
      expect(getObjectsAt(container, DnaFactory.singleBox(200, 200, 100, 0))).toHaveLength(1);
      expect(getObjectsAt(container, DnaFactory.singleBox(200, 200, 200, 0))).toHaveLength(0);

      // Testing recursion.
      {
        const target = DnaFactory.singleBox(200, 200, 0, 0);
        const top = getObjectsAt(container, target);
        expect(getObjectsAt(top[0], target, { loadLazy: true })).toHaveLength(2);
      }
    });

    test('ordered items', () => {
      const container = { ...genericObjectDefaults('container'), ...eventsDefaults() };
      const object1 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const object2 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const object3 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const object4 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      container.node.ordered = true;

      // 2x2 grid.
      applyGenericObjectProps(object1, { target: { x: 0, y: 0, width: 100, height: 100 } });
      applyGenericObjectProps(object2, { target: { x: 100, y: 0, width: 100, height: 100 } });
      applyGenericObjectProps(object3, { target: { x: 0, y: 100, width: 100, height: 100 } });
      applyGenericObjectProps(object4, { target: { x: 100, y: 100, width: 100, height: 100 } });

      // Insert.
      append(container, object1);
      append(container, object3);
      append(container, object4);
      insertBefore(container, object2, object3);

      // Check order.
      const q1 = getObjectsAt(container, DnaFactory.singleBox(200, 200, 0, 0));
      expect(q1[0]).toEqual(object1);
      expect(q1[1]).toEqual(object2);
      expect(q1[2]).toEqual(object3);
      expect(q1[3]).toEqual(object4);
      expect(q1[4]).not.toBeDefined();

      const q2 = getObjectsAt(container, DnaFactory.singleBox(100, 200, 0, 0));
      expect(q2[0]).toEqual(object1);
      expect(q2[1]).toEqual(object3);
      expect(q2[2]).not.toBeDefined();

      const q3 = getObjectsAt(container, DnaFactory.singleBox(200, 100, 0, 0));
      expect(q3[0]).toEqual(object1);
      expect(q3[1]).toEqual(object2);
      expect(q3[2]).not.toBeDefined();

      const q4 = getObjectsAt(container, DnaFactory.singleBox(200, 100, 0, 100));
      expect(q4[0]).toEqual(object3);
      expect(q4[1]).toEqual(object4);
      expect(q4[2]).not.toBeDefined();
    });

    test('zones items', () => {
      // 2 zones, modelling the rows.
      const zone1 = { ...genericObjectDefaults('container'), ...eventsDefaults() };
      const zone2 = { ...genericObjectDefaults('container'), ...eventsDefaults() };

      const container = { ...genericObjectDefaults('container'), ...eventsDefaults() };
      const object1 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const object2 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const object3 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const object4 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      container.node.ordered = true;

      zone1.node.zone = true;
      zone2.node.zone = true;

      // 2x2 grid.
      applyGenericObjectProps(object1, { target: { x: 0, y: 0, width: 100, height: 100 } });
      applyGenericObjectProps(object2, { target: { x: 100, y: 0, width: 100, height: 100 } });
      applyGenericObjectProps(object3, { target: { x: 0, y: 100, width: 100, height: 100 } });
      applyGenericObjectProps(object4, { target: { x: 100, y: 100, width: 100, height: 100 } });

      // Zone size.
      applyGenericObjectProps(zone1, { target: { x: 0, y: 0, width: 200, height: 100 } });
      applyGenericObjectProps(zone2, { target: { x: 0, y: 100, width: 200, height: 100 } });

      // Insert.
      append(container, object1);
      append(container, object2);
      append(container, object3);
      append(container, object4);
      // Zone 1.
      append(zone1, object1);
      append(zone1, object2);
      // Zone 2.
      append(zone2, object3);
      append(zone2, object4);

      expect(zone1.node.list).toContain(object1);
      expect(zone1.node.list).toContain(object2);
      expect(zone2.node.list).toContain(object3);
      expect(zone2.node.list).toContain(object4);

      const q1 = getObjectsAt(container, DnaFactory.singleBox(200, 200, 0, 0), {
        zone: zone1,
      });
      expect(q1).toContain(object1);
      expect(q1).toContain(object2);

      const q2 = getObjectsAt(container, DnaFactory.singleBox(200, 200, 0, 0), {
        zone: zone2,
      });
      expect(q2).toEqual([object3, object4]);

      // Now we move one, and check again.
      applyGenericObjectProps(object1, { target: { x: 1000, y: 0, width: 100, height: 100 } });
      const q3 = getObjectsAt(container, DnaFactory.singleBox(200, 200, 0, 0), {
        zone: zone1,
      });
      expect(q3).toEqual([object2]);
    });

    test('zones items as structure', () => {
      // 2 zones, modelling the rows.
      const zone1 = { ...genericObjectDefaults('container'), ...eventsDefaults() };
      const zone2 = { ...genericObjectDefaults('container'), ...eventsDefaults() };

      const container = { ...genericObjectDefaults('container'), ...eventsDefaults() };
      const object1 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const object2 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const object3 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const object4 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      container.node.ordered = true;

      zone1.node.zone = true;
      zone2.node.zone = true;

      // 2x2 grid.
      applyGenericObjectProps(object1, { target: { x: 0, y: 0, width: 100, height: 100 } });
      applyGenericObjectProps(object2, { target: { x: 100, y: 0, width: 100, height: 100 } });
      applyGenericObjectProps(object3, { target: { x: 0, y: 100, width: 100, height: 100 } });
      applyGenericObjectProps(object4, { target: { x: 100, y: 100, width: 100, height: 100 } });
      // Zone size.
      applyGenericObjectProps(zone1, { target: { x: 0, y: 0, width: 200, height: 100 } });
      applyGenericObjectProps(zone2, { target: { x: 0, y: 100, width: 200, height: 100 } });

      // Zone 1.
      append(zone1, object1);
      append(zone1, object2);
      // Zone 2.
      append(zone2, object3);
      append(zone2, object4);

      // Zones have to be appended first.
      append(container, zone1);
      append(container, zone2);

      expect(zone1.node.list).toContain(object1);
      expect(zone1.node.list).toContain(object2);
      expect(zone2.node.list).toContain(object3);
      expect(zone2.node.list).toContain(object4);

      const fullTarget = DnaFactory.singleBox(200, 200, 0, 0);

      expect(getObjectsAt(zone1, fullTarget)).toContain(object1);
      expect(getObjectsAt(zone1, fullTarget)).toContain(object2);

      const q1 = getObjectsAt(container, DnaFactory.singleBox(200, 200, 0, 0), {
        zone: zone1,
      });
      expect(q1).toContain(object1);
      expect(q1).toContain(object2);

      const q2 = getObjectsAt(container, DnaFactory.singleBox(200, 200, 0, 0), {
        zone: zone2,
      });
      expect(q2).toEqual([object3, object4]);

      // Now we move one, and check again.
      applyGenericObjectProps(object1, { target: { x: 1000, y: 0, width: 100, height: 100 } });
      const q3 = getObjectsAt(container, DnaFactory.singleBox(200, 200, 0, 0), {
        zone: zone1,
      });
      expect(q3).toEqual([object2]);
    });

    test('manually hiding with objects', () => {
      const object1 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const object2 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const container = { ...genericObjectDefaults('container'), ...eventsDefaults() };

      applyGenericObjectProps(object1, { target: { x: 0, y: 0, width: 100, height: 100 } });
      applyGenericObjectProps(object2, { target: { x: 100, y: 0, width: 100, height: 100 } });

      append(container, object1);
      append(container, object2);

      expect(container.node.listPoints.subarray(0, 5)).toStrictEqual(object1.points);
      expect(container.node.listPoints.subarray(5, 10)).toStrictEqual(object2.points);

      object1.node.hidden = true;
      object2.node.hidden = true;

      const full = DnaFactory.singleBox(200, 200, 0, 0);

      expect(getObjectsAt(container, full)).toEqual([]);
    });
  });

  describe('getAllPointsAt', () => {
    test('single object simple', () => {
      const object1 = { ...genericObjectDefaults('node'), ...eventsDefaults() };

      applyGenericObjectProps(object1, { target: { x: 0, y: 0, width: 100, height: 100 } });

      const full = DnaFactory.singleBox(200, 200, 0, 0);

      const [paints] = getAllPointsAt(object1, full, 1);
      expect(paints[0]).toEqual(object1);
    });

    test('single object scaled', () => {
      const object1 = { ...genericObjectDefaults('node'), ...eventsDefaults() };

      applyGenericObjectProps(object1, {
        target: { x: 0, y: 0, width: 100, height: 100 },
        display: { width: 200, height: 200 },
      });

      const full = DnaFactory.singleBox(200, 200, 0, 0);

      const [paints] = getAllPointsAt(object1, full, 1);
      expect(paints[0]).toEqual(object1);
    });

    test('container with single item', () => {
      const object1 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const container = { ...genericObjectDefaults('container'), ...eventsDefaults() };

      applyGenericObjectProps(object1, { target: { x: 0, y: 0, width: 100, height: 100 } });

      append(container, object1);

      const full = DnaFactory.singleBox(200, 200, 0, 0);

      const all = getAllPointsAt(container, full, 1);
      const [paints] = all;

      expect(all).toHaveLength(1);
      expect(paints[0]).toEqual(object1);
      expect(paints[1]).toEqual(DnaFactory.singleBox(100, 100, 0, 0));
    });

    test('container with single item translated', () => {
      const object1 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const container = { ...genericObjectDefaults('container'), ...eventsDefaults() };

      applyGenericObjectProps(object1, { target: { x: 0, y: 0, width: 100, height: 100 } });

      append(container, object1);

      const full = DnaFactory.singleBox(200, 200, 100, 0);

      const all = getAllPointsAt(container, full, 1);
      const [paints] = all;

      expect(all).toHaveLength(1);
      expect(paints[0]).toEqual(object1);
      expect(paints[1]).toEqual(DnaFactory.singleBox(100, 100, 0, 0));
    });

    test('container with 2 items', () => {
      const object1 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const object2 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const container = { ...genericObjectDefaults('container'), ...eventsDefaults() };

      applyGenericObjectProps(object1, { target: { x: 0, y: 0, width: 100, height: 100 } });
      applyGenericObjectProps(object2, { target: { x: 100, y: 0, width: 100, height: 100 } });

      append(container, object1);
      append(container, object2);

      const full = DnaFactory.singleBox(200, 200, 0, 0);

      const all = getAllPointsAt(container, full, 1);
      const [paintA, paintB] = all;

      expect(all).toHaveLength(2);
      expect(paintA[0]).toEqual(object1);
      expect(paintB[0]).toEqual(object2);
    });

    test('container with ordered items', () => {
      const container = { ...genericObjectDefaults('container'), ...eventsDefaults() };
      const object1 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const object2 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const object3 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      const object4 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
      container.node.ordered = true;

      // 2x2 grid.
      applyGenericObjectProps(object1, { target: { x: 0, y: 0, width: 100, height: 100 } });
      applyGenericObjectProps(object2, { target: { x: 100, y: 0, width: 100, height: 100 } });
      applyGenericObjectProps(object3, { target: { x: 0, y: 100, width: 100, height: 100 } });
      applyGenericObjectProps(object4, { target: { x: 100, y: 100, width: 100, height: 100 } });

      // Insert.
      append(container, object1);
      append(container, object3);
      append(container, object4);
      insertBefore(container, object2, object3);

      {
        const full = DnaFactory.singleBox(200, 200, 0, 0);
        const all = getAllPointsAt(container, full, 1);
        const [paintA, paintB, paintC, paintD] = all;

        expect(all).toHaveLength(4);

        expect(paintA[0]).toEqual(object1);
        expect(paintA[1][0]).toEqual(1);

        expect(paintB[0]).toEqual(object2);
        expect(paintB[1][0]).toEqual(1);

        expect(paintC[0]).toEqual(object3);
        expect(paintC[1][0]).toEqual(1);

        expect(paintD[0]).toEqual(object4);
        expect(paintD[1][0]).toEqual(1);
      }
      {
        const full = DnaFactory.singleBox(100, 200, 0, 0);
        const all = getAllPointsAt(container, full, 1);
        const [paintA, paintB, paintC, paintD] = all;

        expect(paintA[0]).toEqual(object1);
        expect(paintA[1][0]).toEqual(1);

        expect(paintB[0]).toEqual(object2);
        expect(paintB[1][0]).toEqual(1);

        expect(paintC[0]).toEqual(object3);
        expect(paintC[1][0]).toEqual(1);

        expect(paintD[0]).toEqual(object4);
        expect(paintD[1][0]).toEqual(1);
      }
      {
        const full = DnaFactory.singleBox(200, 100, 0, 0);
        const all = getAllPointsAt(container, full, 1);
        const [paintA, paintB, paintC, paintD] = all;

        expect(paintA[0]).toEqual(object1);
        expect(paintA[1][0]).toEqual(1);

        expect(paintB[0]).toEqual(object2);
        expect(paintB[1][0]).toEqual(1);

        expect(paintC[0]).toEqual(object3);
        expect(paintC[1][0]).toEqual(1);

        expect(paintD[0]).toEqual(object4);
        expect(paintD[1][0]).toEqual(1);
      }
      {
        const full = DnaFactory.singleBox(200, 100, 100, 0);
        const all = getAllPointsAt(container, full, 1);
        const [paintA, paintB, paintC, paintD] = all;

        expect(paintA[0]).toEqual(object1);
        expect(paintA[1][0]).toEqual(1);

        expect(paintB[0]).toEqual(object2);
        expect(paintB[1][0]).toEqual(1);

        expect(paintC[0]).toEqual(object3);
        expect(paintC[1][0]).toEqual(1);

        expect(paintD[0]).toEqual(object4);
        expect(paintD[1][0]).toEqual(1);
      }
    });
  });
});
