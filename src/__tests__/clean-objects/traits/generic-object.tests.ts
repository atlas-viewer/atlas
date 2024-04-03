import {
  applyGenericObjectProps,
  genericObjectDefaults,
  isGeneric,
} from '../../../clean-objects/traits/generic-object';
import { DnaFactory } from '@atlas-viewer/dna';

describe.skip('generic objects', function () {
  test('is generic', () => {
    expect(isGeneric({})).toEqual(false);
    expect(isGeneric(genericObjectDefaults('node'))).toEqual(true);
    expect(isGeneric(genericObjectDefaults('container'))).toEqual(true);
  });

  test('apply target props', () => {
    const object = genericObjectDefaults('node');

    applyGenericObjectProps(object, {
      display: { width: 100, height: 100 },
      target: { width: 100, height: 100 },
    });

    expect(object.display).toEqual({
      height: 100,
      width: 100,
      points: DnaFactory.singleBox(100, 100),
      scale: 1,
    });
  });

  test('apply target props + move target', () => {
    const object = genericObjectDefaults('node');

    applyGenericObjectProps(object, {
      display: { width: 100, height: 100 },
      target: { width: 100, height: 100 },
    });

    applyGenericObjectProps(object, {
      display: { width: 100, height: 100 },
      target: { x: 50, y: -50, width: 100, height: 100 },
    });

    expect(object.display).toEqual({
      height: 100,
      width: 100,
      points: DnaFactory.singleBox(100, 100, 50, -50),
      scale: 1,
    });
  });

  test('apply target props + change shape', () => {
    const object = genericObjectDefaults('node');

    applyGenericObjectProps(object, {
      display: { width: 100, height: 100 },
      target: { width: 100, height: 100 },
    });

    applyGenericObjectProps(object, {
      display: { width: 100, height: 150 },
      target: { width: 200, height: 300 },
    });

    expect(object.display).toEqual({
      height: 150,
      width: 100,
      points: DnaFactory.singleBox(100, 150),
      scale: 2,
    });
  });

  test('apply target props + scale', () => {
    const object = genericObjectDefaults('node');

    applyGenericObjectProps(object, {
      display: { width: 100, height: 100 },
      target: { width: 100, height: 100 },
    });

    expect(object.display).toEqual({
      height: 100,
      width: 100,
      points: DnaFactory.singleBox(100, 100),
      scale: 1,
    });

    applyGenericObjectProps(object, {
      display: { width: 100, height: 100 },
      target: { width: 200, height: 200 },
    });

    expect(object.display).toEqual({
      height: 100,
      width: 100,
      points: DnaFactory.singleBox(100, 100),
      scale: 2,
    });
  });

  test('only target', () => {
    const object = genericObjectDefaults('node');

    const u1 = applyGenericObjectProps(object, {
      target: { x: 0, y: 0, width: 100, height: 100 },
    });
    expect(u1).toEqual(true);
    expect(object.points).toEqual(DnaFactory.singleBox(100, 100));

    const u2 = applyGenericObjectProps(object, {
      target: { x: 50, y: 0, width: 100, height: 100 },
    });
    expect(u2).toEqual(true);
    expect(object.points).toEqual(DnaFactory.singleBox(100, 100, 50, 0));

    const u3 = applyGenericObjectProps(object, {
      target: { x: 50, y: 200, width: 100, height: 100 },
    });
    expect(u3).toEqual(true);
    expect(object.points).toEqual(DnaFactory.singleBox(100, 100, 50, 200));
  });

  test('crop', () => {
    const object = genericObjectDefaults('node');

    applyGenericObjectProps(object, {
      crop: { x: 50, y: 50, width: 50, height: 50 },
    });

    expect(object.node.cropped).toEqual(true);
    expect(object.node.crop).toEqual(DnaFactory.singleBox(50, 50, 50, 50));

    // Remove crop.
    applyGenericObjectProps(object, {});

    expect(object.node.cropped).toEqual(false);
  });
});
