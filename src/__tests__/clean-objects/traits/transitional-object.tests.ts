import { applyGenericObjectProps, genericObjectDefaults } from '../../../clean-objects/traits/generic-object';
import {
  applyTransitionalObjectProps,
  hasPending,
  runObjectTransitions,
  transitionalObjectDefaults,
} from '../../../clean-objects/traits/transitional-object';
import { easingFunctions } from '../../../utility/easing-functions';
import { DnaFactory } from '@atlas-viewer/dna';
import {
  applyTransitionalContainerProps,
  getContainerDuration,
  runContainerTransitions,
  transitionalContainerDefaults,
} from '../../../clean-objects/traits/transitional-container';
import { append } from '../../../clean-objects/traits/container';
import { expect } from 'vitest';

describe('Transitional objects', function () {
  test('simple - target 300ms easeInOut', () => {
    const object = {
      ...genericObjectDefaults('node'),
      ...transitionalObjectDefaults(),
    };

    applyTransitionalObjectProps(object, {
      transition: 'target 300ms easeInOutExpo',
    });

    expect(object.transitions.props).toEqual('target 300ms easeInOutExpo');
    expect(object.transitions.parsed.target).toEqual({
      duration: 300,
      ease: easingFunctions.easeInOutExpo,
    });
  });

  test('simple - target easeInOut', () => {
    const object = {
      ...genericObjectDefaults('node'),
      ...transitionalObjectDefaults(),
    };

    applyTransitionalObjectProps(object, {
      transition: 'target easeInOutExpo',
    });

    expect(object.transitions.props).toEqual('target easeInOutExpo');
    expect(object.transitions.parsed.target).toEqual({
      duration: 1000,
      ease: easingFunctions.easeInOutExpo,
    });
  });

  test('simple with extra spaces - target 0.3s easeInOut', () => {
    const object = {
      ...genericObjectDefaults('node'),
      ...transitionalObjectDefaults(),
    };

    applyTransitionalObjectProps(object, {
      transition: 'target  0.3s  easeInOutExpo',
    });

    expect(object.transitions.props).toEqual('target  0.3s  easeInOutExpo');
    expect(object.transitions.parsed.target).toEqual({
      duration: 300,
      ease: easingFunctions.easeInOutExpo,
    });
  });

  test('list of string values', () => {
    const object = {
      ...genericObjectDefaults('node'),
      ...transitionalObjectDefaults(),
    };

    applyTransitionalObjectProps(object, {
      transition: ['target 0.3s easeInOutExpo', 'crop 0.5s easeOutExpo'],
    });

    expect(object.transitions.parsed.target).toEqual({
      duration: 300,
      ease: easingFunctions.easeInOutExpo,
    });
    expect(object.transitions.parsed.crop).toEqual({
      duration: 500,
      ease: easingFunctions.easeOutExpo,
    });
  });

  test('single object', () => {
    const object = {
      ...genericObjectDefaults('node'),
      ...transitionalObjectDefaults(),
    };

    applyTransitionalObjectProps(object, {
      transition: { type: 'target', duration: 300, ease: 'easeInBack' },
    });

    expect(object.transitions.parsed.target).toEqual({
      duration: 300,
      ease: easingFunctions.easeInBack,
    });
  });

  test('single object compact type', () => {
    const object = {
      ...genericObjectDefaults('node'),
      ...transitionalObjectDefaults(),
    };

    applyTransitionalObjectProps(object, {
      transition: { type: 'target easeOutExpo', duration: 300 },
    });

    expect(object.transitions.parsed.target).toEqual({
      duration: 300,
      ease: easingFunctions.easeOutExpo,
    });
  });

  test('list of objects', () => {
    const object = {
      ...genericObjectDefaults('node'),
      ...transitionalObjectDefaults(),
    };

    applyTransitionalObjectProps(object, {
      transition: [
        { type: 'target easeOutExpo', duration: 300 },
        { type: 'crop', duration: 500 },
      ],
    });

    expect(object.transitions.parsed.target).toEqual({
      duration: 300,
      ease: easingFunctions.easeOutExpo,
    });
    expect(object.transitions.parsed.crop).toEqual({
      duration: 500,
      ease: easingFunctions.easeOutExpo,
    });
  });

  test('list of objects with conflicts', () => {
    const object = {
      ...genericObjectDefaults('node'),
      ...transitionalObjectDefaults(),
    };

    applyTransitionalObjectProps(object, {
      transition: [
        { type: 'target easeOutExpo', duration: 300 },
        'target 500ms easeInExpo',
        { type: 'target', duration: 900, ease: 'easeInBack' },
      ],
    });

    expect(object.transitions.parsed.target).toEqual({
      duration: 900,
      ease: easingFunctions.easeInBack,
    });
  });

  describe('Transitioning props', function () {
    test('linear transition test', () => {
      const object = {
        ...genericObjectDefaults('node'),
        ...transitionalObjectDefaults(),
      };

      // 200x200 box.
      applyGenericObjectProps(object, { target: { height: 200, width: 200 } });
      applyTransitionalObjectProps(object, { transition: 'target 100ms linear' });
      applyGenericObjectProps(object, { target: { height: 400, width: 400 } });

      expect(object.transitions.target).toEqual({
        constrain: false,
        done: false,
        ease: easingFunctions.linear,
        elapsedTime: 0,
        from: DnaFactory.singleBox(200, 200),
        to: DnaFactory.singleBox(400, 400),
        totalTime: 100,
      });

      runObjectTransitions(object, 0);
      expect(object.points).toEqual(DnaFactory.singleBox(200, 200));
      expect(hasPending(object)).toEqual(true);

      runObjectTransitions(object, 50);
      expect(object.points).toEqual(DnaFactory.singleBox(300, 300));
      expect(hasPending(object)).toEqual(true);

      runObjectTransitions(object, 50);
      expect(object.points).toEqual(DnaFactory.singleBox(400, 400));
      expect(hasPending(object)).toEqual(false);

      expect(object.transitions.target?.done).toEqual(true);
    });
  });

  test('transitional container', () => {
    const object = {
      ...genericObjectDefaults('node'),
      ...transitionalObjectDefaults(),
    };

    const container = {
      ...genericObjectDefaults('container'),
      ...transitionalContainerDefaults(),
    };

    append(container, object);

    applyGenericObjectProps(container, { target: { height: 200, width: 200 } });

    // Transition the child element
    applyGenericObjectProps(object, { target: { height: 200, width: 200 } });
    applyTransitionalObjectProps(object, { transition: 'target 100ms linear' });
    applyGenericObjectProps(object, { target: { height: 400, width: 400 } });

    expect(container.activeTransitions.done).toEqual(false);
    expect(container.activeTransitions.objects).toHaveLength(1);
    expect(getContainerDuration(container)).toEqual(100);

    runObjectTransitions(object, 50);

    expect(container.activeTransitions.done).toEqual(false);
    expect(container.activeTransitions.objects).toHaveLength(1);
    expect(getContainerDuration(container)).toEqual(50);

    runObjectTransitions(object, 50);

    expect(container.activeTransitions.done).toEqual(true);
    expect(container.activeTransitions.objects).toHaveLength(0);
    expect(getContainerDuration(container)).toEqual(0);
  });

  test('transitional container (running)', () => {
    const object = {
      ...genericObjectDefaults('node'),
      ...transitionalObjectDefaults(),
    };

    const container = {
      ...genericObjectDefaults('container'),
      ...transitionalContainerDefaults(),
    };

    append(container, object);

    applyGenericObjectProps(container, { target: { height: 200, width: 200 } });

    // Transition the child element
    applyGenericObjectProps(object, { target: { height: 200, width: 200 } });
    applyTransitionalObjectProps(object, { transition: 'target 100ms linear' });
    applyGenericObjectProps(object, { target: { height: 400, width: 400 } });

    expect(container.activeTransitions.done).toEqual(false);
    expect(container.activeTransitions.objects).toHaveLength(1);
    expect(getContainerDuration(container)).toEqual(100);

    runContainerTransitions(container, 50);

    expect(container.activeTransitions.done).toEqual(false);
    expect(container.activeTransitions.objects).toHaveLength(1);
    expect(getContainerDuration(container)).toEqual(50);

    // Testing a paused step.
    applyTransitionalContainerProps(container, { transitionsPaused: true });
    runContainerTransitions(container, 50);

    expect(container.activeTransitions.paused).toEqual(true);
    expect(container.activeTransitions.done).toEqual(false);
    expect(container.activeTransitions.objects).toHaveLength(1);
    expect(getContainerDuration(container)).toEqual(50);

    // And back to normal.
    applyTransitionalContainerProps(container, { transitionsPaused: false });
    runContainerTransitions(container, 50);

    expect(container.activeTransitions.done).toEqual(true);
    expect(container.activeTransitions.objects).toHaveLength(0);
    expect(getContainerDuration(container)).toEqual(0);
  });
});
