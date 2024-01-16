import {
  addEventListener,
  removeEventListener,
  eventsDefaults,
  dispatchEvent,
  applyEventProps,
  propagateEvent,
  propagatePointerEvent,
  propagateTouchEvent,
} from '../../../clean-objects/traits/evented';
import { applyGenericObjectProps, genericObjectDefaults } from '../../../clean-objects/traits/generic-object';
import { append } from '../../../clean-objects/traits/container';

describe('evented trait', function () {
  test('addEventListener', () => {
    const exampleEvented = eventsDefaults();

    function clickCb() {}
    addEventListener(exampleEvented, 'click', clickCb);

    expect(exampleEvented.events.handlers.onClick).toHaveLength(1);
    expect(exampleEvented.events.handlers.onClick[0].listener).toEqual(clickCb);
    expect(exampleEvented.events.handlers.onClick[0].options).toEqual(undefined);

    expect(() => {
      addEventListener(exampleEvented, 'nope' as any, clickCb);
    }).toThrowErrorMatchingInlineSnapshot(`"Unknown event nope"`);
  });

  test('removeEventListener', () => {
    const exampleEvented = eventsDefaults();

    function clickCb() {}
    addEventListener(exampleEvented, 'click', clickCb);
    function clickCb2() {}
    addEventListener(exampleEvented, 'click', clickCb2);

    expect(exampleEvented.events.handlers.onClick).toHaveLength(2);

    removeEventListener(exampleEvented, 'click', clickCb2);

    expect(exampleEvented.events.handlers.onClick).toHaveLength(1);

    expect(() => {
      removeEventListener(exampleEvented, 'nope' as any, clickCb);
    }).toThrowErrorMatchingInlineSnapshot(`"Unknown event nope"`);
  });

  test('dispatchEvent', () => {
    const exampleEvented = eventsDefaults();

    const clickCb = vitest.fn();
    addEventListener(exampleEvented, 'click', clickCb);

    expect(dispatchEvent(exampleEvented, 'click', {}, false)).toEqual(true);
    expect(clickCb).toHaveBeenCalled();
  });

  test('dispatchEvent (capture=true)', () => {
    const exampleEvented = eventsDefaults();

    const captureCb = vitest.fn();
    addEventListener(exampleEvented, 'click', captureCb, { capture: true });
    const clickCb = vitest.fn();
    addEventListener(exampleEvented, 'click', clickCb, { capture: false });

    expect(dispatchEvent(exampleEvented, 'click', {}, true)).toEqual(true);
    expect(captureCb).toHaveBeenCalled();
    expect(clickCb).not.toHaveBeenCalled();
  });

  test('dispatchEvent with errors', () => {
    const exampleEvented = eventsDefaults();

    const before = vitest.fn();
    const error = () => {
      throw new Error();
    };
    const after = vitest.fn();
    console.error = vitest.fn();

    addEventListener(exampleEvented, 'click', before);
    addEventListener(exampleEvented, 'click', error);
    addEventListener(exampleEvented, 'click', after);

    // Then dispatch
    expect(dispatchEvent(exampleEvented, 'click', {})).toEqual(true);
    expect(before).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
    expect(after).toHaveBeenCalled();
  });

  test('applying props', () => {
    const exampleEvents = eventsDefaults();

    const wheel = vitest.fn();
    const first = vitest.fn();

    applyEventProps(exampleEvents, {
      onClick: first,
      onWheel: wheel,
    });

    expect(exampleEvents.events.handlers.onClick).toHaveLength(1);
    expect(exampleEvents.events.handlers.onWheel).toHaveLength(1);

    const second = vitest.fn();
    applyEventProps(exampleEvents, {
      onClick: second,
    });

    expect(exampleEvents.events.handlers.onClick).toHaveLength(1);
    expect(exampleEvents.events.handlers.onWheel).toHaveLength(0);
  });

  test('pointer event - hit', () => {
    const object = { ...genericObjectDefaults('node'), ...eventsDefaults() };
    const container = { ...genericObjectDefaults('container'), ...eventsDefaults() };
    const target = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };

    append(container, object);

    applyGenericObjectProps(object, { target });
    applyGenericObjectProps(container, { target });

    const onClick = vitest.fn();

    applyEventProps(object, {
      onClick,
    });

    propagatePointerEvent(container, 'onClick', {} as any, 50, 50);

    expect(onClick).toHaveBeenCalled();
  });

  test('pointer event - miss', () => {
    const object = { ...genericObjectDefaults('node'), ...eventsDefaults() };
    const container = { ...genericObjectDefaults('container'), ...eventsDefaults() };
    const target = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };

    append(container, object);

    applyGenericObjectProps(object, { target });
    applyGenericObjectProps(container, { target });

    const onClick = vitest.fn();

    applyEventProps(object, {
      onClick,
    });

    propagatePointerEvent(container, 'onClick', {} as any, 150, 150);

    expect(onClick).not.toHaveBeenCalled();
  });

  test('pointer event - edge inside', () => {
    const object = { ...genericObjectDefaults('node'), ...eventsDefaults() };
    const container = { ...genericObjectDefaults('container'), ...eventsDefaults() };
    const target = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };

    append(container, object);

    applyGenericObjectProps(object, { target });
    applyGenericObjectProps(container, { target });

    const onClick = vitest.fn();

    applyEventProps(object, {
      onClick,
    });

    propagatePointerEvent(container, 'onClick', {} as any, 99, 99);

    expect(onClick).toHaveBeenCalled();
  });

  test('pointer event - edge outside', () => {
    const object = { ...genericObjectDefaults('node'), ...eventsDefaults() };
    const container = { ...genericObjectDefaults('container'), ...eventsDefaults() };
    const target = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };

    append(container, object);

    applyGenericObjectProps(object, { target });
    applyGenericObjectProps(container, { target });

    const onClick = vitest.fn();

    applyEventProps(object, {
      onClick,
    });

    // The point 100,100 is outside the box 0,0,100,100 as any dimensionality to the point would extend outward.
    propagatePointerEvent(container, 'onClick', {} as any, 100, 100);

    expect(onClick).not.toHaveBeenCalled();
  });

  test('pointer event - edge (negative)', () => {
    const object = { ...genericObjectDefaults('node'), ...eventsDefaults() };
    const container = { ...genericObjectDefaults('container'), ...eventsDefaults() };
    const target = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };

    append(container, object);

    applyGenericObjectProps(object, { target });
    applyGenericObjectProps(container, { target });

    const onClick = vitest.fn();

    applyEventProps(object, {
      onClick,
    });

    propagatePointerEvent(container, 'onClick', {} as any, 0, 0);

    expect(onClick).toHaveBeenCalled();
  });

  test('events - stopPropagation', () => {
    const object = { ...genericObjectDefaults('node', 'object-1'), ...eventsDefaults() };
    const container = { ...genericObjectDefaults('container', 'container-1'), ...eventsDefaults() };
    const target = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };

    append(container, object);

    applyGenericObjectProps(object, { target });
    applyGenericObjectProps(container, { target });

    const onClick = vitest.fn();

    applyEventProps(object, {
      onClick: (e) => {
        e.stopPropagation();
      },
    });

    applyEventProps(container, {
      onClick,
    });

    propagatePointerEvent(container, 'onClick', {} as any, 50, 50, { bubbles: true });

    expect(onClick).not.toHaveBeenCalled();
  });

  test('events - preventDefault', () => {
    expect.assertions(2);

    const object = { ...genericObjectDefaults('node', 'object-1'), ...eventsDefaults() };
    const container = { ...genericObjectDefaults('container', 'container-1'), ...eventsDefaults() };
    const target = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };

    append(container, object);

    applyGenericObjectProps(object, { target });
    applyGenericObjectProps(container, { target });

    applyEventProps(object, {
      onClick: (e) => {
        expect(e.cancelled).toEqual(false);
        e.preventDefault();
      },
    });

    applyEventProps(container, {
      onClick: (e) => {
        expect(e.cancelled).toEqual(true);
      },
    });

    propagatePointerEvent(container, 'onClick', {} as any, 50, 50, { cancelable: true });
  });

  test('events - preventDefault (cancelable = false)', () => {
    expect.assertions(2);

    const object = { ...genericObjectDefaults('node', 'object-1'), ...eventsDefaults() };
    const container = { ...genericObjectDefaults('container', 'container-1'), ...eventsDefaults() };
    const target = {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    };

    append(container, object);

    applyGenericObjectProps(object, { target });
    applyGenericObjectProps(container, { target });

    applyEventProps(object, {
      onClick: (e) => {
        expect(e.cancelled).toEqual(false);
        e.preventDefault();
      },
    });

    applyEventProps(container, {
      onClick: (e) => {
        expect(e.cancelled).toEqual(false);
      },
    });

    propagatePointerEvent(container, 'onClick', {} as any, 50, 50, { cancelable: false });
  });

  test('touch event', () => {
    const container = { ...genericObjectDefaults('container', 'container-1'), ...eventsDefaults() };
    const object1 = { ...genericObjectDefaults('node', 'object-1'), ...eventsDefaults() };
    const object2 = { ...genericObjectDefaults('node', 'object-1'), ...eventsDefaults() };
    const object3 = { ...genericObjectDefaults('node', 'object-1'), ...eventsDefaults() };

    append(container, object1);
    append(container, object2);
    append(container, object3);

    applyGenericObjectProps(container, { target: { x: 0, y: 0, width: 300, height: 100 } });
    applyGenericObjectProps(object1, { target: { x: 0, y: 0, width: 100, height: 100 } });
    applyGenericObjectProps(object2, { target: { x: 100, y: 0, width: 100, height: 100 } });
    applyGenericObjectProps(object3, { target: { x: 200, y: 0, width: 100, height: 100 } });

    const onTouchStart1 = vitest.fn();
    const onTouchStart2 = vitest.fn();
    const onTouchStart3 = vitest.fn();

    applyEventProps(object1, { onTouchStart: onTouchStart1 });
    applyEventProps(object2, { onTouchStart: onTouchStart2 });
    applyEventProps(object3, { onTouchStart: onTouchStart3 });

    // 2 touches, object1 and object3
    const touches = [
      { x: 50, y: 50 }, // object 1
      { x: 250, y: 50 }, // object 3
    ];

    propagateTouchEvent(container, 'onTouchStart', {} as any, touches);

    expect(onTouchStart1).toHaveBeenCalled();
    expect(onTouchStart2).not.toHaveBeenCalled();
    expect(onTouchStart3).toHaveBeenCalled();
  });
});
