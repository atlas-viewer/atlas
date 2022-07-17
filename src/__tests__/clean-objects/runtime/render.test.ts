import { applyGenericObjectProps, genericObjectDefaults } from '../../../clean-objects/traits/generic-object';
import { eventsDefaults } from '../../../clean-objects/traits/evented';
import { getDefaultRenderState, render } from '../../../clean-objects/runtime/render';
import { DnaFactory } from '@atlas-viewer/dna';
import { append } from '../../../clean-objects/traits/container';

describe('new render', function () {
  test('render simple object', () => {
    const object = { ...genericObjectDefaults('node'), ...eventsDefaults() };

    applyGenericObjectProps(object, {
      target: { x: 0, y: 0, width: 100, height: 100 },
    });

    const state = getDefaultRenderState(object, { x: 0, y: 0, width: 100, height: 100 });

    // Utilities:
    // - Create partial hooks
    // - Compose hooks
    // - Create render

    const hooks = {
      useFrame: vitest.fn(),
      isReady: vitest.fn().mockReturnValue(true),
      afterFrame: vitest.fn(),
      useAfterPaint: vitest.fn(),
      useBeforeFrame: vitest.fn(),
      useOnReady: vitest.fn(),
      usePaint: vitest.fn(),
      usePendingUpdate: vitest.fn().mockReturnValue(false),
      usePrepareLayer: vitest.fn().mockReturnValue(true),
      useTransition: vitest.fn(),
    };

    render(16, state, hooks);

    expect(state.firstRender).toEqual(false);
    expect(state.lastTarget).toEqual(DnaFactory.singleBox(100, 100, 0, 0));
    expect(state.target).toEqual(DnaFactory.singleBox(100, 100, 0, 0));
    expect(state.lastTime).toEqual(16);

    // Lifecycle hooks.
    expect(hooks.useFrame).toBeCalledTimes(1);
    expect(hooks.usePendingUpdate).toBeCalledTimes(1);
    expect(hooks.useTransition).toBeCalledTimes(1);

    // Change hooks.
    expect(hooks.isReady).toBeCalledTimes(1);
    expect(hooks.afterFrame).toBeCalledTimes(1);
    expect(hooks.useBeforeFrame).toBeCalledTimes(1);
    expect(hooks.useOnReady).toBeCalledTimes(1);
    // Rendering hooks.
    expect(hooks.usePaint).toBeCalledTimes(1);
    expect(hooks.usePaint).toBeCalledWith(object, 0, 0, 0, 100, 100, state);
    expect(hooks.useAfterPaint).toBeCalledTimes(1);
    expect(hooks.usePrepareLayer).toBeCalledTimes(1);
  });

  test('render nested object', () => {
    const object = { ...genericObjectDefaults('container'), ...eventsDefaults() };

    applyGenericObjectProps(object, {
      target: { x: 0, y: 0, width: 100, height: 100 },
    });

    const child1 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
    applyGenericObjectProps(child1, {
      target: { x: 0, y: 0, width: 50, height: 50 },
    });
    const child2 = { ...genericObjectDefaults('node'), ...eventsDefaults() };
    applyGenericObjectProps(child2, {
      target: { x: 50, y: 0, width: 50, height: 50 },
    });

    append(object, child1);
    append(object, child2);

    const state = getDefaultRenderState(object, { x: 0, y: 0, width: 100, height: 100 });

    function getHooks() {
      return {
        useFrame: vitest.fn(),
        isReady: vitest.fn().mockReturnValue(true),
        afterFrame: vitest.fn(),
        useAfterPaint: vitest.fn(),
        useBeforeFrame: vitest.fn(),
        useOnReady: vitest.fn(),
        usePaint: vitest.fn(),
        usePendingUpdate: vitest.fn().mockReturnValue(false),
        usePrepareLayer: vitest.fn().mockReturnValue(true),
        useTransition: vitest.fn(),
      };
    }

    const hooks = getHooks();

    render(16, state, hooks);

    expect(state.firstRender).toEqual(false);
    expect(state.lastTarget).toEqual(DnaFactory.singleBox(100, 100, 0, 0));
    expect(state.target).toEqual(DnaFactory.singleBox(100, 100, 0, 0));
    expect(state.lastTime).toEqual(16);

    // Lifecycle hooks.
    expect(hooks.useFrame).toBeCalledTimes(1);
    expect(hooks.usePendingUpdate).toBeCalledTimes(1);
    expect(hooks.useTransition).toBeCalledTimes(1);

    // Change hooks.
    expect(hooks.isReady).toBeCalledTimes(1);
    expect(hooks.afterFrame).toBeCalledTimes(1);
    expect(hooks.useBeforeFrame).toBeCalledTimes(1);
    expect(hooks.useOnReady).toBeCalledTimes(1);

    // Rendering hooks.
    expect(hooks.useAfterPaint).toBeCalledTimes(2);
    expect(hooks.usePrepareLayer).toBeCalledTimes(2);
    expect(hooks.usePaint).toBeCalledTimes(2);
    expect(hooks.usePaint).toBeCalledWith(child1, 0, 0, 0, 50, 50, state);
    expect(hooks.usePaint).toBeCalledWith(child2, 0, 50, 0, 50, 50, state);

    // No state has changed, so nothing should be rendered.
    const hooks2 = getHooks();
    render(16, state, hooks2);

    // Always called
    expect(hooks2.useFrame).toBeCalledTimes(1);
    expect(hooks2.usePendingUpdate).toBeCalledTimes(1);
    expect(hooks2.useTransition).toBeCalledTimes(1);

    expect(hooks2.isReady).toBeCalledTimes(0);
    expect(hooks2.afterFrame).toBeCalledTimes(0);
    expect(hooks2.useBeforeFrame).toBeCalledTimes(0);
    expect(hooks2.useOnReady).toBeCalledTimes(0);

    expect(hooks2.useAfterPaint).toBeCalledTimes(0);
    expect(hooks2.usePrepareLayer).toBeCalledTimes(0);
    expect(hooks2.usePaint).toBeCalledTimes(0);
  });
});
