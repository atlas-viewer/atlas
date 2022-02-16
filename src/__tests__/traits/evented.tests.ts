import {
  addEventListener,
  removeEventListener,
  eventsDefaults,
  dispatchEvent,
  applyEventProps,
} from '../../clean-objects/traits/evented';

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

    const clickCb = jest.fn();
    addEventListener(exampleEvented, 'click', clickCb);

    expect(dispatchEvent(exampleEvented, 'click', {}, false)).toEqual(true);
    expect(clickCb).toHaveBeenCalled();
  });

  test('dispatchEvent (capture=true)', () => {
    const exampleEvented = eventsDefaults();

    const captureCb = jest.fn();
    addEventListener(exampleEvented, 'click', captureCb, { capture: true });
    const clickCb = jest.fn();
    addEventListener(exampleEvented, 'click', clickCb, { capture: false });

    expect(dispatchEvent(exampleEvented, 'click', {}, true)).toEqual(true);
    expect(captureCb).toHaveBeenCalled();
    expect(clickCb).not.toHaveBeenCalled();
  });

  test('dispatchEvent with errors', () => {
    const exampleEvented = eventsDefaults();

    const before = jest.fn();
    const error = () => {
      throw new Error();
    };
    const after = jest.fn();
    console.error = jest.fn();

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

    const wheel = jest.fn();
    const first = jest.fn();

    applyEventProps(exampleEvents, {
      onClick: first,
      onWheel: wheel,
    });

    expect(exampleEvents.events.handlers.onClick).toHaveLength(1);
    expect(exampleEvents.events.handlers.onWheel).toHaveLength(1);

    const second = jest.fn();
    applyEventProps(exampleEvents, {
      onClick: second,
    });

    expect(exampleEvents.events.handlers.onClick).toHaveLength(1);
    expect(exampleEvents.events.handlers.onWheel).toHaveLength(0);
  });
});
