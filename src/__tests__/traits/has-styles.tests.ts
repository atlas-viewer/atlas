import { hasStylesDefaults, applyHasStylesProps, hasStyles } from '../../clean-objects/traits/has-styles';
import { eventsDefaults, dispatchEvent } from '../../clean-objects/traits/evented';
import { hasRevision, revisionDefaults } from '../../clean-objects/traits/revision';

describe('Has styles', function () {
  const createDefaults = () => ({ ...hasStylesDefaults(), ...eventsDefaults(), ...revisionDefaults() });

  test('simple styles', () => {
    const object = createDefaults();

    applyHasStylesProps(object, {
      style: {
        opacity: 1,
      },
    });

    expect(object.style.rules).toMatchInlineSnapshot(`
      {
        "opacity": 1,
      }
    `);
  });
  test('simple hover styles', () => {
    const object = createDefaults();

    applyHasStylesProps(object, {
      style: {
        opacity: 1,
        ':hover': {
          opacity: 0.5,
        },
      },
    });

    expect(object.style.rules).toMatchInlineSnapshot(`
      {
        "opacity": 1,
      }
    `);
    expect(object.style.hoverRules).toMatchInlineSnapshot(`
      {
        "opacity": 0.5,
      }
    `);
    expect(object.events.handlers.onMouseDown).toHaveLength(0);
    expect(object.events.handlers.onMouseUp).toHaveLength(0);
    expect(object.events.handlers.onPointerEnter).toHaveLength(1);
    expect(object.events.handlers.onPointerLeave).toHaveLength(1);
  });
  test('simple active styles', () => {
    const object = createDefaults();

    applyHasStylesProps(object, {
      style: {
        opacity: 1,
        ':active': {
          opacity: 0.5,
        },
      },
    });

    expect(object.style.rules).toMatchInlineSnapshot(`
      {
        "opacity": 1,
      }
    `);
    expect(object.style.activeRules).toMatchInlineSnapshot(`
      {
        "opacity": 0.5,
      }
    `);
    expect(object.events.handlers.onMouseDown).toHaveLength(1);
    expect(object.events.handlers.onMouseUp).toHaveLength(1);
    expect(object.events.handlers.onPointerEnter).toHaveLength(0);
    expect(object.events.handlers.onPointerLeave).toHaveLength(0);
  });
  test('active and hover styles', () => {
    const object = createDefaults();

    applyHasStylesProps(object, {
      style: {
        opacity: 1,
        ':active': {
          opacity: 0.5,
        },
        ':hover': {
          opacity: 0.25,
        },
      },
    });

    expect(object.style.rules).toMatchInlineSnapshot(`
      {
        "opacity": 1,
      }
    `);
    expect(object.style.activeRules).toMatchInlineSnapshot(`
      {
        "opacity": 0.5,
      }
    `);
    expect(object.style.hoverRules).toMatchInlineSnapshot(`
      {
        "opacity": 0.25,
      }
    `);
    expect(object.events.handlers.onMouseDown).toHaveLength(1);
    expect(object.events.handlers.onMouseUp).toHaveLength(1);
    expect(object.events.handlers.onPointerEnter).toHaveLength(1);
    expect(object.events.handlers.onPointerLeave).toHaveLength(1);
  });

  test('border', () => {
    const object = createDefaults();

    expect(
      applyHasStylesProps(object, {
        style: { border: '2px solid green' },
      })
    ).toEqual(true);

    expect(object.style.rules?.borderWidth).toEqual('2px');
    expect(object.style.rules?.borderStyle).toEqual('solid');
    expect(object.style.rules?.borderColor).toEqual('green');
  });
  test('outline', () => {
    const object = createDefaults();

    expect(
      applyHasStylesProps(object, {
        style: { outline: '4px solid rgba(255, 255, 255, .4)' },
      })
    ).toEqual(true);

    expect(object.style.rules?.outlineWidth).toEqual('4px');
    expect(object.style.rules?.outlineStyle).toEqual('solid');
    expect(object.style.rules?.outlineColor).toEqual('rgba(255, 255, 255, .4)');
  });

  test('hasStyles + hasRevision', () => {
    expect(hasStyles({})).toEqual(false);
    expect(hasStyles(createDefaults())).toEqual(true);
    expect(hasStyles(hasStylesDefaults())).toEqual(true);
    expect(hasRevision({})).toEqual(false);
    expect(hasRevision(createDefaults())).toEqual(true);
    expect(hasRevision(hasStylesDefaults())).toEqual(false);
  });

  test('update styles', () => {
    const object = createDefaults();

    expect(
      applyHasStylesProps(object, {
        style: {
          backgroundColor: 'blue',
        },
      })
    ).toEqual(true);
    expect(
      applyHasStylesProps(object, {
        style: {
          backgroundColor: 'blue',
        },
      })
    ).toEqual(false);

    expect(object.style.rules?.backgroundColor).toEqual('blue');
  });

  test('Not changing if not changed', () => {
    const object = createDefaults();

    expect(applyHasStylesProps(object, {})).toEqual(false);
    expect(
      applyHasStylesProps(object, {
        style: {},
      })
    ).toEqual(false);
    expect(
      applyHasStylesProps(object, {
        style: { background: 'red' },
      })
    ).toEqual(true);
    expect(
      applyHasStylesProps(object, {
        style: { background: 'blue' },
      })
    ).toEqual(true);
    expect(
      applyHasStylesProps(object, {
        style: { background: 'blue' },
      })
    ).toEqual(false);
    expect(
      applyHasStylesProps(object, {
        style: { background: 'red' },
      })
    ).toEqual(true);
  });

  test('Not changing if not changed (hover)', () => {
    const object = createDefaults();

    expect(
      applyHasStylesProps(object, {
        style: {
          ':hover': {},
        },
      })
    ).toEqual(true); // for the events.
    expect(
      applyHasStylesProps(object, {
        style: {
          ':hover': {},
        },
      })
    ).toEqual(false);
    expect(
      applyHasStylesProps(object, {
        style: { ':hover': { background: 'red' } },
      })
    ).toEqual(true);
    expect(
      applyHasStylesProps(object, {
        style: { ':hover': { background: 'blue' } },
      })
    ).toEqual(true);
    expect(
      applyHasStylesProps(object, {
        style: { ':hover': { background: 'blue' } },
      })
    ).toEqual(false);
    expect(
      applyHasStylesProps(object, {
        style: { ':hover': { background: 'red' } },
      })
    ).toEqual(true);
  });

  test('Not changing if not changed (active)', () => {
    const object = createDefaults();

    expect(
      applyHasStylesProps(object, {
        style: {
          ':active': {},
        },
      })
    ).toEqual(true); // for the events.
    expect(
      applyHasStylesProps(object, {
        style: {
          ':active': {},
        },
      })
    ).toEqual(false);
    expect(
      applyHasStylesProps(object, {
        style: { ':active': { background: 'red' } },
      })
    ).toEqual(true);
    expect(
      applyHasStylesProps(object, {
        style: { ':active': { background: 'blue' } },
      })
    ).toEqual(true);
    expect(
      applyHasStylesProps(object, {
        style: { ':active': { background: 'blue' } },
      })
    ).toEqual(false);
    expect(
      applyHasStylesProps(object, {
        style: { ':active': { background: 'red' } },
      })
    ).toEqual(true);
  });

  test('relative', () => {
    const object = createDefaults();

    expect(object.style.relative).toEqual(false);
    expect(
      applyHasStylesProps(object, {
        relativeStyle: false,
      })
    ).toEqual(false);
    expect(object.style.relative).toEqual(false);
    expect(
      applyHasStylesProps(object, {
        relativeStyle: true,
      })
    ).toEqual(true);
    expect(object.style.relative).toEqual(true);
    expect(
      applyHasStylesProps(object, {
        relativeStyle: false,
      })
    ).toEqual(true);
    expect(object.style.relative).toEqual(false);
    expect(
      applyHasStylesProps(object, {
        relativeStyle: false,
      })
    ).toEqual(false);
    expect(object.style.relative).toEqual(false);
  });

  test('class name', () => {
    const object = createDefaults();

    expect(applyHasStylesProps(object, { className: 'test' })).toEqual(true);
    expect(object.style.className).toEqual('test');
    expect(applyHasStylesProps(object, { className: 'test' })).toEqual(false);
    expect(applyHasStylesProps(object, { className: 'test-2' })).toEqual(true);
    expect(object.style.className).toEqual('test-2');
    expect(applyHasStylesProps(object, {})).toEqual(true);
    expect(object.style.className).toEqual(null);
  });

  test('hover events', () => {
    const object = createDefaults();

    applyHasStylesProps(object, {
      style: {
        background: 'blue',
        ':hover': { background: 'red' },
      },
    });

    expect(object.style.isHovering).toEqual(false);
    dispatchEvent(object, 'pointerenter', {});
    expect(object.style.isHovering).toEqual(true);
    dispatchEvent(object, 'pointerleave', {});
    expect(object.style.isHovering).toEqual(false);

    expect(object.revision.id).toEqual(2);
  });

  test('active events', () => {
    const object = createDefaults();

    applyHasStylesProps(object, {
      style: {
        background: 'blue',
        ':active': { background: 'red' },
      },
    });

    expect(object.style.isActive).toEqual(false);
    dispatchEvent(object, 'mousedown', {});
    expect(object.style.isActive).toEqual(true);
    dispatchEvent(object, 'mouseup', {});
    expect(object.style.isActive).toEqual(false);

    expect(object.revision.id).toEqual(2);
  });

  test('unset hover', () => {
    const object = createDefaults();
    expect(
      applyHasStylesProps(object, {
        style: {
          ':hover': { background: 'red' },
        },
      })
    ).toEqual(true);
    expect(
      applyHasStylesProps(object, {
        style: {},
      })
    ).toEqual(true);

    expect(object.style.hoverRules).toEqual(null);
  });
  test('unset active', () => {
    const object = createDefaults();
    expect(
      applyHasStylesProps(object, {
        style: {
          ':active': { background: 'red' },
        },
      })
    ).toEqual(true);
    expect(
      applyHasStylesProps(object, {
        style: {},
      })
    ).toEqual(true);

    expect(object.style.activeRules).toEqual(null);
  });
});
